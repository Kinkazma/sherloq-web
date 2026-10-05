"""Preserve native inference BN affine coefficients and their float32 operation order."""
from pathlib import Path
import json,hashlib,numpy as np,onnx
from onnx import helper as h,numpy_helper as nh
root=Path(__file__).resolve().parents[1];src=root/'.build/trufor-unfused';out=root/'.build/trufor-native-bn';out.mkdir(exist_ok=True)
m=onnx.load(src/'trufor-bounded.onnx');g=m.graph;init={t.name:nh.to_array(t) for t in g.initializer};nodes=[];count=0
# Exported running-variance aliases are resolved without changing their values.
for n in g.node:
 if n.op_type=='Identity' and n.input[0] in init:init[n.output[0]]=init[n.input[0]]
for n in g.node:
 if n.op_type!='BatchNormalization' or '/dncnn/' not in n.name:nodes.append(n);continue
 w,b,mean,var=[init[x] for x in n.input[1:]];eps=np.float32(next(a.f for a in n.attribute if a.name=='epsilon'))
 alpha=np.float32(np.float32(1)/np.sqrt(var+eps))*w
 beta=np.float32(b.astype(np.float64)-mean.astype(np.float64)*alpha.astype(np.float64))
 a=n.name+'/alpha';z=n.name+'/beta';value=n.name+'/scaled'
 g.initializer.extend([nh.from_array(alpha.reshape(1,-1,1,1),a),nh.from_array(beta.reshape(1,-1,1,1),z)])
 nodes.extend([h.make_node('Mul',[n.input[0],a],[value],name=n.name+'/multiply'),h.make_node('Add',[value,z],list(n.output),name=n.name+'/add')]);count+=1
assert count==15
del g.node[:];g.node.extend(nodes);onnx.checker.check_model(m);target=out/'trufor-bounded.onnx';onnx.save(m,target)
r=json.loads((src/'bounded-reference.json').read_text());r.update(file=target.name,bytes=target.stat().st_size,sha256=hashlib.sha256(target.read_bytes()).hexdigest(),nativeBatchNormalization=count,referenceDirectory='../trufor-unfused/')
(out/'bounded-reference.json').write_text(json.dumps(r,separators=(',',':'))+'\n');print(count,r['sha256'])
