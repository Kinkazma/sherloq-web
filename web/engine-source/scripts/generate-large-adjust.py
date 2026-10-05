"""Native adjustment oracles on public synthetic sources; no private pixels."""
from pathlib import Path
import hashlib,json,sys,time
import cv2,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.adjust import AdjustEngine
cv2.setNumThreads(1);sources=[];started=time.perf_counter()
for name,file,params in [('large','.build/jpeg-12000x8000.jpg',[(23,-17,180,11,-25,30,127,255,20,255,1,False),(0,0,0,10,0,0,127,255,100,0,0,False)]),('asymmetric','.build/echo-4099x3077.jpg',[(15,30,90,13,-10,15,113,211,28,0,4,True),(0,0,0,10,0,0,127,255,0,255,5,False)])]:
 image=cv2.imread(str(root/file),cv2.IMREAD_COLOR);h,w=image.shape[:2];cases=[]
 for args in params:
  engine=AdjustEngine(image,megabytes=32);out=engine._compute(args);digest=hashlib.sha256();windows=[]
  for y in range(0,h,64):digest.update(np.ascontiguousarray(out[y:y+64,:,::-1]).tobytes())
  for x,y,ww,hh in [(0,0,67,71),(w//2-13,61,131,67),(w-31,h-29,31,29)]:windows.append(dict(rect=dict(x=x,y=y,width=ww,height=hh),sha256=hashlib.sha256(np.ascontiguousarray(out[y:y+hh,x:x+ww,::-1]).tobytes()).hexdigest()))
  threshold=None
  if args[9]==0:
   before=list(args);before[9]=255;before[11]=False;before=AdjustEngine(image,megabytes=32)._compute(tuple(before));threshold=cv2.threshold(cv2.cvtColor(before,cv2.COLOR_BGR2GRAY),0,255,cv2.THRESH_OTSU)[0];del before
  cases.append(dict(params=dict(zip(['brightness','saturation','hue','gamma','shadows','highlights','sweep','width','sharpen','threshold','equalize','invert'],args)),sha256=digest.hexdigest(),windows=windows,otsuThreshold=threshold));del engine,out
 sources.append(dict(name=name,file=file,width=w,height=h,originalSha256=hashlib.sha256((root/file).read_bytes()).hexdigest(),cases=cases));print(json.dumps(dict(source=name,views=len(cases))),flush=True)
p='source/gui/sherloq_app/core/adjust.py';record=dict(schema=1,scope='Native whole-image adjustment order, global CLAHE/equalization/Otsu; no independent tile interpretation.',operation='inspection.adjust',nativeSources={p:hashlib.sha256((root.parent/p).read_bytes()).hexdigest()},numpy=np.__version__,opencv=cv2.__version__,sources=sources)
(root/'.build/adjust-large-reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(dict(sources=len(sources),views=sum(len(s['cases'])for s in sources),seconds=time.perf_counter()-started)))
