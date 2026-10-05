"""Export original learned operators for an out-of-core global TruFor encoder.

All artifacts stay in M2's build directory. Inputs to global attention include
the complete key bank; the feature rectifier and fusion use global reductions.
This exporter alone does not qualify a large-image runtime.
"""
from pathlib import Path
import sys,importlib.util,json,hashlib
import numpy as np
import torch,onnx
from onnx import numpy_helper
root=Path(__file__).resolve().parents[1];out=root/'.build/trufor-segments';out.mkdir(exist_ok=True)
native=root.parent/'source/gui/TruFor_main/test_docker';sys.path.insert(0,str(native/'src'))
from config import _C
from models.cmx.builder_np_conf import myEncoderDecoder
spec=importlib.util.spec_from_file_location('segment_modules',root/'scripts/trufor-segment-modules.py');m=importlib.util.module_from_spec(spec);sys.modules[spec.name]=m;spec.loader.exec_module(m)
torch.set_num_threads(2);cfg=_C.clone();cfg.merge_from_file(str(native/'src/trufor.yaml'));cfg.freeze();model=myEncoderDecoder(cfg=cfg);weights=native/'weights/trufor-state.pt';model.load_state_dict(torch.load(weights,map_location='cpu',weights_only=True)['state_dict']);model.eval();assets={};stages=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def export(name,module,args,names,outputs=('result',),dynamic=None):
 path=out/(name+'.onnx');module.eval()
 with torch.inference_mode():torch.onnx.export(module,tuple(args),path,input_names=names,output_names=list(outputs),opset_version=19,dynamo=False,external_data=False,do_constant_folding=False,dynamic_axes=dynamic if dynamic is not None else {key:{2:key+'_h',3:key+'_w'} for key in [*names,*outputs]})
 # Fold literal Casts only. Do not fuse activation normalization into weights.
 graph=onnx.load(path);values={t.name:numpy_helper.to_array(t) for t in graph.graph.initializer};nodes=[]
 for node in graph.graph.node:
  if node.op_type=='Constant':
   value=next((a.t for a in node.attribute if a.name=='value'),None)
   if value is not None:values[node.output[0]]=numpy_helper.to_array(value)
  if node.op_type=='Cast' and node.input[0] in values:
   typ=next(a.i for a in node.attribute if a.name=='to');array=values[node.input[0]].astype(onnx.helper.tensor_dtype_to_np_dtype(typ));values[node.output[0]]=array;graph.graph.initializer.append(numpy_helper.from_array(array,node.output[0]));continue
  nodes.append(node)
 del graph.graph.node[:];graph.graph.node.extend(nodes);onnx.checker.check_model(graph);onnx.save(graph,path)
 assets[name]={'file':path.name,'bytes':path.stat().st_size,'sha256':sha(path),'graphOptimizationLevel':'disabled'};return name
