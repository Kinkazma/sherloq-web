"""Native full-frame denoising/residual oracles on two public synthetic JPEGs."""
from pathlib import Path
import hashlib,json,sys,time
import cv2,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.noise import NoiseEngine
cv2.setNumThreads(1);sources=[];started=time.perf_counter()
for name,file,params in [('large','.build/jpeg-12000x8000.jpg',[(0,2,3,False,True,32),(1,10,3,False,False,0),(2,10,3,True,False,32)]),('local','fixtures/median/median-1024.jpg',[(3,10,200,False,False,0),(4,10,3,False,True,32),(4,2,3,True,False,255)])]:
 image=cv2.imread(str(root/file),cv2.IMREAD_COLOR);h,w=image.shape[:2];cases=[]
 for args in params:
  engine=NoiseEngine(image,backend='cpu');out=engine._compute(args);digest=hashlib.sha256();windows=[]
  for y in range(0,h,64):digest.update(np.ascontiguousarray(out[y:y+64,:,::-1]).tobytes())
  for x,y,ww,hh in [(0,0,67,71),(w//2-13,61,131,67),(w-31,h-29,31,29)]:windows.append(dict(rect=dict(x=x,y=y,width=ww,height=hh),sha256=hashlib.sha256(np.ascontiguousarray(out[y:y+hh,x:x+ww,::-1]).tobytes()).hexdigest()))
  cases.append(dict(params=dict(zip(['mode','radius','sigma','grayscale','denoised','levels'],args)),sha256=digest.hexdigest(),windows=windows));del engine,out
 sources.append(dict(name=name,file=file,width=w,height=h,originalSha256=hashlib.sha256((root/file).read_bytes()).hexdigest(),cases=cases));print(json.dumps(dict(source=name,views=len(cases))),flush=True)
p='source/gui/sherloq_app/core/noise.py';record=dict(schema=1,scope='Whole native NoiseEngine CPU filters/residuals/global equalization; no independent tile normalization.',operation='noise.separation',nativeSources={p:hashlib.sha256((root.parent/p).read_bytes()).hexdigest()},numpy=np.__version__,opencv=cv2.__version__,sources=sources)
(root/'.build/separation-large-reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(dict(sources=len(sources),views=sum(len(s['cases'])for s in sources),seconds=time.perf_counter()-started)))
