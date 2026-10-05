"""Export the real XFeat single-image path. External weights/graphs stay in .build.
No model download, substitute descriptor, fixed feature count or trial inference
is introduced into the user runtime. Native wrapper equivalence precedes export.
"""
from pathlib import Path
import argparse,sys,json,hashlib,types
import numpy as np,torch,torch.nn.functional as F
root=Path(__file__).resolve().parents[1];parser=argparse.ArgumentParser();parser.add_argument('--native-root',type=Path,default=root.parent);args=parser.parse_args();sys.path.insert(0,str(args.native_root/'source'))
from gui.sherloq_app.vendor.xfeat.modules.xfeat import XFeat
import onnx
torch.set_num_threads(2);out=root/'.build/m3/learned';out.mkdir(parents=True,exist_ok=True)
weight=args.native_root/'models/external/xfeat.pt';manifest=json.loads((weight.parent/'manifest.json').read_text());identity=next(r for r in manifest if r['file']=='xfeat.pt');sha=hashlib.sha256(weight.read_bytes()).hexdigest();assert sha==identity['sha256']
model=XFeat(str(weight),device='cpu').eval()
@torch.jit.script
def nonempty_positions(positions:torch.Tensor):
 # Empty NMS is a real result. A masked zero-coordinate sentinel avoids ORT's
 # zero-dimension GridSample broadcasting limitation and is always discarded.
 if positions.size(0)==0:return torch.zeros((1,2),dtype=torch.int64,device=positions.device)
 return positions
class Extract(torch.nn.Module):
 def __init__(self):super().__init__();self.net=model.net
 def forward(self,image,mask,limit,scales):
  shape=torch._shape_as_tensor(image);h,w=shape[-2],shape[-1];hh,ww=(h//32)*32,(w//32)*32
  x=F.interpolate(image, (hh,ww),mode='bilinear',align_corners=False);dense,logits,reliability=self.net(x);dense=F.normalize(dense,dim=1)
  heat=F.softmax(logits,1)[:,:64];b,c,lh,lw=heat.shape;heat=heat.permute(0,2,3,1).reshape(b,lh,lw,8,8).permute(0,1,3,2,4).reshape(b,1,lh*8,lw*8)
  maximum=F.max_pool2d(heat,5,1,2);positions=torch.nonzero(((heat==maximum)&(heat>.05))[0,0])[:,[1,0]]
  positions=nonempty_positions(positions)
  denominator=torch.stack((ww-1,hh-1));grid=(2.*(positions/denominator)-1.)[None,:,None,:].to(image.dtype)
  nearest=F.grid_sample(heat,grid,mode='nearest',align_corners=False).permute(0,2,3,1).squeeze(-2)
  bilinear=F.grid_sample(reliability,grid,mode='bilinear',align_corners=False).permute(0,2,3,1).squeeze(-2)
  scores=(nearest*bilinear)[0,:,0];scores=torch.where(torch.all(positions==0,dim=-1),-torch.ones_like(scores),scores)
  original=positions*scales
  xy=original.round().long();inside=mask[xy[:,1].clamp(0,h-1),xy[:,0].clamp(0,w-1)]>0;scores=scores.masked_fill(~inside,-1)
  order=torch.argsort(-scores)[:limit];positions=positions[order];scores=scores[order]
  grid=(2.*(positions/denominator)-1.)[None,:,None,:].to(image.dtype)
  features=F.grid_sample(dense,grid,mode='bicubic',align_corners=False).permute(0,2,3,1).squeeze(-2)[0];features=F.normalize(features,dim=-1);points=positions*scales;valid=scores>0
  return points[valid],scores[valid],features[valid]
net=Extract().eval();records=[]
with torch.inference_mode():
 for index,(h,w,mode) in enumerate([(96,128,'pattern'),(131,97,'noise'),(64,64,'zero')]):
  y,x=np.mgrid[:h,:w];image=np.stack([(x*7+y*11)%256,(x*3+y*13)%256,(x*17+y*5)%256],axis=2).astype(np.uint8) if mode=='pattern' else np.random.default_rng(91).integers(0,256,(h,w,3),dtype=np.uint8) if mode=='noise' else np.zeros((h,w,3),np.uint8)
  mask=np.ones((h,w),np.uint8);mask[:h//5,:w//5]=0;inputs=(torch.from_numpy(image.transpose(2,0,1).copy()).float()[None],torch.from_numpy(mask),torch.tensor(100,dtype=torch.int64),torch.tensor([w/((w//32)*32),h/((h//32)*32)],dtype=torch.float32))
  expected=model.detectAndCompute(image,top_k=100,mask=mask)[0];actual=net(*inputs)
  for name,a in zip(['keypoints','scores','descriptors'],actual):assert torch.equal(a,expected[name]),(index,name,torch.max(torch.abs(a-expected[name])).item())
  files={}
  for name,t in [('image',inputs[0]),('mask',inputs[1]),('scales',inputs[3]),*zip(['keypoints','scores','descriptors'],actual)]:
   dtype=np.uint8 if name=='mask' else np.float32;filename=f'xfeat-{index}-{name}.bin';t.cpu().numpy().astype(dtype).tofile(out/filename);files[name]=dict(file=filename,shape=list(t.shape),dtype='uint8' if name=='mask' else 'float32')
  records.append(dict(id=index,mode=mode,files=files))
# Unfold with a fixed eight-pixel cell is a reshape/transpose, including dynamic
# dimensions divisible by 32. Same elements/order; no learned operation removed.
original_unfold=model.net._unfold2d
def unfold(self,x,ws=8):
 b,c,h,w=x.shape
 return x.reshape(b,c,h//ws,ws,w//ws,ws).permute(0,1,3,5,2,4).reshape(b,c*ws*ws,h//ws,w//ws)
model.net._unfold2d=types.MethodType(unfold,model.net)
with torch.inference_mode():
 image=torch.zeros(1,3,96,128);image[0,0,10:40,20:80]=255;mask=torch.ones(96,128,dtype=torch.uint8);limit=torch.tensor(100,dtype=torch.int64)
 path=out/'xfeat-extract.onnx';torch.onnx.export(net,(image,mask,limit,torch.ones(2)),path,input_names=['image','mask','limit','scales'],output_names=['keypoints','scores','descriptors'],opset_version=19,dynamo=False,external_data=False,dynamic_axes={'image':{2:'height',3:'width'},'mask':{0:'height',1:'width'},'keypoints':{0:'points'},'scores':{0:'points'},'descriptors':{0:'points'}})
model.net._unfold2d=original_unfold
onnx.checker.check_model(onnx.load(path));report=dict(schema=1,torch=torch.__version__,weightSha256=sha,file=path.name,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),wrapperExact=True,cases=records)
(out/'xfeat-reference.json').write_text(json.dumps(report,separators=(',',':'))+'\n');print(json.dumps({k:v for k,v in report.items() if k!='cases'}))
