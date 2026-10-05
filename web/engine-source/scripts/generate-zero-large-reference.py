from pathlib import Path
import sys,json,hashlib,numpy as np,cv2 as cv,ctypes as ct,math
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.zero import analyze,jpeg99
from gui.sherloq_app.tools.jpeg.zero import display
OUT=ROOT/'web-engine/fixtures';file='bench-1024.jpg';image=cv.imread(str(OUT/file));assert image is not None
cv.imwrite(str(OUT/'bench-zero-256.jpg'),image[:256,:256],[cv.IMWRITE_JPEG_QUALITY,75])
companion,_=jpeg99(image);r=analyze(image,companion)
arrays={k:dict(sha256=hashlib.sha256(a.tobytes()).hexdigest(),values=a.tolist() if k=='grid_log10_nfa' else None) for k,a in r.items() if isinstance(a,np.ndarray)}
views=[hashlib.sha256(display((r,mode))[:,:,::-1].copy().tobytes()).hexdigest() for mode in range(5)]
# Significance samples immediately around each native global-significance boundary.
lib=ct.CDLL(str(ROOT/'native/runtime/libsherloq_zero.dylib'));fn=lib.log_nfa;fn.argtypes=[ct.c_int,ct.c_int,ct.c_double,ct.c_double];fn.restype=ct.c_double;thresholds=[]
for width,height in [(16,16),(17,33),(128,128),(1024,1024),(2048,1900),*[(n,n+13) for n in range(21,1800,23)]]:
 n=width*height//64;lognt=2*math.log10(64)+2*math.log10(width)+2*math.log10(height);lo,hi=0,n
 while lo<hi:
  k=(lo+hi)//2
  if fn(n,k,1/64,lognt)<0:hi=k
  else:lo=k+1
 for k in range(max(0,lo-2),min(n,lo+2)+1):thresholds.append(dict(n=n,k=k,p=1/64,lognt=lognt,expected=fn(n,k,1/64,lognt)))
(OUT/'zero-large-reference.json').write_text(json.dumps(dict(schema=1,file=file,arrays=arrays,metadata=r['metadata'],views=views,thresholds=thresholds),indent=2)+'\n');print('Large ZERO reference and',len(thresholds),'threshold cases',flush=True)
