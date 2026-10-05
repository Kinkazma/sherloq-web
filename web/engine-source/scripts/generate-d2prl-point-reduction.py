"""Independent generated inputs for UNet point-convolution arithmetic studies.
Only geometry is read from the native model inventory. No trained weights used.
"""
from pathlib import Path
import json,hashlib
import numpy as np
import torch
import torch.nn.functional as F
root=Path(__file__).resolve().parents[1];out=root/'.build/d2prl-point-reduction';out.mkdir(exist_ok=True);torch.set_num_threads(8);assert torch.__version__.split('+')[0]=='2.8.0'
native=json.loads((root/'.build/d2prl-unet-convolution/reference.json').read_text());shapes=sorted({(r['input']['shape'][1],r['weights']['shape'][0]) for r in native['records'] if r['output']['shape'][-2:]==[1,1]});records=[]
def save(name,a):
 data=a.tobytes();file=name+'.bin';(out/file).write_bytes(data);return dict(file=file,shape=list(a.shape),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
for ci,co in shapes:
 for case in range(4):
  rng=np.random.default_rng(940511+ci*131+co*17+case);x=rng.normal(0,3,(1,ci,1,1)).astype(np.float32);w=rng.normal(0,.13,(co,ci,1,1)).astype(np.float32);b=rng.normal(0,.7,(co,)).astype(np.float32)
  if case==1:x=np.maximum(x,0)
  if case==2:x[:,:,0,0]*=np.where(np.arange(ci)%2,100,1e-3).astype(np.float32)
  if case==3:x[:,:,0,0]*=np.where(np.arange(ci)%3,0,1).astype(np.float32)
  result=F.conv2d(torch.from_numpy(x),torch.from_numpy(w),torch.from_numpy(b)).numpy();prefix=str(ci)+'-'+str(co)+'-'+str(case)
  records.append(dict(name=prefix,channels=ci,outChannels=co,case=case,input=save(prefix+'-input',x),weights=save(prefix+'-weights',w),bias=save(prefix+'-bias',b),output=save(prefix+'-output',result)))
(out/'reference.json').write_text(json.dumps(dict(schema=1,scope='Independent seeded Gaussian, positive, dynamic-range and sparse point-convolution inputs; geometry only from UNet inventory, no trained weights',torch=torch.__version__,referenceThreads=8,records=records),indent=2)+'\n');print('Generated',len(records),'point-convolution references')
