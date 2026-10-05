"""Expose the existing feature boundary as two sequential ONNX sessions.

No node arithmetic, checkpoint value or search geometry changes. The two
intermediate CPU tensors provide a real GPU queue/readback boundary; the
original full graph remains the CPU reference.
"""
from pathlib import Path
import hashlib,json,sys,subprocess
import onnx
from onnx.utils import Extractor

root=Path(__file__).resolve().parents[1];variant=sys.argv[1]
assert variant in ('mgcfdn','mgcfdn-st')
base=root/'.build/segmentation-models'/variant
source=base/('native-mean.onnx' if variant=='mgcfdn-st' else 'unfolded.onnx')
sha=lambda b:hashlib.sha256(b).hexdigest()
identity=json.loads(subprocess.check_output(['node','--input-type=module','-e','import {SEGMENTATION_MODELS as m} from "./experiments/segmentation/models.js";console.log(JSON.stringify(m['+json.dumps(variant)+']))'],cwd=root,text=True))
data=source.read_bytes();assert len(data)==identity['bytes'] and sha(data)==identity['sha256']
model=onnx.shape_inference.infer_shapes(onnx.load(source),data_prop=True)
nodes=list(model.graph.node);cut=next(i for i,n in enumerate(nodes) if n.name.startswith('/network/multi_granularity_consistency_module/'))
cross=sorted({v for n in nodes[:cut] for v in n.output}&{v for n in nodes[cut:] for v in n.input})
assert cross==['/network/visual_feature_extractor/Concat_4_output_0','/network/visual_feature_extractor/layer1/layer1.0/layer1.0.0/layer1.0.0.0/Constant_output_0']
values={v.name:v for v in list(model.graph.input)+list(model.graph.value_info)+list(model.graph.output)}
stages=[];extractor=Extractor(model)
for label,inputs,outputs in [('encoder',[v.name for v in model.graph.input],cross),('head',cross,[v.name for v in model.graph.output])]:
    part=extractor.extract_model(inputs,outputs);onnx.checker.check_model(part)
    file='gpu-split-'+label+'.onnx';onnx.save(part,base/file);b=(base/file).read_bytes()
    stages.append(dict(file=file,bytes=len(b),sha256=sha(b),inputs=inputs,outputs=outputs,nodes=len(part.graph.node)))
report=dict(schema=1,status='unqualified-split-candidate',variant=variant,side=identity['side'],kind=identity['kind'],sourceSha256=sha(data),checkpointSha256=identity['checkpointSha256'],stages=stages,assetBytes=sum(v['bytes'] for v in stages),
    boundary=[dict(name=name,dtype=onnx.TensorProto.DataType.Name(values[name].type.tensor_type.elem_type),shape=[d.dim_value for d in values[name].type.tensor_type.shape.dim]) for name in cross],
    scriptSha256=sha(Path(__file__).read_bytes()),scope='Unchanged ONNX nodes/initializers split at the existing complete1x640x40x40 feature tensor plus int64 scalar. No crop, approximation, training or tensor-size change. Both full global1600x1600 consistency operations remain in the head.')
(base/'gpu-split.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
