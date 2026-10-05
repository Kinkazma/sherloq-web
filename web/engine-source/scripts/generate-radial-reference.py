"""Independent native radial regression for projection and rounding boundaries."""
from pathlib import Path
import json,cv2 as cv,numpy as np
assert cv.__version__=='4.11.0';cv.setNumThreads(1)
cases=[]
for w,h,mode in [(4103,5401,0),(4103,5401,1),(3101,1703,0),(3101,1703,1),(1027,2053,0),(1027,2053,1)]:
 y,x=np.indices((h,w),dtype=np.uint32)
 rgb=np.stack(((x+y)%256,(2*x+3*y)%256,(5*x+7*y)%256),axis=2)if mode==0 else np.stack(((x*x+3*y)%256,(x+7*y*y)%256,((x^y)*13)%256),axis=2)
 image=rgb.astype(np.uint8)[:,:,::-1].copy();cases.append(dict(width=w,height=h,mode=mode,hash=cv.img_hash.radialVarianceHash(image).ravel().tolist()))
(Path(__file__).resolve().parents[1]/'tests/data/radial-native.json').write_text(json.dumps(dict(opencv=cv.__version__,cases=cases),indent=2)+'\n')
