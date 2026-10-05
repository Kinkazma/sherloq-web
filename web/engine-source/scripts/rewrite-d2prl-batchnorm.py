"""Replace inference BatchNormalization with native rounded affine constants.
Actual local weights only, no fitting, data-dependent correction or runtime probe.
"""
from pathlib import Path
import json,hashlib,ctypes as C,ctypes.util
import numpy as np
import onnx
from onnx import helper as H,numpy_helper as N
root=Path(__file__).resolve().parents[1];base=root/'.build/d2prl-model';source=base/'heads-exact-dlf-unfolded-resize.onnx';model=onnx.load(source)
lib=C.CDLL(ctypes.util.find_library('m'));lib.fmaf.argtypes=[C.c_float,C.c_float,C.c_float];lib.fmaf.restype=C.c_float
values={v.name:N.to_array(v) for v in model.graph.initializer};aliases={n.output[0]:n.input[0] for n in model.graph.node if n.op_type=='Identity'}
def resolve(name):
 while name in aliases:name=aliases[name]
 assert name in values,name
 return np.asarray(values[name],np.float32)
nodes=[];count=0
for item in model.graph.node:
 if item.op_type!='BatchNormalization':nodes.append(item);continue
 attrs={a.name:H.get_attribute_value(a) for a in item.attribute};assert len(item.output)==1 and attrs.get('training_mode',0)==0
 weight,bias,mean,variance=[resolve(n) for n in item.input[1:]];eps=np.float32(attrs.get('epsilon',1e-5));inv=np.float32(1)/np.sqrt(variance+eps);alpha=weight*inv;beta=np.array([lib.fmaf(-float(m),float(a),float(b)) for m,a,b in zip(mean,alpha,bias)],np.float32)
 prefix='native_bn_'+str(count)+'_';an=prefix+'alpha';bn=prefix+'beta';model.graph.initializer.extend([N.from_array(alpha.reshape(1,-1,1,1),an),N.from_array(beta.reshape(1,-1,1,1),bn)])
 nodes.extend([H.make_node('Mul',[item.input[0],an],[prefix+'product'],name=prefix+'mul'),H.make_node('Add',[prefix+'product',bn],list(item.output),name=prefix+'add')]);count+=1
model.graph.ClearField('node');model.graph.node.extend(nodes);onnx.checker.check_model(model);target=base/'heads-exact-dlf-unfolded-resize-batchnorm.onnx';onnx.save(model,target)
meta=json.loads((base/'heads-exact-dlf-unfolded-resize-model.json').read_text());meta.update(modelFile=target.name,modelBytes=target.stat().st_size,modelSha256=hashlib.sha256(target.read_bytes()).hexdigest(),batchnormCandidate='Float32 native alpha/beta constants with fused bias preparation and separate Mul/Add; fixed448 native vector-domain candidate',batchnormNodes=count,rewriterSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest());(base/'heads-exact-dlf-unfolded-resize-batchnorm-model.json').write_text(json.dumps(meta,indent=2)+'\n');print('Rewrote',count,'BatchNormalization nodes')
