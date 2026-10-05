"""Unchanged Noiseprint++ weights and affine BN for the native-order operator worker."""
from pathlib import Path
import json,hashlib
import onnx,numpy as np
from onnx import numpy_helper as nh,helper
root=Path(__file__).resolve().parents[1];out=root/'.build/trufor-npp';out.mkdir(exist_ok=True)
m=onnx.load(root/'.build/trufor-native-bn/trufor-bounded.onnx');nodes=[n for n in m.graph.node if '/dncnn/' in n.name and n.op_type in ('Conv','Relu','Mul','Add')]
used={x for n in nodes for x in n.input};weights=[];initializers={};offset=0
for t in m.graph.initializer:
 if t.name not in used:continue
 a=nh.to_array(t);assert a.dtype==np.float32
 initializers[t.name]=dict(offset=offset,dims=list(a.shape));weights.append(a.ravel());offset+=a.size
program=dict(nodes=[dict(op=n.op_type,name=n.name,inputs=list(n.input),outputs=list(n.output),attrs={a.name:helper.get_attribute_value(a) for a in n.attribute}) for n in nodes],initializers=initializers,input='rgb',output=nodes[-1].output[0])
p=out/'native.program.json';p.write_text(json.dumps(program,separators=(',',':'))+'\n');w=out/'native.weights.f32';np.concatenate(weights).astype('<f4').tofile(w)
(out/'native-manifest.json').write_text(json.dumps({k:dict(file=f.name,bytes=f.stat().st_size,sha256=hashlib.sha256(f.read_bytes()).hexdigest()) for k,f in [('program',p),('weights',w)]},indent=2)+'\n')
