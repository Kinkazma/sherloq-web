"""Native global-average boundaries from the verified UNet on generated input."""
from pathlib import Path
import sys,json,hashlib
import numpy as np
import torch
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.d2prl import load
torch.set_num_threads(8);assert torch.__version__.split('+')[0]=='2.8.0';model=load('cpu')['model'];base=root/'.build/d2prl-model';out=root/'.build/d2prl-mean';out.mkdir(exist_ok=True);ref=json.loads((base/'reference.json').read_text());records=[]
def save(name,tensor):
 a=tensor.detach().contiguous().numpy();data=a.tobytes();file=name+'.bin';(out/file).write_bytes(data);return dict(file=file,shape=list(a.shape),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
def capture(name,value,result):
 prefix='mean-'+str(len(records));assert value.dtype==torch.float32 and value.is_contiguous();records.append(dict(name=name,channels=value.shape[1],height=value.shape[2],width=value.shape[3],input=save(prefix+'-input',value),sum=save(prefix+'-sum',value.sum(dim=(2,3),keepdim=True)),output=save(prefix+'-output',result)));print(name,list(value.shape),flush=True)
handles=[]
for name,layer in model.unet.named_modules():
 if isinstance(layer,torch.nn.AdaptiveAvgPool2d):
  def hook(layer,args,result,name=name):capture(name,args[0],result)
  handles.append(layer.register_forward_hook(hook))
e=ref['input'];data=(base/e['file']).read_bytes();assert hashlib.sha256(data).hexdigest()==e['sha256'];image=torch.from_numpy(np.frombuffer(data,np.float32).copy().reshape(e['shape']))
with torch.inference_mode():model.unet(image)
for h in handles:h.remove()
generator=torch.Generator().manual_seed(290115)
for channels,side in [(2,7),(17,14),(64,28),(128,56),(64,112),(16,224)]:
 for kind in ['noise','signed','steps']:
  shape=(1,channels,side,side)
  if kind=='noise':value=torch.rand(shape,generator=generator)
  elif kind=='signed':value=torch.randn(shape,generator=generator)
  else:value=(torch.arange(np.prod(shape)).reshape(shape)%31-15).float()/32
  capture(f'generated-{channels}-{side}-{kind}',value,torch.nn.functional.adaptive_avg_pool2d(value,1))
(out/'reference.json').write_text(json.dumps(dict(schema=1,scope='Native UNet54 global-average boundaries and18 synthetic reductions; native prepared source and actual weights, no complete inference claim',torch=torch.__version__,referenceThreads=8,records=records),indent=2)+'\n')
