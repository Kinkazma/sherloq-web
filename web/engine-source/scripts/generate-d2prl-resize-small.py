from pathlib import Path
import json,hashlib
import numpy as np
import torch
root=Path(__file__).resolve().parents[1];out=root/'.build/d2prl-resize-small';out.mkdir(exist_ok=True);torch.set_num_threads(8);assert torch.__version__.split('+')[0]=='2.8.0';records=[];rng=np.random.default_rng(290093)
def save(name,array):
 data=array.tobytes();file=name+'.bin';(out/file).write_bytes(data);return dict(file=file,shape=list(array.shape),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
for c,ih,iw,oh,ow in [(1,448,448,56,56),(64,112,112,56,56),(512,7,7,14,14),(256,14,14,28,28),(128,28,28,56,56),(3,37,46,20,23),(5,37,46,20,23),(1,56,56,56,56)]:
 for kind in ['noise','signed','steps']:
  name=f'{c}-{ih}-{iw}-{oh}-{ow}-{kind}';shape=(1,c,ih,iw)
  if kind=='noise':a=rng.random(shape,dtype=np.float32)
  elif kind=='signed':a=rng.standard_normal(shape,dtype=np.float32)
  else:a=((np.arange(np.prod(shape)).reshape(shape)%31)-15).astype(np.float32)/32
  with torch.inference_mode():b=torch.nn.functional.interpolate(torch.from_numpy(a),size=(oh,ow),mode='bilinear',align_corners=True).numpy()
  records.append(dict(name=name,channels=c,height=ih,width=iw,outHeight=oh,outWidth=ow,input=save(name+'-input',a),output=save(name+'-output',b)))
(out/'reference.json').write_text(json.dumps(dict(schema=1,scope='Synthetic native small-output contiguous float32 bilinear align_corners=True, referenceThreads8',torch=torch.__version__,records=records),indent=2)+'\n');print('Generated',len(records),'cases')
