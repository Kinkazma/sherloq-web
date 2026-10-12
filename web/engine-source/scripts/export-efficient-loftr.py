"""Export the actual Apache-licensed EfficientLoFTR FP32/full checkpoint.

Native sources and parameters are preserved. The export copy replaces tensor
len() with dynamic sizes; separate image branches support any pair dimensions.
"""
from pathlib import Path
import ast
import argparse
import copy
import hashlib
import json
import shutil
import sys
import types
import warnings

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--resources-root',type=Path,required=True,help='Directory containing pinned upstream/efficientloftr and weights/eloftr_outdoor.ckpt')
parser.add_argument('--reference-image',type=Path,required=True,help='Textured photograph for tracing and native parity; no image is embedded in the model')
args=parser.parse_args()
ROOT=args.resources_root.resolve()
sys.path.insert(0, str(ROOT / 'python-dependencies'))
import torch
import numpy as np
import onnx
import onnxruntime as ort
from loguru import logger

torch.set_num_threads(2)
torch.set_num_interop_threads(1)
upstream = ROOT / 'upstream/efficientloftr'
export_source = ROOT / 'export-source'
shutil.copytree(upstream / 'src', export_source / 'src', dirs_exist_ok=True)
changes = []
for file in (export_source / 'src').rglob('*.py'):
    original = file.read_text()
    modified = original.replace("len(data['mconf'])", "data['mconf'].shape[0]")
    modified = modified.replace("stride = data['hw0_f'][0] // data['hw0_c'][0]", "stride = self.config['resolution'][0] // self.config['resolution'][1]")
    modified = modified.replace('mask_border(mask, self.border_rm, False)', 'mask = portable_border_mask(mask, self.border_rm)')
    if file.name == 'coarse_matching.py':
        modified += '''\n\ndef portable_border_mask(m, b):\n    h0,w0,h1,w1=m.shape[1:]\n    return torch.nn.functional.pad(m[:,b:h0-b,b:w0-b,b:h1-b,b:w1-b],(b,b,b,b,b,b,b,b),value=False)\n'''
    modified = modified.replace('mask_v, all_j_ids = mask.max(dim=2)', 'mask_values, all_j_ids = mask.to(torch.uint8).max(dim=2)\n        mask_v = mask_values > 0')
    modified = modified.replace('conf_matrix.reshape(m, -1)', 'conf_matrix.reshape(m, WW * WW)')
    if modified != original:
        changes.append(str(file.relative_to(export_source)))
        file.write_text(modified)
sys.path.insert(0, str(export_source))
# Import only the actual NaN sanitation helper, without training/Lightning.
tree = ast.parse((upstream / 'src/utils/misc.py').read_text())
node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'detect_NaN')
misc = types.ModuleType('src.utils.misc')
misc.__dict__.update(torch=torch, logger=logger)
exec(compile(ast.Module(body=[node], type_ignores=[]), str(upstream / 'src/utils/misc.py'), 'exec'), misc.__dict__)
sys.modules['src.utils.misc'] = misc
from src.loftr import LoFTR, full_default_cfg, reparameter
from src.loftr.utils.coarse_matching import mask_border,portable_border_mask
for h0,w0,h1,w1 in [(4,4,4,8),(8,10,10,8),(16,20,20,16)]:
    test_mask=torch.rand(1,h0,w0,h1,w1)>.5
    expected=test_mask.clone();mask_border(expected,2,False)
    assert torch.equal(expected,portable_border_mask(test_mask,2)), 'Border mask equivalence failed'


class IgnoredTrainingMetadata:
    pass


checkpoint = ROOT / 'weights/eloftr_outdoor.ckpt'
with torch.serialization.safe_globals([(IgnoredTrainingMetadata, 'pytorch_lightning.callbacks.model_checkpoint.ModelCheckpoint')]):
    saved = torch.load(checkpoint, map_location='cpu', weights_only=True)
native = LoFTR(copy.deepcopy(full_default_cfg)).eval()
native.load_state_dict(saved['state_dict'], strict=True)
del saved
native = reparameter(native).eval()


