"""Isolate the union head and its exact native convolution/BatchNorm boundaries.
Only the existing synthetic source and verified local checkpoint are used.
"""
from pathlib import Path
import sys,json,hashlib
import numpy as np
import torch
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.d2prl import load
torch.set_num_threads(8);assert torch.__version__.split('+')[0]=='2.8.0';model=load('cpu')['model'];base=root/'.build/d2prl-model';out=root/'.build/d2prl-union';out.mkdir(exist_ok=True)
ref=json.loads((base/'reference.json').read_text());dlf=json.loads((base/'dlf-unfolded-model.json').read_text());records=[];bn=[]
def read(e):
 data=(base/e['file']).read_bytes();assert hashlib.sha256(data).hexdigest()==e['sha256'];return torch.from_numpy(np.frombuffer(data,np.float32).copy().reshape(e['shape']))
def save(name,tensor):
 a=tensor.detach().contiguous().numpy();data=a.tobytes();file=name+'.bin';(out/file).write_bytes(data);return dict(file=file,shape=list(a.shape),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
offsets=[read(e) for e in ref['patchmatch'][:4]];scores=[read(e) for e in dlf['expected'][6:]]
xc=torch.cat([offsets[0],offsets[1],scores[0],scores[2],scores[4],offsets[2],offsets[3],scores[1],scores[3],scores[5]],dim=1)
handles=[]
for index,layer in enumerate(model.last_mask):
 if isinstance(layer,torch.nn.Conv2d):
  def hook(layer,args,result,index=index):
   name='union-'+str(index);records.append(dict(name=name,padding=layer.padding[0],input=save(name+'-input',args[0]),weights=save(name+'-weights',layer.weight),bias=save(name+'-bias',layer.bias),output=save(name+'-output',result)));print(name,flush=True)
  handles.append(layer.register_forward_hook(hook))
 elif isinstance(layer,torch.nn.BatchNorm2d):
  def hook(layer,args,result,index=index):
   name='union-'+str(index-1);bn.append(dict(name=name,epsilon=layer.eps,input=save(name+'-bn-input',args[0]),params=save(name+'-bn-params',torch.stack([layer.running_mean,layer.running_var,layer.weight,layer.bias])),output=save(name+'-bn-output',result),relu=save(name+'-relu',torch.relu(result))))
  handles.append(layer.register_forward_hook(hook))
with torch.inference_mode():
 value=model.last_mask(xc);unet=model.unet(read(ref['input']));overlap=torch.sum(value*unet);threshold=torch.sum(unet)*.5;choose=bool(overlap>threshold);combined=torch.where(value>unet,value,unet) if choose else value
 assert np.array_equal(combined.numpy().view(np.uint32),read(ref['raw'][0]).numpy().view(np.uint32))
 report=dict(schema=1,scope='Native union head boundaries on generated RGB448 with native PatchMatch and DLF; no browser final inference',torch=torch.__version__,referenceThreads=8,input=save('union-input',xc),sigmoid=save('union-sigmoid',value),unet=save('union-unet',unet),combineMaximum=choose,overlap=float(overlap),threshold=float(threshold),records=records,batchnorm=bn)
for h in handles:h.remove()
(out/'reference.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(combineMaximum=choose,overlap=float(overlap),threshold=float(threshold))),flush=True)
