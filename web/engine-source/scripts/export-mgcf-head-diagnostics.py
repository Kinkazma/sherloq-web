"""Expose existing ST head values without replacing any arithmetic."""
from pathlib import Path
import hashlib,json,copy
import onnx
root=Path(__file__).resolve().parents[1];base=root/'.build/segmentation-models/mgcfdn-st'
spec=json.loads((base/'gpu-split.json').read_text())['stages'][1]
data=(base/spec['file']).read_bytes();assert len(data)==spec['bytes'] and hashlib.sha256(data).hexdigest()==spec['sha256']
m=onnx.shape_inference.infer_shapes(onnx.load_model_from_string(data),data_prop=True)
prefix='/network/multi_granularity_consistency_module/'
names=[prefix+n+'_output_0' for n in ['MatMul','Mul_4','TopK','aspp/Concat','MatMul_1','Concat_11']]+['/network/decode_head/decode_head.0/Conv_output_0']
values={v.name:v for v in list(m.graph.value_info)+list(m.graph.output)}
for name in names:m.graph.output.append(copy.deepcopy(values[name]))
onnx.checker.check_model(m);file=base/'gpu-head-diagnostic.onnx';onnx.save(m,file);b=file.read_bytes()
report=dict(schema=1,file=file.name,bytes=len(b),sha256=hashlib.sha256(b).hexdigest(),source=spec,outputs=[v.name for v in m.graph.output],scriptSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
(base/'gpu-head-diagnostic.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