class Pair(torch.nn.Module):
    def __init__(self, matcher):
        super().__init__()
        self.matcher = matcher

    def forward(self, image0, image1, threshold):
        self.matcher.coarse_matching.thr = threshold
        data = {'image0': image0, 'image1': image1}
        self.matcher(data)
        return data['mkpts0_f'], data['mkpts1_f'], data['mconf']


class SeparableRoPE(torch.nn.Module):
    """Bit-identical original half-precision lookup coefficients, factored by axis."""
    def __init__(self, original):
        super().__init__()
        self.register_buffer('sin_y',original.sin[:,:,:1,0::4].clone(),persistent=False)
        self.register_buffer('sin_x',original.sin[:,:1,:,2::4].clone(),persistent=False)
        self.register_buffer('cos_y',original.cos[:,:,:1,0::4].clone(),persistent=False)
        self.register_buffer('cos_x',original.cos[:,:1,:,2::4].clone(),persistent=False)

    def table(self,y,x,h,w):
        yy=y[:,:h].expand(1,h,w,64);xx=x[:,:,:w].expand(1,h,w,64)
        return torch.stack((yy,yy,xx,xx),-1).flatten(-2)

    def forward(self,x,ratio=1):
        h,w=x.shape[1:3]
        pairs=x.unflatten(-1,(-1,2));a,b=pairs.unbind(-1)
        rotated=torch.stack((-b,a),-1).flatten(-2)
        return x*self.table(self.cos_y,self.cos_x,h,w)+rotated*self.table(self.sin_y,self.sin_x,h,w)


class SelectedFinePreprocess(torch.nn.Module):
    """Gather the exact selected windows instead of unfolding all image pixels."""
    def __init__(self, original):
        super().__init__();self.original=original;self.W=original.W
    def windows(self,feature,ids,coarse_width,kernel,padding):
        h,w=feature.shape[2:];c=feature.shape[1]
        delta=torch.arange(kernel,device=feature.device,dtype=torch.long)
        y=ids[:,None,None]//coarse_width*8-padding+delta[None,:,None]
        x=ids[:,None,None]%coarse_width*8-padding+delta[None,None,:]
        valid=(y>=0)&(y<h)&(x>=0)&(x<w)
        indices=(y.clamp(0,h-1)*w+x.clamp(0,w-1)).reshape(-1,kernel*kernel)
        image=feature[0].permute(1,2,0).reshape(-1,c)
        selected=image[indices]
        return torch.where(valid.reshape(-1,kernel*kernel,1),selected,torch.zeros_like(selected))
    def forward(self,feat_c0,feat_c1,data):
        h0,w0=data['hw0_c'];h1,w1=data['hw1_c']
        first=feat_c0.transpose(1,2).reshape(1,-1,h0,w0)
        second=feat_c1.transpose(1,2).reshape(1,-1,h1,w1)
        map0=self.original.inter_fpn(first,data['feats_x2_0'],data['feats_x1_0'],8)
        map1=self.original.inter_fpn(second,data['feats_x2_1'],data['feats_x1_1'],8)
        return self.windows(map0,data['i_ids'],w0,self.W,0),self.windows(map1,data['j_ids'],w1,self.W+2,1)


