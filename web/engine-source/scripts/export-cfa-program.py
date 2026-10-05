"""Lossless graph/weight manifest for the exact-order CFA operator worker."""
from pathlib import Path
import json,hashlib
import onnx,numpy as np
from onnx import numpy_helper as nh,helper
root=Path(__file__).resolve().parents[1];out=root/'.build/cfa-m2';ref=json.loads((out/'reference.json').read_text());models=[]
for record in ref['models']:
 m=onnx.load(out/record['onnxFile']);weights=[];initializers={};offset=0
 for t in m.graph.initializer:
  a=nh.to_array(t);assert a.dtype==np.float32
  initializers[t.name]=dict(offset=offset,dims=list(a.shape));weights.append(a.ravel());offset+=a.size
 nodes=[]
 for n in m.graph.node:
  attrs={}
  for a in n.attribute:
   value=helper.get_attribute_value(a)
   if isinstance(value,onnx.TensorProto):value=nh.to_array(value).tolist()
   if isinstance(value,bytes):value=value.decode()
   attrs[a.name]=value
  nodes.append(dict(op=n.op_type,name=n.name,inputs=list(n.input),outputs=list(n.output),attrs=attrs))
 program=dict(nodes=nodes,initializers=initializers,input=m.graph.input[0].name,output=m.graph.output[0].name,blockParameter='AveragePool',checkpointSha256=record['checkpointSha256'])
 stem=Path(record['onnxFile']).stem;path=out/(stem+'.program.json');path.write_text(json.dumps(program,separators=(',',':'))+'\n');wp=out/(stem+'.weights.f32');np.concatenate(weights).astype('<f4').tofile(wp)
 digest=lambda p:dict(file=p.name,bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest())
 models.append(dict(variant=record['variant'],checkpointSha256=record['checkpointSha256'],program=digest(path),weights=digest(wp)))
(out/'program-manifest.json').write_text(json.dumps(dict(schema=1,models=models),separators=(',',':'))+'\n')
