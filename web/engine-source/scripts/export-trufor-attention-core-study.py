"""Development-only full-key attention and split reduction, unchanged softmax."""
from pathlib import Path
import torch,json,hashlib
from torch import nn
from torch.nn import functional as F
root=Path(__file__).resolve().parents[1];out=root/'.build/trufor-attention-core';out.mkdir(exist_ok=True)
torch.set_num_threads(2)
class Core(nn.Module):
 def __init__(self,split=False):super().__init__();self.split=split
 def forward(self,q,key,value):
  if self.split==2:
   b,h,n,d=q.shape;k=key.shape[-1];pad=(-k)%1024
   keys=F.pad(key,(0,pad)).reshape(b,h,d,-1,1024).permute(0,1,3,2,4)
   values=F.pad(value,(0,0,0,pad)).reshape(b,h,-1,1024,d)
   logits=(q.unsqueeze(2)@keys)*.125
   valid=(torch.arange(k+pad,device=q.device)<k).reshape(1,1,-1,1,1024)
   logits=logits.masked_fill(~valid,float('-inf'))
   maxima=logits.amax(-1,keepdim=True)
   weights=(logits-maxima).exp()
   denominator=weights.sum(-1,keepdim=True)
   numerator=weights@values
   factors=(maxima-maxima.amax(2,keepdim=True)).exp()
   return (numerator*factors).sum(2)/(denominator*factors).sum(2)
  p=((q@key)*.125).softmax(-1)
  if not self.split:return p@value
  b,h,n,k=p.shape;d=value.shape[-1];pad=(-k)%1024
  p=F.pad(p,(0,pad)).reshape(b,h,n,-1,1024).permute(0,1,3,2,4)
  v=F.pad(value,(0,0,0,pad)).reshape(b,h,-1,1024,d)
  return (p@v).sum(2)
assets={}
for name,split in [('direct',False),('split',True),('global-parts',2)]:
 p=out/(name+'.onnx')
 torch.onnx.export(Core(split),(torch.randn(1,1,3,64),torch.randn(1,1,64,101),torch.randn(1,1,101,64)),p,input_names=['q','key','value'],output_names=['result'],opset_version=19,dynamo=False,do_constant_folding=False,dynamic_axes={'q':{1:'heads',2:'queries'},'key':{1:'heads',3:'keys'},'value':{1:'heads',2:'keys'},'result':{1:'heads',2:'queries'}})
 assets[name]=dict(file=p.name,bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),graphOptimizationLevel='disabled')
(out/'manifest.json').write_text(json.dumps(dict(assets=assets),indent=2)+'\n')
