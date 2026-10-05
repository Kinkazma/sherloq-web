"""Observe VIG's neighbour choices without modifying native inference.

Oracle inputs are isolated diagnostic fixtures; no product graph consumes them.
The diagnostic graph merely exposes existing intermediate values and indices.
"""
from pathlib import Path
import argparse, hashlib, json, sys
import numpy as np
import torch
import onnx
from onnx import helper as H, numpy_helper as N, TensorProto as T
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.clone_models import load_segmentation
parser=argparse.ArgumentParser();parser.add_argument('--case',default='paired-spots',choices=['structured-copy','paired-spots']);args=parser.parse_args()
base=root/'.build/segmentation-models/mgcfdn-vig';out=base/('topk-'+args.case);out.mkdir(exist_ok=True)
reference=json.loads((base/'reference.json').read_text());row=next(r for r in reference['records'] if r['name']==args.case)
torch.set_num_threads(reference['referenceThreads']);loaded=load_segmentation(reference['variant'],'cpu')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(base/row['input']['file'])==row['input']['sha256']
tensor=torch.from_numpy(np.fromfile(base/row['input']['file'],np.float32).reshape(row['input']['shape']))
def save(name,tensor):
    array=np.ascontiguousarray(tensor.detach().numpy());path=out/(name+'.bin');path.write_bytes(array.tobytes())
    return dict(file=path.name,bytes=path.stat().st_size,sha256=sha(path),shape=list(array.shape),dtype=str(array.dtype))
calls=[];sums=[];original=torch.topk;original_sum=torch.sum
def capture(input,k,dim=-1,largest=True,sorted=True,**kwargs):
    output=original(input,k,dim=dim,largest=largest,sorted=sorted,**kwargs)
    i=len(calls);calls.append(dict(input=save(str(i)+'-input',input),values=save(str(i)+'-values',output.values),indices=save(str(i)+'-indices',output.indices),k=k,axis=dim%input.ndim,largest=largest,sorted=sorted))
    return output
def capture_sum(input,*args,**kwargs):
    output=original_sum(input,*args,**kwargs)
    dim=kwargs.get('dim',args[0] if args else None)
    if list(input.shape)==[1,256,640] and dim in [-1,2]:
        assert list(input.stride())==[163840,1,256]
        i=len(sums);sums.append(dict(name='knn-squared-norm-'+str(i),input=save('sum-'+str(i)+'-input',input),output=save('sum-'+str(i)+'-output',output)))
    return output
torch.topk=capture
torch.sum=capture_sum
try:
    with torch.inference_mode():logits=loaded['model'](tensor)
    assert hashlib.sha256(logits.numpy().tobytes()).hexdigest()==row['logits']['sha256']
finally:torch.topk=original;torch.sum=original_sum
assert len(sums)==16
model=onnx.load(base/'unfolded.onnx');nodes=[n for n in model.graph.node if n.op_type=='TopK'];assert len(nodes)==len(calls)==17
for i,(node,call) in enumerate(zip(nodes,calls)):
    attrs={a.name:H.get_attribute_value(a) for a in node.attribute};assert attrs['axis']%len(call['input']['shape'])==call['axis'] and bool(attrs.get('largest',1))==call['largest'] and bool(attrs.get('sorted',1))==call['sorted']
    call['names']=dict(input=node.input[0],values=node.output[0],indices=node.output[1]);call['node']=node.name
    model.graph.output.extend([H.make_tensor_value_info(node.input[0],T.FLOAT,call['input']['shape']),H.make_tensor_value_info(node.output[1],T.INT64,call['indices']['shape'])])
    unit_node=H.make_node('TopK',['input','k'],['values','indices'],axis=call['axis'],largest=int(call['largest']),sorted=int(call['sorted']))
    graph=H.make_graph([unit_node],'isolated-topk',[H.make_tensor_value_info('input',T.FLOAT,call['input']['shape'])],[H.make_tensor_value_info('values',T.FLOAT,call['values']['shape']),H.make_tensor_value_info('indices',T.INT64,call['indices']['shape'])],[N.from_array(np.array([call['k']],np.int64),'k')])
    unit=H.make_model(graph,opset_imports=[H.make_opsetid('',18)],ir_version=10);onnx.checker.check_model(unit);path=out/(str(i)+'-unit.onnx');onnx.save(unit,path)
    call['unit']=dict(file=path.name,bytes=path.stat().st_size,sha256=sha(path))
onnx.checker.check_model(model);path=out/'diagnostic.onnx';onnx.save(model,path)
report=dict(schema=1,status='diagnostic-only',case=args.case,input=row['input'],model=dict(file=path.name,bytes=path.stat().st_size,sha256=sha(path)),records=calls,sums=sums,sourceModelSha256=sha(base/'unfolded.onnx'),scriptSha256=sha(Path(__file__)))
(out/'reference.json').write_text(json.dumps(report,indent=2)+'\n');print('Exported',len(calls),'unchanged native TopK calls',flush=True)
