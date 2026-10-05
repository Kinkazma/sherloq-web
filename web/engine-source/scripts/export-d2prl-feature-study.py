"""Offline local-weight feature candidates; all generated model bytes stay in .build.
Requires the unchanged native adapter, torch2.8.0, onnx1.19.0. No training, no network.
These two fixed448 feature blocks do not constitute full D2PRL inference.
"""
from pathlib import Path
import sys,json,hashlib,collections
import torch,onnx,numpy as np
import torch.utils.model_zoo
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.d2prl import load
assert torch.__version__.split('+')[0]=='2.8.0' and onnx.__version__=='1.19.0'
# Refuse network/model downloads even if a future constructor starts requesting one.
def denied(*args,**kwargs):raise RuntimeError('Offline conversion prohibits downloads')
torch.hub.download_url_to_file=denied
torch.utils.model_zoo.load_url=denied
torch.set_num_threads(2)
loaded=load('cpu');model=loaded['model'];out=root/'.build/d2prl-study';out.mkdir(exist_ok=True)
class Features(torch.nn.Module):
 def __init__(self,model,kind):super().__init__();self.body=model.ZM_conv if kind=='zernike' else model.head_mask;self.kind=kind
 def forward(self,x):return self.body(x if self.kind=='zernike' else torch.nn.functional.pad(x,[7,7,7,7],mode='reflect'))
rng=np.random.default_rng(280003);records=[]
for kind in ['zernike','cnn']:
 wrapped=Features(model,kind).eval();x=torch.from_numpy(rng.random((1,3,448,448),dtype=np.float32));target=out/(kind+'.onnx')
 torch.onnx.export(wrapped,(x,),target,input_names=['rgb'],output_names=['features'],opset_version=18,dynamo=False,external_data=False)
 graph=onnx.load(target);onnx.checker.check_model(graph)
 with torch.inference_mode():native=wrapped(x).numpy()
 inputfile=kind+'-input.f32';outputfile=kind+'-native.f32';x.numpy().tofile(out/inputfile);native.astype('<f4').tofile(out/outputfile)
 record=dict(kind=kind,modelFile=target.name,modelBytes=target.stat().st_size,modelSha256=hashlib.sha256(target.read_bytes()).hexdigest(),inputFile=inputfile,inputSha256=hashlib.sha256((out/inputfile).read_bytes()).hexdigest(),inputShape=list(x.shape),nativeFile=outputfile,nativeShape=list(native.shape),nativeSha256=hashlib.sha256((out/outputfile).read_bytes()).hexdigest(),operators=dict(collections.Counter(node.op_type for node in graph.graph.node)))
 records.append(record);print(json.dumps(record),flush=True)
(out/'feature-reference.json').write_text(json.dumps(dict(schema=1,scope='Private generated random input; single448x448 feature-block reference per block, not complete D2PRL',torch=torch.__version__,onnx=onnx.__version__,checkpoints=loaded['weights'],records=records),indent=2)+'\n')
