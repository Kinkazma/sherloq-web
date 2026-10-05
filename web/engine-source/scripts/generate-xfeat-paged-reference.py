from pathlib import Path
import sys,json,numpy as np,torch,torch.nn.functional as F
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'));torch.set_num_threads(2)
from gui.sherloq_app.vendor.xfeat.modules.xfeat import XFeat
model=XFeat(str(root.parent/'models/external/xfeat.pt'),device='cpu').eval();out=root/'.build/m3/learned';records=[]
with torch.inference_mode():
 for index,(h,w) in enumerate([(789,1317),(96,128),(131,97)]):
  rgb=np.random.default_rng(228+index).integers(0,256,(h,w,3),np.uint8)
  if index==0:rgb[220:620,800:1200]=rgb[20:420,100:500]
  result=model.detectAndCompute(rgb[:,:,::-1].copy(),top_k=1000)[0]
  hh,ww=h//32*32,w//32*32;image=torch.from_numpy(rgb[:,:,::-1].transpose(2,0,1).copy()).float()[None];gray=F.interpolate(image,(hh,ww),mode='bilinear',align_corners=False).mean(1,keepdim=True);normalized=model.net.norm(gray)
  files={}
  for name,a in [('image',rgb),('gray',gray[0,0].numpy()),('normalized',normalized[0,0].numpy()),*[(k,v.numpy()) for k,v in result.items()]]:
   file=f'xfeat-paged-{index}-{name}.bin';a.tofile(out/file);files[name]=file
  records.append(dict(width=w,height=h,files=files,points=len(result['scores'])))
(out/'xfeat-paged-reference.json').write_text(json.dumps(records))
