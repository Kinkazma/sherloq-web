"""Export actual TNT parameters and the unchanged downstream ONNX subgraph.

Requires the pinned native conversion from export-segmentation-study.py. No
activation captures are needed or emitted, and no training or download occurs.
"""
from pathlib import Path
import copy,hashlib,json,sys
import numpy as np
import torch,torch.utils.model_zoo
import onnx
from onnx import helper as H,TensorProto as T
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.clone_models import load_segmentation
base=root/'.build/segmentation-models/mgcfdn-tnt';out=root/'.build/tnt-backbone-candidate';out.mkdir(exist_ok=True);(out/'parameters').mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def deny(*a,**k):raise RuntimeError('Offline checkpoint export')
torch.hub.download_url_to_file=deny;torch.utils.model_zoo.load_url=deny
ref=json.loads((base/'reference.json').read_text());checkpoint='c83f0d1a2840ebfdfafbf5c7ed842f8b5756c8975a6e6aff18cf73f95fbba56e'
assert list(ref['weights'].values())==[checkpoint]
assert sha(base/'unfolded.onnx')=='cfd67861cef605e84ce7db5fa79cf9e194db79c6cdd25f195dcb402103a969f3'
loaded=load_segmentation(ref['variant'],'cpu');assert loaded['weights']==ref['weights'];model=loaded['model'].eval();parameters={}
for key,tensor in model.visual_feature_extractor.state_dict().items():
    if key=='outer_tokens':continue # Allocated but never consumed by native forward.
    a=np.ascontiguousarray(tensor.detach().numpy());assert a.dtype==np.float32;b=a.tobytes();digest=hashlib.sha256(b).hexdigest();file='parameters/'+digest+'.bin';(out/file).write_bytes(b)
    parameters[key]=dict(file=file,bytes=len(b),sha256=digest,shape=list(a.shape),dtype='float32')
for module in model.visual_feature_extractor.modules():
    if isinstance(module,torch.nn.LayerNorm):assert module.eps==1e-5
    if isinstance(module,torch.nn.Dropout):assert not module.training
assert len(parameters)==361
backbone=dict(schema=1,kind='tnt-native-order-v1',inputShape=[1,3,256,256],epsilon=1e-5,parameters=parameters)
(out/'backbone.json').write_text(json.dumps(backbone,indent=2)+'\n')
graph=onnx.load(base/'unfolded.onnx');boundary=next(n.input[0] for n in graph.graph.node if n.op_type=='ReduceL2' and n.name.startswith('/network/multi_granularity_consistency_module/'))
wanted={'logits','probability'};selected=[]
for node in reversed(graph.graph.node):
    if any(name in wanted and name!=boundary for name in node.output):selected.append(copy.deepcopy(node));wanted.update(node.input)
selected.reverse()
for node in selected:
    for i,value in enumerate(node.input):
        if value==boundary:node.input[i]='features'
constants=[copy.deepcopy(v) for v in graph.graph.initializer if v.name in wanted]
tail=H.make_graph(selected,'tnt-consistency-decoder',[H.make_tensor_value_info('features',T.FLOAT,[1,640,16,16])],[copy.deepcopy(graph.graph.output[i]) for i in [0,1]],constants)
part=H.make_model(tail,opset_imports=graph.opset_import,ir_version=graph.ir_version);onnx.checker.check_model(part);onnx.save(part,out/'tail.onnx')
spec=lambda name:dict(file=name,bytes=(out/name).stat().st_size,sha256=sha(out/name))
manifest=dict(schema=1,id='mgcfdn-tnt-native-order-v1',variant='mgcfdn-tnt',side=256,kind='sigmoid',checkpointSha256=checkpoint,backbone=spec('backbone.json'),tail=spec('tail.onnx'))
(out/'bundle.json').write_text(json.dumps(manifest,indent=2)+'\n')
identity=dict(id=manifest['id'],variant='MGCFDN TNT 16×16',family='tnt',side=256,kind='sigmoid',bytes=(out/'bundle.json').stat().st_size,sha256=sha(out/'bundle.json'),checkpointSha256=checkpoint,backbone=manifest['backbone'],tail=manifest['tail'],status='experimental-cpu-corpus',cpuContinuousBitExact=False)
(out/'model-identity.json').write_text(json.dumps(identity,indent=2)+'\n')
files={s['file']:s for s in parameters.values()};files.update({name:spec(name) for name in ['bundle.json','backbone.json','tail.onnx']})
(out/'delivery-manifest.json').write_text(json.dumps(dict(schema=1,scope='External actual checkpoint assets only; no native intermediate outputs or photos.',files=sorted(files.values(),key=lambda v:v['file'])),indent=2)+'\n');print(json.dumps(identity),flush=True)
