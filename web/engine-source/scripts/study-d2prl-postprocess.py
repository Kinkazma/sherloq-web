"""Synthetic numerical-boundary study, no model loading or native edits."""
from pathlib import Path
import sys,json
import numpy as np
import cv2 as cv
from skimage.morphology import remove_small_objects
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.d2prl import postprocess
rows=[];rng=np.random.default_rng(280002)
for h,w in [(32,35),(77,131),(448,448)]:
 for mode in ['horizontal','vertical','checker','random','holes','thin','diagonal']:
  y,x=np.indices((h,w));t=(x<w//2) if mode=='vertical' else (y<h//2)
  if mode=='checker':t=(x+y)%2==0
  if mode=='random':t=rng.random((h,w))>.5
  if mode=='holes':t=((x//13+y//11)%2)==0
  if mode=='thin':t=(x%51)<25
  if mode=='diagonal':t=x/(w-1)>y/(h-1)
  raw=np.stack((np.ones((h,w),np.float32),t.astype(np.float32)*1e-7,(~t).astype(np.float32)*1e-7))
  m,native_t,native_s=postprocess(raw)
  both=remove_small_objects(raw[1]+raw[2]>0,min_size=500);signed=(t.astype(np.float32)*2-1)*both
  filtered=cv.filter2D(signed,-1,np.ones((50,50)),borderType=cv.BORDER_CONSTANT)
  exact=cv.boxFilter(signed,-1,(50,50),normalize=False,borderType=cv.BORDER_CONSTANT)
  disagreement=int(np.count_nonzero(((exact>0)&both)!=native_t))
  rows.append(dict(width=w,height=h,mode=mode,maxFilterError=float(np.max(np.abs(filtered-exact))),changedRolePixels=disagreement,nonzeroAtExactZero=int(np.count_nonzero((exact==0)&(filtered!=0)))))
source=root.parent/'source/gui/sherloq_app/core/d2prl.py'
import hashlib
report=dict(schema=1,scope='Native filter2D versus exact box summation; this is not a browser inference or detector accuracy result',opencv=cv.__version__,numpy=np.__version__,nativeSourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),cases=rows,conclusion='Do not replace filter2D with a mathematically exact majority sum without an explicitly reviewed change: tiny zero residuals change role masks.')
(root/'docs/d2prl-postprocess-boundary-study.json').write_text(json.dumps(report,indent=2)+'\n')
print(len(rows),'synthetic postprocess boundary cases')
