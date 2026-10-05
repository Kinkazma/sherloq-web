"""Synthetic RGB byte preparation reference, not a browser codec equivalence claim."""
from pathlib import Path
import json,hashlib
import numpy as np
import torch
from torchvision import transforms as T
root=Path(__file__).resolve().parents[1];out=root/'.build/d2prl-prepare';out.mkdir(exist_ok=True);rng=np.random.default_rng(771904);torch.set_num_threads(8);assert torch.__version__.split('+')[0]=='2.8.0';records=[]
def save(name,t):
 a=t.detach().contiguous().numpy() if isinstance(t,torch.Tensor) else t;data=a.tobytes();file=name+'.bin';(out/file).write_bytes(data)
 return dict(file=file,shape=list(a.shape),bytes=len(data),dtype=str(a.dtype),sha256=hashlib.sha256(data).hexdigest())
shapes=[(1,1),(1,23),(29,1),(2,3),(11,17),(389,521),(448,448),(448,997),(997,448),(449,451),(607,809),(1025,997),(17,4097)]
for i,(h,w) in enumerate(shapes):
 rgb=rng.integers(0,256,(h,w,3),dtype=np.uint8);rgb.reshape(-1)[:min(rgb.size,256)]=np.arange(min(rgb.size,256),dtype=np.uint8)
 for pattern in ['random','edges'] if min(h,w)>10 else ['random']:
  if pattern=='edges':rgb[:h//2]=0;rgb[h//2:]=255;rgb[::2,::2,1]=127
  normalized=T.ToTensor()(rgb)[None];prepared=T.Resize((448,448))(normalized)
  prefix='prepare-'+str(len(records));records.append(dict(name=str(h)+'x'+str(w)+'-'+pattern,input=save(prefix+'-rgb',rgb),normalized=save(prefix+'-normalized',normalized),output=save(prefix+'-output',prepared)))
model=root/'.build/d2prl-model';reference=json.loads((model/'reference.json').read_text());e=reference['source'];data=(model/e['file']).read_bytes();assert hashlib.sha256(data).hexdigest()==e['sha256'];rgb=np.frombuffer(data,np.uint8).reshape(e['shape']).copy();normalized=T.ToTensor()(rgb)[None];prepared=T.Resize((448,448))(normalized);assert hashlib.sha256(prepared.numpy().tobytes()).hexdigest()==reference['input']['sha256'];records.append(dict(name='actual-synthetic-model-source',input=save('model-rgb',rgb),normalized=save('model-normalized',normalized),output=save('model-output',prepared)))
(out/'reference.json').write_text(json.dumps(dict(schema=1,scope='Generated RGB uint8 HWC to float32 NCHW antialiased bilinear448; no decoder, orientation, alpha or ICC equivalence claimed',torch=torch.__version__,referenceThreads=8,records=records),indent=2)+'\n');print('Generated',len(records),'RGB preparation cases')
