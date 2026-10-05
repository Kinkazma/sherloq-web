"""Fixed-width Torch2.8 four-lane Welford LayerNorm candidate for TNT.

No fitted corrections: only native operation order and checkpoint affine weights.
Generated/actual tensor fixtures are unit diagnostics, never model constants.
"""
from pathlib import Path
import argparse,hashlib,json,sys
import numpy as np
import torch
import onnx
from onnx import helper as H,numpy_helper as N,TensorProto as T
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.clone_models import load_segmentation
base=root/'.build/segmentation-models/mgcfdn-tnt';out=base/'layernorm';out.mkdir(exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--units-only',action='store_true');args=parser.parse_args()

def rewrite(input_name,gamma,beta,output_name,width,epsilon,prefix,diagnostic=False):
    assert width in [40,640]
    nodes=[];constants=[];serial=0
    def const(value):
        nonlocal serial
        serial+=1;name=prefix+'constant_'+str(serial);constants.append(N.from_array(np.asarray(value),name));return name
    def op(kind,*values,**attrs):
        nonlocal serial
        serial+=1;name=prefix+kind+'_'+str(serial);nodes.append(H.make_node(kind,list(values),[name],name=name,**attrs));return name
    def f(value):return const(np.array(value,np.float32))
    def fused(a,b,c):
        # The native scalar merge contracts multiply/add. Double intermediates
        # avoid an extra float32 product rounding; qualify actual outputs below.
        aa=op('Cast',a,to=T.DOUBLE);bb=op('Cast',b,to=T.DOUBLE);cc=op('Cast',c,to=T.DOUBLE)
        return op('Cast',op('Add',op('Mul',aa,bb),cc),to=T.FLOAT)
    def gather(value,index,axis):return op('Gather',value,const(np.array(index,np.int64)),axis=axis)
    def reshape(value,shape):return op('Reshape',value,const(np.array(shape,np.int64)))
    zero=f(0);vectors=width//4;chunks=(vectors+15)//16;length=min(16,vectors)
    assert vectors==chunks*length
    x=reshape(input_name,[-1,chunks,length,4]);mean=zero;moment=zero
    for j in range(length):
        value=gather(x,j,2);delta=op('Sub',value,mean)
        mean=op('Add',mean,op('Mul',delta,f(np.float32(1)/np.float32(j+1))))
        moment=op('Add',moment,op('Mul',delta,op('Sub',value,mean)))
    def merge(old,added,scalar=False):
        n,m,v=old;an,am,av=added;total=n+an;ratio=f(np.float32(an)/np.float32(total) if total else 0)
        delta=op('Sub',am,m)
        newm=fused(ratio,delta,m) if scalar else op('Add',m,op('Mul',ratio,delta))
        weighted_square=op('Mul',op('Mul',delta,delta),ratio)
        contribution=fused(weighted_square,f(n),av) if scalar else op('Add',av,op('Mul',weighted_square,f(n)))
        newv=op('Add',v,contribution)
        return total,newm,newv
    depth=max(1,(chunks-1).bit_length());stack=[(0,zero,zero) for _ in range(depth)]
    for i in range(chunks):
        stack[0]=merge(stack[0],(length,gather(mean,i,1),gather(moment,i,1)))
        mask=i+1;j=1
        while j<depth and mask&1==0:
            stack[j]=merge(stack[j],stack[j-1]);stack[j-1]=(0,zero,zero);mask>>=1;j+=1
    for i in range(1,depth):stack[0]=merge(stack[0],stack[i])
    count,m1,m2=0,zero,zero
    for lane in range(4):count,m1,m2=merge((count,m1,m2),(vectors,gather(stack[0][1],lane,1),gather(stack[0][2],lane,1)),True)
    assert count==width
    variance=op('Div',m2,f(width));rstd=op('Div',f(1),op('Sqrt',op('Add',variance,f(epsilon))))
    centered=op('Sub',reshape(input_name,[-1,width]),reshape(m1,[-1,1]))
    result=op('Add',op('Mul',op('Mul',centered,reshape(rstd,[-1,1])),gamma),beta)
    restored=op('Reshape',result,op('Shape',input_name));nodes.append(H.make_node('Identity',[restored],[output_name],name=prefix+'output'))
    if diagnostic:
        nodes.extend([H.make_node('Identity',[reshape(m1,[-1,1])],['mean']),H.make_node('Identity',[reshape(rstd,[-1,1])],['rstd'])])
    return nodes,constants

sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
ref=json.loads((base/'reference.json').read_text());torch.set_num_threads(ref['referenceThreads'])
network=load_segmentation(ref['variant'],'cpu')['model'];row=ref['records'][0];assert row['name']=='structured-copy'
handles=[];fixtures=[]
def capture(name):
    def hook(module,inputs,output):
        value=inputs[0].detach().contiguous();gamma=module.weight.detach();beta=module.bias.detach()
        y,mean,rstd=torch.native_layer_norm(value,module.normalized_shape,gamma,beta,module.eps)
        assert torch.equal(output,y)
        fixtures.append((name,value.numpy().copy(),gamma.numpy().copy(),beta.numpy().copy(),y.numpy().copy(),mean.numpy().copy().reshape(-1,1),rstd.numpy().copy().reshape(-1,1),module.eps))
    return hook
for name,mod in network.named_modules():
    if name in ['visual_feature_extractor.proj_norm1','visual_feature_extractor.blocks.0.inner_norm1','visual_feature_extractor.blocks.5.outer_norm1','visual_feature_extractor.norm']:
        handles.append(mod.register_forward_hook(capture(name)))
try:
    x=torch.from_numpy(np.fromfile(base/row['input']['file'],np.float32).reshape(row['input']['shape']))
    with torch.inference_mode():logits=network(x)
    assert hashlib.sha256(logits.numpy().tobytes()).hexdigest()==row['logits']['sha256']
finally:
    for handle in handles:handle.remove()
assert len(fixtures)==4
rng=np.random.default_rng(5608)
for width in [40,640]:
    x=rng.normal(size=(4,width)).astype(np.float32);x[1]+=1000;x[2]=np.float32(.125)
    gamma=rng.normal(size=(width,)).astype(np.float32);beta=rng.normal(size=(width,)).astype(np.float32)
    y,mean,rstd=torch.native_layer_norm(torch.from_numpy(x),[width],torch.from_numpy(gamma),torch.from_numpy(beta),1e-5)
    fixtures.append(('generated-'+str(width),x,gamma,beta,y.numpy(),mean.numpy(),rstd.numpy(),1e-5))
def save(name,array):
    array=np.ascontiguousarray(array);path=out/(name+'.bin');path.write_bytes(array.tobytes());return dict(file=path.name,shape=list(array.shape),bytes=path.stat().st_size,sha256=sha(path))
records=[]
for i,(name,x,gamma,beta,y,mean,rstd,eps) in enumerate(fixtures):
    nodes,constants=rewrite('input','gamma','beta','output',x.shape[-1],eps,'unit_',True)
    constants.extend([N.from_array(gamma,'gamma'),N.from_array(beta,'beta')])
    graph=H.make_graph(nodes,'native-layernorm-candidate',[H.make_tensor_value_info('input',T.FLOAT,list(x.shape))],[H.make_tensor_value_info('output',T.FLOAT,list(y.shape)),H.make_tensor_value_info('mean',T.FLOAT,list(mean.shape)),H.make_tensor_value_info('rstd',T.FLOAT,list(rstd.shape))],constants)
    model=H.make_model(graph,opset_imports=[H.make_opsetid('',18)],ir_version=10);onnx.checker.check_model(model);path=out/('unit-'+str(i)+'.onnx');onnx.save(model,path)
    records.append(dict(name=name,input=save(str(i)+'-input',x),output=save(str(i)+'-output',y),mean=save(str(i)+'-mean',mean),rstd=save(str(i)+'-rstd',rstd),model=dict(file=path.name,bytes=path.stat().st_size,sha256=sha(path))))
(out/'reference.json').write_text(json.dumps(dict(schema=1,records=records),indent=2)+'\n')
if not args.units_only:
    model=onnx.load(base/'unfolded.onnx');values={v.name:N.to_array(v) for v in model.graph.initializer};aliases={n.output[0]:n.input[0] for n in model.graph.node if n.op_type=='Identity'}
    def resolve(name):
        while name in aliases:name=aliases[name]
        return values[name]
    nodes=[];count=0
    for node in model.graph.node:
        if node.op_type=='LayerNormalization':
            attrs={a.name:H.get_attribute_value(a) for a in node.attribute};assert attrs['axis']==-1 and len(node.output)==1
            width=resolve(node.input[1]).size
            replacement,constants=rewrite(*node.input,node.output[0],width,attrs['epsilon'],'native_ln_'+str(count)+'_')
            nodes.extend(replacement);model.graph.initializer.extend(constants);count+=1
        else:nodes.append(node)
    assert count==75;model.graph.ClearField('node');model.graph.node.extend(nodes);onnx.checker.check_model(model);path=base/'native-layernorm.onnx';onnx.save(model,path)
    report=dict(schema=1,status='unqualified-arithmetic-candidate',model=dict(file=path.name,bytes=path.stat().st_size,sha256=sha(path)),nodes=count,scriptSha256=sha(Path(__file__)))
    path.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
print('Native LayerNorm units:',len(records),flush=True)
