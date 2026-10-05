"""Generated large-output NCHW float32 resize fixtures, native CPU8 threads."""
from pathlib import Path
import torch,numpy as np,json,hashlib
root=Path(__file__).resolve().parents[1];out=root/'.build/d2prl-resize';out.mkdir(exist_ok=True);torch.set_num_threads(8);assert torch.__version__.split('+')[0]=='2.8.0';rng=np.random.default_rng(290082);records=[]
def save(name,a):
 a=np.ascontiguousarray(a,dtype='<f4');data=a.tobytes();file=name+'.bin';(out/file).write_bytes(data);return dict(file=file,shape=list(a.shape),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
for channels,ih,iw,oh,ow in [(3,448,448,298,298),(3,448,448,597,597),(12,298,298,448,448),(32,597,597,448,448),(1,56,56,448,448),(64,56,56,112,112),(1,2,3,65,66),(8,33,65,67,129)]:
 for pattern in ['noise','signed','steps']:
  shape=(1,channels,ih,iw)
  if pattern=='noise':a=rng.random(shape,dtype=np.float32)
  elif pattern=='signed':a=rng.standard_normal(shape,dtype=np.float32)*3
  else:a=(np.arange(np.prod(shape)).reshape(shape)%31-15).astype(np.float32)/16
  with torch.inference_mode():b=torch.nn.functional.interpolate(torch.from_numpy(a),size=(oh,ow),mode='bilinear',align_corners=True).numpy()
  name=f'{channels}-{ih}x{iw}-{oh}x{ow}-{pattern}';records.append(dict(name=name,channels=channels,height=ih,width=iw,outHeight=oh,outWidth=ow,input=save(name+'-input',a),output=save(name+'-output',b)))
report=dict(schema=1,scope='Large-output contiguous NCHW float32 align_corners=True only; no antialias, small-output or channels-last claim',torch=torch.__version__,referenceThreads=8,records=records);(out/'reference.json').write_text(json.dumps(report,indent=2)+'\n');print('Generated',len(records),'resize cases')
