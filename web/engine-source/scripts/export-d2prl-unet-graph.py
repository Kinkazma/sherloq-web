"""Extract the fixed448 UNet feed-forward graph for a separately qualified executor.
Parameters stay private. No downloads, retraining, native edits or publication.
"""
from pathlib import Path
import json,hashlib,collections
import numpy as np
import onnx
from onnx import helper as H,numpy_helper as N
root=Path(__file__).resolve().parents[1];base=root/'.build/d2prl-model';source=base/'heads-exact-dlf-unfolded.onnx';model=onnx.load(source);out=root/'.build/d2prl-unet-graph';out.mkdir(exist_ok=True)
target='/unet/final/final.1/Sigmoid_output_0';producers={name:node for node in model.graph.node for name in node.output};initializers={v.name:v for v in model.graph.initializer};required=set();params=set()
def visit(name):
 if not name or name=='rgb':return
 if name in initializers:params.add(name);return
 node=producers[name]
 if node.name in required:return
 required.add(node.name)
 for parent in node.input:visit(parent)
visit(target);parameters={};nodes=[]
def parameter(name,tensor):
 a=N.to_array(tensor);assert a.dtype in [np.dtype('float32'),np.dtype('int64')],(name,a.dtype)
 data=a.tobytes();file='parameter-'+str(len(parameters))+'.bin';(out/file).write_bytes(data);parameters[name]=dict(file=file,shape=list(a.shape),dtype=str(a.dtype),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
for name in sorted(params):parameter(name,initializers[name])
for node in model.graph.node:
 if node.name not in required:continue
 attrs={a.name:H.get_attribute_value(a) for a in node.attribute}
 if node.op_type=='Constant':
  assert set(attrs)=={'value'};parameter(node.output[0],attrs['value']);continue
 for k,v in attrs.items():
  if isinstance(v,bytes):attrs[k]=v.decode('ascii')
 nodes.append(dict(name=node.name,op=node.op_type,inputs=list(node.input),outputs=list(node.output),attributes=attrs))
report=dict(schema=1,status='unqualified-experimental-graph',scope='Fixed448 UNet subgraph extracted from verified-checkpoint unfolded ONNX; numerical and lifecycle qualification required before runtime use',input='rgb',inputShape=[1,3,448,448],output=target,sourceOnnxSha256=hashlib.sha256(source.read_bytes()).hexdigest(),parameters=parameters,nodes=nodes,operators=dict(collections.Counter(n['op'] for n in nodes)))
(out/'graph.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(nodes=len(nodes),parameters=len(parameters),parameterBytes=sum(e['bytes'] for e in parameters.values()),operators=report['operators'])),flush=True)
