"""Extract role heads with a computed union input; no native outputs embedded."""
from pathlib import Path
import json,hashlib
import onnx
from onnx import helper as H,TensorProto
root=Path(__file__).resolve().parents[1];base=root/'.build/d2prl-model';source=base/'heads-exact-dlf-unfolded-resize-batchnorm-mean.onnx';original=onnx.load(source)
cuts=['rgb','x_cor','y_cor','x_cor2','y_cor2','union'];targets=['target','source'];producers={name:n for n in original.graph.node for name in n.output};params={i.name:i for i in original.graph.initializer};needed=set();used_params=set()
def visit(name):
 if not name or name in cuts:return
 if name in params:used_params.add(name);return
 node=producers[name]
 if node.name in needed:return
 needed.add(node.name)
 for parent in node.input:visit(parent)
for name in targets:visit(name)
old_inputs={i.name:i for i in original.graph.input};inputs=[old_inputs[name] if name in old_inputs else H.make_tensor_value_info(name,TensorProto.FLOAT,[1,1,448,448]) for name in cuts];outputs=[o for o in original.graph.output if o.name in targets]
graph=H.make_graph([n for n in original.graph.node if n.name in needed],'D2PRL roles with computed union input',inputs,outputs,[i for i in original.graph.initializer if i.name in used_params]);model=H.make_model(graph,opset_imports=list(original.opset_import));model.ir_version=original.ir_version;onnx.checker.check_model(model)
dest=base/'roles-native-resize-batchnorm.onnx';onnx.save(model,dest);ref=json.loads((base/'reference.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();report=dict(schema=1,status='unqualified-composition-study',scope='Role heads extracted from verified checkpoint with fixed native resize and BN arithmetic. Union must be computed by the caller. No injected expected tensors.',modelFile=dest.name,modelBytes=dest.stat().st_size,modelSha256=sha(dest),sourceOnnxSha256=sha(source),inputs=cuts,outputs=targets,expected=ref['raw'][1:],operators=sorted({n.op_type for n in graph.node}))
(base/'roles-native-resize-batchnorm-model.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
