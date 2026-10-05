"""One large native JPEG EM/composite/FFT oracle and an independent ROI pair."""
import sys,json,hashlib
from pathlib import Path
import numpy as np,cv2 as cv,matplotlib
sys.dont_write_bytecode=True
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.resampling import ResamplingEngine,normalize_gray
out=root/'.build/resampling-analysis';out.mkdir(exist_ok=True,parents=True)
a=np.random.default_rng(20261004).integers(0,256,(1024,1024),dtype=np.uint8);cv.imwrite(str(out/'large.jpg'),a,[cv.IMWRITE_JPEG_QUALITY,94]);gray=normalize_gray(cv.imread(str(out/'large.jpg'),cv.IMREAD_GRAYSCALE));h,w=gray.shape
def sha(a):return hashlib.sha256(a.tobytes()).hexdigest()
records=[]
for size,regions in [(3,[[0,0,w,h]]),(5,[[0,0,128,128],[256,192,384,320]])]:
 engine=ResamplingEngine(gray);comp=gray.copy();maps=[]
 for i,r in enumerate(regions):
  steps=[];v=engine.probability(r,size,progress=lambda n,t:steps.append(n));border=size//2;x,y,xx,yy=r;comp[y+border:yy-border,x+border:xx-border]=v;maps.append({'sha256':sha(v),'iterations':steps[-1],'shape':list(v.shape)})
 selections=[[200,200,712,712]];fourier=[];params=('hanning',False,False,'simple',2,False)
 for i,v in enumerate([engine.maps.get((tuple(r),size))for r in regions]+[comp[y:yy,x:xx]for x,y,xx,yy in selections]):
  s=engine.fourier(v,i,params);fourier.append({'shape':list(s.shape),'rgbSha256':sha(matplotlib.colormaps['gray'](s,bytes=True)[:,:,:3].copy())})
 records.append({'size':size,'regions':regions,'maps':maps,'compositeSha256':sha(comp),'rgbSha256':sha(matplotlib.colormaps['gray'](comp,bytes=True)[:,:,:3].copy()),'fourierRegions':selections,'fourierParams':dict(zip(['window','upsample','center','highpass','gamma','rescale'],params)),'fourier':fourier})
(out/'large-reference.json').write_text(json.dumps(records,indent=2)+'\n');print(json.dumps(records))
