from pathlib import Path
import sys,json,hashlib,time
sys.dont_write_bytecode=True
sys.path.insert(0,'/Users/gaeldauchy/SHERLOQ/source')
import cv2 as cv,numpy as np
from gui.sherloq_app.core.contrast import ContrastEngine
root=Path(__file__).resolve().parents[1];out=root/'.build/pixels-96mp';image=cv.imread(str(out/'source.jpg'));cv.setNumThreads(2);started=time.monotonic()
def sha(a):
 h=hashlib.sha256()
 for y in range(0,len(a),32):h.update(np.ascontiguousarray(a[y:y+32,:,::-1]))
 return h.hexdigest()
cases=[];engine=ContrastEngine(image);maps=engine.analyze(64);np.save(out/'native-contrast-maps.npy',np.stack(maps,axis=-1))
for mode in [0,2]:
 result=engine.render(64,mode,maps);cases.append({'params':{'block':64,'mode':mode},'sha256':sha(result)});del result
reference=[{'family':'contrast','cases':cases}];print('contrast',time.monotonic()-started,flush=True)
channels=cv.split(image);result=cv.merge([cv.equalizeHist(c) for c in channels]);cases=[{'params':{'bounds':None,'mode':'equalize','percent':20,'channel':False},'sha256':sha(result)}];del result
# Exact native auto-contrast shared gray histogram, endpoints accumulated in native order.
gray=cv.cvtColor(image,cv.COLOR_BGR2GRAY);hist=np.bincount(gray.ravel(),minlength=256);n=gray.size;low=0;high=255;total=0
for i in range(256):
 total+=float(hist[i])/n
 if total>=.1:low=i;break
total=0
for i in range(255,-1,-1):
 total+=float(hist[i])/n
 if total>=.1:high=i;break
lut=np.array([255 if low==high else int(max(0,min(255,255*(low-i)/(low-high))))for i in range(256)],np.uint8);result=cv.LUT(image,lut);cases.append({'params':{'bounds':None,'mode':'contrast','percent':20,'channel':False},'sha256':sha(result)});reference.append({'family':'magnifier','cases':cases});(out/'additional-reference.json').write_text(json.dumps(reference,indent=2)+'\n');print('complete',time.monotonic()-started,flush=True)
