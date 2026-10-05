"""Development export of the real XFeat local backbone after global InstanceNorm.
Global normalization, full-image NMS/ranking and sampling stay external. Weights
are the same pinned checkpoint; no patch-specific normalization is introduced.
"""
from pathlib import Path
import sys,types,json,hashlib
import torch,numpy as np,torch.nn.functional as F
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'));torch.set_num_threads(2)
from gui.sherloq_app.vendor.xfeat.modules.xfeat import XFeat
import onnx
weight=root.parent/'models/external/xfeat.pt';sha=hashlib.sha256(weight.read_bytes()).hexdigest();assert sha=='0f5187fd7bedd26c7fe6acc9685444493a165a35ecc087b33c2db3627f3ea10b'
net=XFeat(str(weight),device='cpu').eval().net
class Local(torch.nn.Module):
 def __init__(self):super().__init__();self.net=net
 def forward(self,x):
  m=self.net;x1=m.block1(x);x2=m.block2(x1+m.skip1(x));x3=m.block3(x2);x4=m.block4(x3);x5=m.block5(x4)
  features=m.block_fusion(x3+F.interpolate(x4,x3.shape[-2:],mode='bilinear')+F.interpolate(x5,x3.shape[-2:],mode='bilinear'));reliability=m.heatmap_head(features)
  b,c,h,w=x.shape;unfold=x.reshape(b,c,h//8,8,w//8,8).permute(0,1,3,5,2,4).reshape(b,c*64,h//8,w//8);logits=m.keypoint_head(unfold);heat=F.softmax(logits,1)[:,:64];b,c,h,w=heat.shape;heat=heat.permute(0,2,3,1).reshape(b,h,w,8,8).permute(0,1,3,2,4).reshape(b,1,h*8,w*8)
  return F.normalize(features,dim=1),heat,reliability
local=Local().eval();rng=np.random.default_rng(174);image=torch.from_numpy(rng.integers(0,256,(1,3,736,1024),np.uint8).astype(np.float32));records=[]
with torch.inference_mode():
 normalized=net.norm(image.mean(1,keepdim=True));expected=local(normalized);assembled=[torch.empty_like(t) for t in expected]
 for y in range(0,736,256):
  for x in range(0,1024,256):
   x0=max(0,x-256);y0=max(0,y-256);x1=min(1024,x+512);y1=min(736,y+512);got=local(normalized[:,:,y0:y1,x0:x1]);cw=min(256,1024-x);ch=min(256,736-y)
   for i,scale in enumerate([8,1,8]):assembled[i][:,:,y//scale:(y+ch)//scale,x//scale:(x+cw)//scale]=got[i][:,:,(y-y0)//scale:(y-y0+ch)//scale,(x-x0)//scale:(x-x0+cw)//scale]
 for name,a,b in zip(['features','heat','reliability'],expected,assembled):
  d=(a-b).abs();record=dict(name=name,shape=list(a.shape),maximum=float(d.max()),mean=float(d.mean()));assert record['maximum']<1e-5,record;records.append(record)
 out=root/'.build/m3/learned';file=out/'xfeat-paged-local.onnx';torch.onnx.export(local,normalized[:,:,:512,:512],file,input_names=['normalized'],output_names=['features','heat','reliability'],opset_version=19,dynamo=False,external_data=False,dynamic_axes={'normalized':{2:'height',3:'width'},'features':{2:'fh',3:'fw'},'heat':{2:'height',3:'width'},'reliability':{2:'fh',3:'fw'}})
onnx.checker.check_model(onnx.load(file));report=dict(weightSha256=sha,file=file.name,bytes=file.stat().st_size,sha256=hashlib.sha256(file.read_bytes()).hexdigest(),halo=256,core=256,normalization='same global normalized input in this local-backbone study',cases=records,qualification='Development local-backbone study only; global preparation/NMS/top-k/descriptor sampling not yet integrated')
(root/'docs/m3-xfeat-local-study.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
