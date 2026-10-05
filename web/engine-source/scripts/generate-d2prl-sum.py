"""Generated contiguous sums across pinned native partition boundaries."""
from pathlib import Path
import json,hashlib
import numpy as np
import torch
root=Path(__file__).resolve().parents[1];out=root/'.build/d2prl-sum';out.mkdir(exist_ok=True);torch.set_num_threads(8);assert torch.__version__.split('+')[0]=='2.8.0';rng=np.random.default_rng(553312);records=[]
def save(name,a):
 data=a.tobytes();file=name+'.bin';(out/file).write_bytes(data);return dict(file=file,shape=list(a.shape),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
for n in [1,2,3,4,7,8,9,15,16,17,255,256,257,32767,32768,32769,65535,65536,65537,200703,200704,200705,262143,262144,262145,1000003]:
 for pattern in ['normal','positive','cancellation']:
  x=rng.normal(0,1,n).astype(np.float32)
  if pattern=='positive':x=np.abs(x)
  elif pattern=='cancellation':x[::3]*=1e6
  value=torch.from_numpy(x).sum().numpy();name=str(n)+'-'+pattern;records.append(dict(name=name,referenceThreads=8,input=save(name+'-input',x),output=save(name+'-output',value)))
base=root/'.build/d2prl-union';ref=json.loads((base/'reference.json').read_text());read=lambda e:np.fromfile(base/e['file'],np.float32);unet=read(ref['unet']);union=read(ref['sigmoid'])
for name,x in [('model-unet',unet),('model-overlap',np.float32(unet*union))]:records.append(dict(name=name,referenceThreads=8,input=save(name+'-input',x),output=save(name+'-output',torch.from_numpy(x).sum().numpy())))
(out/'reference.json').write_text(json.dumps(dict(schema=1,scope='Native contiguous float32 sum, fixed reference thread partition8, generated values and native synthetic model probabilities',torch=torch.__version__,records=records),indent=2)+'\n');print('Generated',len(records),'sum cases')
