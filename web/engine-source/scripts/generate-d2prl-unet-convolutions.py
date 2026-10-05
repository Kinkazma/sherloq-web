"""Capture all native UNet convolutions on the existing generated RGB source.
Actual weights/activations remain private; no native source or checkpoint edits.
"""
from pathlib import Path
import sys,json,hashlib
import numpy as np
import torch
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.d2prl import load
torch.set_num_threads(8);assert torch.__version__.split('+')[0]=='2.8.0';model=load('cpu')['model'];base=root/'.build/d2prl-model';out=root/'.build/d2prl-unet-convolution';out.mkdir(exist_ok=True);ref=json.loads((base/'reference.json').read_text());records=[]
def save(name,tensor):
 a=tensor.detach().contiguous().numpy();data=a.tobytes();file=name+'.bin';(out/file).write_bytes(data);return dict(file=file,shape=list(a.shape),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
if '--metadata-only' in sys.argv:
 report=json.loads((out/'reference.json').read_text());layers=dict(model.unet.named_modules())
 for row in report['records']:row['hasBias']=layers[row['name']].bias is not None
 (out/'reference.json').write_text(json.dumps(report,indent=2)+'\n');print('Bias metadata updated');sys.exit(0)
handles=[]
for name,layer in model.unet.named_modules():
 if isinstance(layer,torch.nn.Conv2d):
  def hook(layer,args,result,name=name):
   prefix='unet-'+str(len(records));assert layer.dilation==(1,1) and layer.stride[0]==layer.stride[1] and layer.padding[0]==layer.padding[1]
   bias=layer.bias if layer.bias is not None else torch.zeros(layer.out_channels)
   records.append(dict(name=name,padding=layer.padding[0],stride=layer.stride[0],groups=layer.groups,input=save(prefix+'-input',args[0]),weights=save(prefix+'-weights',layer.weight),bias=save(prefix+'-bias',bias),zeroBias=bool(torch.all(bias==0)),hasBias=layer.bias is not None,output=save(prefix+'-output',result)));print(prefix,name,list(args[0].shape),list(result.shape),flush=True)
  handles.append(layer.register_forward_hook(hook))
e=ref['input'];data=(base/e['file']).read_bytes();assert hashlib.sha256(data).hexdigest()==e['sha256'];image=torch.from_numpy(np.frombuffer(data,np.float32).copy().reshape(e['shape']))
with torch.inference_mode():result=model.unet(image)
for h in handles:h.remove()
expected=json.loads((root/'.build/d2prl-union/reference.json').read_text())['unet'];assert hashlib.sha256(result.numpy().tobytes()).hexdigest()==expected['sha256']
(out/'reference.json').write_text(json.dumps(dict(schema=1,scope='All native UNet convolution boundaries on one generated RGB448 image with actual verified checkpoint. Not browser model parity.',torch=torch.__version__,referenceThreads=8,records=records),indent=2)+'\n');print('Captured',len(records),'convolutions',flush=True)
