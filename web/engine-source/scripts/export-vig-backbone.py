"""Offline export of actual VIG parameters and unchanged consistency/decoder.
No training, downloads, reference activations or photos enter these assets.
"""
from pathlib import Path
import copy,hashlib,json,sys
import numpy as np
import torch,torch.utils.model_zoo,onnx
from onnx import helper as H,TensorProto as T
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.clone_models import load_segmentation
base=root/'.build/segmentation-models/mgcfdn-vig';out=root/'.build/vig-backbone-candidate';out.mkdir(exist_ok=True);(out/'parameters').mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def deny(*a,**k):raise RuntimeError('Offline checkpoint export')
torch.hub.download_url_to_file=deny;torch.utils.model_zoo.load_url=deny
ref=json.loads((base/'reference.json').read_text());torch.set_num_threads(ref['referenceThreads']);loaded=load_segmentation(ref['variant'],'cpu');assert loaded['weights']==ref['weights'];model=loaded['model'].eval();params={}
assert list(ref['weights'].values())==['63996d687b29e49f5c78f8f055395bb196ce37e31f1918817c2f197a88f1e7e6']
assert sha(base/'unfolded.onnx')=='5e402f702152dae3f29f9c461adcaee6e40467f29827e3d425f8d73fd9a8bb6f'
for key,t in model.visual_feature_extractor.state_dict().items():
 if key.endswith('num_batches_tracked'):continue
 a=np.ascontiguousarray(t.detach().numpy());assert a.dtype==np.float32;b=a.tobytes();digest=hashlib.sha256(b).hexdigest();file='parameters/'+digest+'.bin';(out/file).write_bytes(b);params[key]=dict(file=file,bytes=len(b),sha256=digest,shape=list(a.shape),dtype='float32')
modules={}
for name,m in model.visual_feature_extractor.named_modules():
 if isinstance(m,torch.nn.Conv2d):modules[name]=dict(kind='Conv',ci=m.in_channels,co=m.out_channels,k=m.kernel_size[0],pad=m.padding[0],stride=m.stride[0],groups=m.groups)
 elif isinstance(m,torch.nn.BatchNorm2d):modules[name]=dict(kind='BN',epsilon=m.eps)
 elif isinstance(m,torch.nn.GELU):modules[name]=dict(kind='GELU')
graph=onnx.load(base/'unfolded.onnx');boundary=next(n.input[0] for n in graph.graph.node if n.op_type=='ReduceL2' and n.name.startswith('/network/multi_granularity_consistency_module/'))
wanted={'logits','probability'};selected=[]
for node in reversed(graph.graph.node):
 if any(name in wanted and name!=boundary for name in node.output):selected.append(copy.deepcopy(node));wanted.update(node.input)
selected.reverse()
for node in selected:
 for i,value in enumerate(node.input):
  if value==boundary:node.input[i]='features'
constants=[copy.deepcopy(v) for v in graph.graph.initializer if v.name in wanted]
tail=H.make_graph(selected,'vig-consistency-decoder',[H.make_tensor_value_info('features',T.FLOAT,[1,640,16,16])],[copy.deepcopy(graph.graph.output[i]) for i in [0,1]],constants)
part=H.make_model(tail,opset_imports=graph.opset_import,ir_version=graph.ir_version);onnx.checker.check_model(part);onnx.save(part,out/'tail.onnx')
knn=[dict(k=block[0].graph_conv.k,dilation=block[0].graph_conv.d) for block in model.visual_feature_extractor.backbone]
(out/'backbone.json').write_text(json.dumps(dict(schema=1,kind="vig-native-order-v1",inputShape=[1,3,256,256],parameters=params,modules=modules,knn=knn),indent=2)+'\n')
assert len(params)==511 and len(modules)==206
spec=lambda name:dict(file=name,bytes=(out/name).stat().st_size,sha256=sha(out/name))
checkpoint=list(ref['weights'].values())[0]
manifest=dict(schema=1,id='mgcfdn-vig-native-order-v1',variant='mgcfdn-vig',side=256,kind='sigmoid',checkpointSha256=checkpoint,backbone=spec('backbone.json'),tail=spec('tail.onnx'))
(out/'bundle.json').write_text(json.dumps(manifest,indent=2)+'\n')
identity=dict(id=manifest['id'],variant='MGCFDN VIG 16×16',family='vig',side=256,kind='sigmoid',bytes=(out/'bundle.json').stat().st_size,sha256=sha(out/'bundle.json'),checkpointSha256=checkpoint,backbone=manifest['backbone'],tail=manifest['tail'],status='unqualified-candidate',cpuContinuousBitExact=False)
(out/'model-identity.json').write_text(json.dumps(identity,indent=2)+'\n')
files={p['file']:p for p in params.values()};files.update({name:spec(name) for name in ['bundle.json','backbone.json','tail.onnx']})
(out/'delivery-manifest.json').write_text(json.dumps(dict(schema=1,scope='External checkpoint assets only; no native captures or photos.',files=sorted(files.values(),key=lambda v:v['file'])),indent=2)+'\n');print(json.dumps(identity),flush=True)