with torch.inference_mode():
 for stage,c in enumerate([64,128,320,512],1):
  h,w=max(4,32//2**(stage-1)),max(6,48//2**(stage-1));x=torch.randn(1,c,h,w);entry={'channels':c,'stride':4 if stage==1 else 2,'radius':3 if stage==1 else 1,'streams':[]};prefix=f's{stage}'
  for branch in ['', 'extra_']:
   patch=getattr(model.backbone,branch+'patch_embed'+str(stage));dummy=torch.zeros(1,patch.proj.in_channels,patch.proj.kernel_size[0]+patch.proj.stride[0]*3,48)
   label=prefix+('-rgb' if not branch else '-npp');stream={'patch':export(label+'-patch',m.PatchWindow(patch),[dummy],['x']),'blocks':[]}
   for j,b in enumerate(getattr(model.backbone,branch+'block'+str(stage))):
    bank=m.KeyValues(b)(x);kv=bank.flatten(2).transpose(1,2).reshape(1,-1,2,b.attn.num_heads,c//b.attn.num_heads).permute(2,0,3,1,4);p=label+f'-b{j}';stream['blocks'].append({'sr':b.attn.sr_ratio,'heads':b.attn.num_heads,'kv':export(p+'-kv',m.KeyValues(b),[x],['x']),'query':export(p+'-query',m.QueryWindow(b),[x[:,:,:1,:3],kv[0].transpose(-2,-1),kv[1]],['x','key','value'],dynamic={'x':{2:'h',3:'w'},'key':{3:'keys'},'value':{2:'keys'},'result':{2:'h',3:'w'}}),'mlp':export(p+'-mlp',m.MlpWindow(b),[x],['x'])})
   stream['norm']=export(label+'-norm',m.Norm(getattr(model.backbone,branch+'norm'+str(stage))),[x],['x']);entry['streams'].append(stream)
  frm=model.backbone.FRMs[stage-1];entry['rectifyWeights']=export(prefix+'-rectify-weights',m.RectifyWeights(frm),[torch.zeros(1,4*c)],['stats'],dynamic={})
  channel=m.RectifyWeights(frm)(torch.zeros(1,4*c));entry['rectify']=export(prefix+'-rectify',m.RectifyWindow(frm),[x,x,channel],['a','b','channel'],outputs=['left','right'],dynamic={k:{2:k+'_h',3:k+'_w'} for k in ['a','b','left','right']})
  ffm=model.backbone.FFMs[stage-1];cross=ffm.cross;heads=cross.cross_attn.num_heads;entry['fusionHeads']=heads;entry['fusionScale']=cross.cross_attn.scale;entry['fusion']=[]
  for b in [1,2]:
   p=prefix+f'-cross{b}';y,u=m.CrossPrepare(getattr(cross,'channel_proj'+str(b)),getattr(cross,'act'+str(b)))(x)
   entry['fusion'].append({'context':export(p+'-context',m.CrossContextFromX(cross,b),[x],['x'],dynamic={'x':{2:'h',3:'w'}}),'apply':export(p+'-apply',m.CrossApplyFromX(cross,b),[x,torch.zeros(1,heads,c//heads,c//heads)],['x','context'],dynamic={k:{2:'h',3:'w'} for k in ['x','result']})})
  entry['channel']=export(prefix+'-channel',m.ChannelWindow(ffm.channel_emb),[x,x],['a','b']);stages.append(entry);print('exported stage',stage,flush=True)
 heads=[]
 for name in ['decode_head','decode_head_conf']:
  head=getattr(model,name);entry={'projects':[],'channels':head.num_classes}
  for i,c in enumerate([64,128,320,512],1):
   layer=getattr(head,'linear_c'+str(i)).proj;x=torch.zeros(1,c,5,7)
   if i==1:graph=export(name+f'-project{i}',m.HeadProject(layer),[x],['x'])
   else:graph=export(name+f'-project{i}',m.HeadSample(layer),[x,torch.zeros(1,3,13,2)],['x','grid'],dynamic={'x':{2:'fh',3:'fw'},'grid':{1:'oh',2:'ow'},'result':{2:'oh',3:'ow'}})
   entry['projects'].append(graph)
  entry['fuse']=export(name+'-fuse',m.HeadFuse(head),[torch.zeros(1,512,3,13)]*4,['c4','c3','c2','c1']);heads.append(entry)
 final=export('final-window',m.FinalWindow(),[torch.zeros(1,2,5,7),torch.zeros(1,1,5,7),torch.zeros(1,3,27,2)],['pred','conf','grid'],outputs=['map','confidence','difference','raw_confidence'],dynamic={'pred':{2:'fh',3:'fw'},'conf':{2:'fh',3:'fw'},'grid':{1:'oh',2:'ow'},**{key:{2:'oh',3:'ow'} for key in ['map','confidence','difference','raw_confidence']}})
 score=export('image-score',m.ImageScore(model.detection),[torch.zeros(1,8)],['stats'],dynamic={})
 cases=[]
 for i,(h,w) in enumerate([(65,97),(128,160)]):
  rng=np.random.default_rng(934+i);rgb=torch.from_numpy(rng.integers(0,256,(1,3,h,w),dtype=np.uint8).astype(np.float32))/256
  npp=model.dncnn(rgb).repeat(1,3,1,1);rgb=model.prepro(rgb);features=model.backbone(rgb,npp);pred,conf,det=model.encode_decode(rgb,npp);files={}
  for name,t in [('rgb',rgb),('npp',npp),('map',pred.softmax(1)[:,1:2]),('confidence',conf.sigmoid()),('score',det.sigmoid()),*[(f'feature{k+1}',t) for k,t in enumerate(features)]]:
   file=f'case{i}-{name}.f32';t.numpy().astype('<f4').tofile(out/file);files[name]={'file':file,'dims':list(t.shape)}
  cases.append({'id':i,'width':w,'height':h,'files':files})
record={'schema':1,'checkpointSha256':sha(weights),'assets':assets,'stages':stages,'heads':heads,'final':final,'score':score,'cases':cases,'scope':'native encoder operators; global attention/reductions required by runtime'}
(out/'manifest.json').write_text(json.dumps(record,indent=2)+'\n');print({'graphs':len(assets),'bytes':sum(a['bytes'] for a in assets.values())},flush=True)