class SelectedFineMatching(torch.nn.Module):
    """Keep native double-softmax; compute only nine local-regression logits."""
    def __init__(self,original):super().__init__();self.original=original
    def forward(self,feat_0,feat_1,data):
        from kornia.geometry.subpix import dsnt
        original=self.original;m=feat_0.shape[0];ww=64;c=64;w=8
        original.M=m;original.W=w;original.WW=ww;original.C=c;original.scale=1
        k=original.local_regress_slicedim
        main0,main1=feat_0[...,:-k]/c**.5,feat_1[...,:-k]/c**.5
        scores=torch.einsum('mlc,mrc->mlr',main0,main1)
        confidence=torch.softmax(scores,1)*torch.softmax(scores,2)
        confidence=confidence.reshape(m,ww,w+2,w+2)[...,1:-1,1:-1].reshape(m,ww,ww)
        original.get_fine_ds_match(confidence,data)
        left=data['idx_l'].reshape(-1);right=data['idx_r'].reshape(-1);rows=torch.arange(m,device=feat_0.device)
        # Preserve native advanced-index negative wrap (including idx=0).
        delta=torch.arange(-1,2,device=feat_0.device,dtype=torch.long)
        y=(right[:,None,None]//w+delta[None,:,None])%(w+2)
        x=(right[:,None,None]%w+delta[None,None,:])%(w+2)
        target_indices=(y*(w+2)+x).reshape(m,9)
        source=feat_0[rows,left,-k:]
        target=feat_1[rows[:,None],target_indices,-k:]/k**.5
        # Same eight-term dot product as each selected cell of native MatMul.
        logits=torch.matmul(source[:,None,:],target.transpose(1,2)).reshape(m,9)
        heatmap=torch.softmax(logits/original.local_regress_temperature,-1).reshape(m,3,3)
        coords=dsnt.spatial_expectation2d(heatmap[None],True)[0]
        original.get_fine_match_local(coords,data,1)


# Exact window indexing, including all four padded borders, is independent of
# image content. Test it directly before replacing the export-only module.
selector=SelectedFinePreprocess(native.fine_preprocess)
for h,w in [(32,64),(128,160)]:
    feature=torch.randn(1,64,h,w)
    ids=torch.tensor([0,w//8-1,(h//8)*(w//8)-1,w//8+1])
    for kernel,padding in [(8,0),(10,1)]:
        expected=torch.nn.functional.unfold(feature,kernel_size=kernel,stride=8,padding=padding).transpose(1,2).reshape(1,-1,64,kernel*kernel).transpose(2,3)[0,ids]
        actual=selector.windows(feature,ids,w//8,kernel,padding)
        assert torch.equal(expected,actual),(h,w,kernel,padding)


export_model=copy.deepcopy(native)
for layer in export_model.loftr_coarse.layers:
    if getattr(layer,'rope',False):
        original=layer.rope_pos_enc;compact=SeparableRoPE(original)
        for h,w in [(1,1),(8,10),(26,26),(64,128)]:
            test=torch.randn(1,h,w,256)
            assert torch.equal(original(test),compact(test)),(h,w)
        layer.rope_pos_enc=compact
export_model.fine_preprocess=SelectedFinePreprocess(export_model.fine_preprocess)
export_model.fine_matching=SelectedFineMatching(export_model.fine_matching)
net = Pair(export_model).eval()
native_net=Pair(native).eval()
outputs = ROOT / 'export';outputs.mkdir(exist_ok=True)
rng = np.random.default_rng(421)
# A real textured crop pair provides nonzero correspondences for tracing.
import cv2
source_image = args.reference_image.resolve()
image = cv2.imread(str(source_image), cv2.IMREAD_GRAYSCALE)
if image is None:
    raise RuntimeError('Reference photograph missing')
photo = cv2.resize(image, (320,320), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
a, b = photo[:256,:320].copy(), photo[:320,:256].copy()
sample = (torch.from_numpy(a)[None,None], torch.from_numpy(b)[None,None], torch.tensor(.2))
with torch.inference_mode():
    expected = [x.numpy() for x in net(*sample)]
assert len(expected[2]) > 0, 'Trace pair has no real matches'
publication_path = outputs / 'efficient-loftr-full-fp32.onnx'
path = outputs / 'efficient-loftr-full-fp32.building.onnx'
with torch.inference_mode(), warnings.catch_warnings(record=True) as caught:
    torch.onnx.export(net, sample, path, input_names=['image0','image1','threshold'], output_names=['keypoints0','keypoints1','confidence'],
                      dynamic_axes={'image0':{2:'height0',3:'width0'},'image1':{2:'height1',3:'width1'},'keypoints0':{0:'matches'},'keypoints1':{0:'matches'},'confidence':{0:'matches'}},
                      opset_version=17, dynamo=False, external_data=False)
    (outputs / 'export-warnings.json').write_text(json.dumps([str(w.message) for w in caught], indent=2)+'\n')
graph = onnx.load(path)
# Standard MatMul equivalents of these precise 3D Einsum expressions avoid
# dependence on an optional WebGPU Einsum kernel; no approximation is used.
rewritten = []
for index, node in enumerate(graph.graph.node):
    if node.op_type != 'Einsum':
        rewritten.append(node);continue
    equation = next(x.s.decode() for x in node.attribute if x.name == 'equation')
    if equation not in {'nlc,nsc->nls','mlc,mrc->mlr'}:
        raise RuntimeError('Unhandled exact Einsum expression: '+equation)
    transposed = node.name + '_rhs_transposed'
    rewritten.extend([onnx.helper.make_node('Transpose',[node.input[1]],[transposed],perm=[0,2,1]),
                      onnx.helper.make_node('MatMul',[node.input[0],transposed],list(node.output))])
del graph.graph.node[:]
graph.graph.node.extend(rewritten)
# Preserve the native zero-match fast path. The ORT optimizer otherwise rewrites
# a dynamic empty reshape into [0,-1], which is undefined even though the source
# shape is [0,4096]. This branch also avoids unnecessary fine/FPN work.
fine_start = next(i for i,node in enumerate(graph.graph.node) if node.name.startswith('/matcher/fine_preprocess/'))
assert any('confidence' in node.output for node in graph.graph.node[:fine_start])
fine_nodes = list(graph.graph.node[fine_start:])
point_info = [onnx.helper.make_tensor_value_info(name,onnx.TensorProto.FLOAT,['matches',2]) for name in ['keypoints0','keypoints1']]
then_graph = onnx.helper.make_graph(fine_nodes,'native_fine_matching',[],point_info)
empty_nodes = [onnx.helper.make_node('Constant',[],[name],value=onnx.helper.make_tensor(name+'_empty',onnx.TensorProto.FLOAT,[0,2],[])) for name in ['keypoints0','keypoints1']]
else_graph = onnx.helper.make_graph(empty_nodes,'native_no_matches',[],point_info)
del graph.graph.node[fine_start:]
graph.graph.node.extend([onnx.helper.make_node('Size',['confidence'],['match_count']),
                        onnx.helper.make_node('Constant',[],['zero_matches'],value=onnx.helper.make_tensor('zero_matches',onnx.TensorProto.INT64,[],[0])),
                        onnx.helper.make_node('Greater',['match_count','zero_matches'],['has_matches']),
                        onnx.helper.make_node('If',['has_matches'],['keypoints0','keypoints1'],then_branch=then_graph,else_branch=else_graph)])
# ORT's nonterminal-axis Softmax allocates two hidden full-size temporary
# tensors. Expose exactly the same transpose and innermost-axis normalization
# in the standard graph; flattening prevents the transpose optimizer from
# recreating that hidden-scratch kernel. No normalization arithmetic changes.
def portable_softmax_axes(subgraph):
    nodes=[]
    for node in subgraph.node:
        for attr in node.attribute:
            if attr.type==onnx.AttributeProto.GRAPH:portable_softmax_axes(attr.g)
        if node.op_type!='Softmax' or not any(a.name=='axis' and a.i==1 for a in node.attribute):
            nodes.append(node);continue
        p=node.name+'_portable_axis';value=node.input[0];H=onnx.helper;T=onnx.TensorProto
        nodes.extend([
            H.make_node('Shape',[value],[p+'_shape']),
            H.make_node('Constant',[],[p+'_axis'],value=H.make_tensor(p+'_axis_value',T.INT64,[1],[1])),
            H.make_node('Gather',[p+'_shape',p+'_axis'],[p+'_length'],axis=0),
            H.make_node('Constant',[],[p+'_minus'],value=H.make_tensor(p+'_minus_value',T.INT64,[1],[-1])),
            H.make_node('Concat',[p+'_minus',p+'_length'],[p+'_flat_shape'],axis=0),
            H.make_node('Transpose',[value],[p+'_transposed'],perm=[0,2,1]),
            H.make_node('Reshape',[p+'_transposed',p+'_flat_shape'],[p+'_flat']),
            H.make_node('Softmax',[p+'_flat'],[p+'_normalized'],axis=-1),
            H.make_node('Shape',[p+'_transposed'],[p+'_restore_shape']),
            H.make_node('Reshape',[p+'_normalized',p+'_restore_shape'],[p+'_restored']),
            H.make_node('Transpose',[p+'_restored'],list(node.output),perm=[0,2,1])])
    del subgraph.node[:];subgraph.node.extend(nodes)
portable_softmax_axes(graph.graph)

# Every native fine match is an independent row. Keep the once-computed FPN
# and selected windows, but bound correlation/normalization scratch to 512
# rows. Loop-carried outputs contain only pixel coordinates, never CNN maps.
# This preserves row order, all matches, thresholds and native argmax ties.
fine_graph=next(attr.g for node in graph.graph.node if node.op_type=='If' for attr in node.attribute if attr.name=='then_branch')
fine_begin=next(i for i,node in enumerate(fine_graph.node) if node.name.startswith('/matcher/fine_matching/'))
fine_body=list(fine_graph.node[fine_begin:]);del fine_graph.node[fine_begin:]
H=onnx.helper;T=onnx.TensorProto;p='fine_chunks'
def constant(name,dtype,dims,data):return H.make_node('Constant',[],[p+'_'+name],value=H.make_tensor(p+'_'+name,dtype,dims,data))
def value_info(name,dtype,shape):return H.make_tensor_value_info(p+'_'+name,dtype,shape)
fine_graph.node.extend([
    H.make_node('Size',['confidence'],[p+'_count']),constant('chunk',T.INT64,[],[512]),constant('last',T.INT64,[],[511]),
    H.make_node('Add',[p+'_count',p+'_last'],[p+'_numerator']),H.make_node('Div',[p+'_numerator',p+'_chunk'],[p+'_trips']),
    constant('condition',T.BOOL,[],[True]),constant('axes',T.INT64,[1],[0]),constant('empty',T.FLOAT,[0,2],[])])
body=[H.make_node('Mul',[p+'_iteration',p+'_chunk'],[p+'_start']),
      H.make_node('Add',[p+'_start',p+'_chunk'],[p+'_limit']),H.make_node('Min',[p+'_limit',p+'_count'],[p+'_end']),
      H.make_node('Unsqueeze',[p+'_start',p+'_axes'],[p+'_starts']),H.make_node('Unsqueeze',[p+'_end',p+'_axes'],[p+'_ends'])]
row_aliases={}
for i,name in enumerate(['/matcher/fine_preprocess/Where_output_0','/matcher/fine_preprocess/Where_1_output_0',
                          '/matcher/coarse_matching/GatherND_output_0','/matcher/coarse_matching/GatherND_1_output_0','confidence']):
    row_aliases[name]=p+'_input_'+str(i)
    body.append(H.make_node('Slice',[name,p+'_starts',p+'_ends',p+'_axes'],[row_aliases[name]]))
for node in fine_body:
    for i,name in enumerate(node.input):node.input[i]=row_aliases.get(name,name)
    for field in [node.input,node.output]:
        for i,name in enumerate(field):
            if name in ['keypoints0','keypoints1']:field[i]=name+'_chunk'
body.extend(fine_body)
body.extend([H.make_node('Identity',[p+'_condition_in'],[p+'_condition_out']),
             H.make_node('Concat',[p+'_previous0','keypoints0_chunk'],[p+'_next0'],axis=0),
             H.make_node('Concat',[p+'_previous1','keypoints1_chunk'],[p+'_next1'],axis=0)])
body_graph=H.make_graph(body,'independent_fine_match_rows',
    [value_info('iteration',T.INT64,[]),value_info('condition_in',T.BOOL,[]),value_info('previous0',T.FLOAT,[None,2]),value_info('previous1',T.FLOAT,[None,2])],
    [value_info('condition_out',T.BOOL,[]),value_info('next0',T.FLOAT,[None,2]),value_info('next1',T.FLOAT,[None,2])])
fine_graph.node.append(H.make_node('Loop',[p+'_trips',p+'_condition',p+'_empty',p+'_empty'],['keypoints0','keypoints1'],body=body_graph))
# PyTorch emits Identity aliases for shared initializer tensors. Resolve these
# names in nested If captures too; ORT otherwise cannot safely rename implicit
# inputs and warns while retaining duplicate graph weights. Values are exact.
initializers={tensor.name for tensor in graph.graph.initializer}
aliases={}
for node in graph.graph.node:
    source=aliases.get(node.input[0],node.input[0]) if node.op_type=='Identity' else None
    if source in initializers and node.output[0] not in {'keypoints0','keypoints1','confidence'}:
        aliases[node.output[0]]=source
kept=[node for node in graph.graph.node if not(node.op_type=='Identity' and node.output[0] in aliases)]
del graph.graph.node[:];graph.graph.node.extend(kept)
def resolve_captures(subgraph):
    for node in subgraph.node:
        for i,name in enumerate(node.input):node.input[i]=aliases.get(name,name)
        for attr in node.attribute:
            if attr.type==onnx.AttributeProto.GRAPH:resolve_captures(attr.g)
            elif attr.type==onnx.AttributeProto.GRAPHS:
                for child in attr.graphs:resolve_captures(child)
resolve_captures(graph.graph)
onnx.checker.check_model(graph)
onnx.save(graph,path)
options = ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
session = ort.InferenceSession(str(path), sess_options=options, providers=['CPUExecutionProvider'])
cases = [('overlap-different-shapes',a,b,.2),('equal-shapes',photo,photo.copy(),.2),
         ('no-matches',np.zeros((256,320),np.float32),np.ones((320,256),np.float32),.2),
         ('higher-threshold',a,b,.8),('smaller-shapes',a[:128,:160],b[:160,:128],.2)]
records = []
for name,first,second,threshold in cases:
    inputs = {'image0':first[None,None],'image1':second[None,None],'threshold':np.array(threshold,np.float32)}
    with torch.inference_mode():expected = [x.numpy() for x in native_net(*(torch.from_numpy(v) for v in inputs.values()))]
    actual = session.run(None,inputs)
    record = {'case':name,'matches':len(expected[2]),'actualMatches':len(actual[2]),'shapesMatch':all(x.shape==y.shape for x,y in zip(expected,actual))}
    if record['shapesMatch']:
        record['maximumAbsolute']=[float(np.max(np.abs(x-y))) if x.size else 0 for x,y in zip(expected,actual)]
        record['meanAbsolute']=[float(np.mean(np.abs(x-y))) if x.size else 0 for x,y in zip(expected,actual)]
    records.append(record)
    np.savez(outputs/(name+'.npz'),**inputs,keypoints0=expected[0],keypoints1=expected[1],confidence=expected[2])
    (outputs / 'native-onnx-parity.json').write_text(json.dumps(records,indent=2)+'\n')
    print(json.dumps(record),flush=True)
    if not record['shapesMatch'] or record['matches']!=record['actualMatches'] or record['maximumAbsolute'][0]!=0 or record['maximumAbsolute'][1]>.35 or record['maximumAbsolute'][2]>2e-5:
        raise RuntimeError('Native FP32 parity failed: '+name)
# Atomically publish only a numerically verified model, preserving prior stages.
path.replace(publication_path);path=publication_path
manifest = {'schema':'sherloq.efficient-loftr/1','sourceCommit':'ffd4a4644064354468eb1f0c7a3e732233cb732f','license':'Apache-2.0','variant':'full','precision':'float32','checkpointSha256':hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
            'file':path.name,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'inputNames':['image0','image1','threshold'],'outputNames':['keypoints0','keypoints1','confidence'],
            'dynamicDimensions':['height0','width0','height1','width1','matches'],'batch':1,'dimensionMultiple':32,'exportSourceChanges':changes,'parity':records,
            'operators':sorted({node.op_type for node in graph.graph.node}),
            'portableChanges':['dynamic match count, fixed architectural stride8, exact boolean max via uint8 mask','exact 3D Einsum-to-Transpose/MatMul','native zero-match If branch','bit-identical RoPE axis factorization; no generated full-size constants','initializer Identity aliases resolved in nested captures','exact selected-window gather instead of full-image unfold','exact nine-logit local regression instead of full correlation matrix','exact Slice/Pad border mask instead of eight ScatterND clones; avoids ORT GPU boolean-broadcast bug','explicit contiguous Softmax axis; no hidden nonterminal scratch','independent native fine rows in bounded 512-row Loop; all matches retained'],
            'traceReferenceSha256':hashlib.sha256(source_image.read_bytes()).hexdigest()}
(outputs/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({k:v for k,v in manifest.items() if k not in {'parity','operators'}},indent=2),flush=True)
