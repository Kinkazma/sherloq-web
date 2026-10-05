"""Native ROI/composite/FFT integration oracle, writes only to this worktree."""
import sys,json,hashlib
from pathlib import Path
import numpy as np,cv2 as cv,matplotlib
sys.dont_write_bytecode=True
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.resampling import ResamplingEngine,normalize_gray
out=root/'.build/resampling-analysis';out.mkdir(exist_ok=True,parents=True)
def save(name,a):a.tofile(out/name);return {'file':name,'shape':list(a.shape),'sha256':hashlib.sha256(a.tobytes()).hexdigest()}
records=[]
for filename in ['synthetic.jpg','odd.jpg']:
 gray=normalize_gray(cv.imread(str(root/'fixtures'/filename),cv.IMREAD_GRAYSCALE));h,w=gray.shape
 for size in [3,5]:
  for regions in [[[0,0,w,h]],[[1,1,w//2,h-1],[w//2,2,w-1,h-2]],[]]:
   stem=str(len(records));engine=ResamplingEngine(gray);comp=gray.copy();maps=[]
   for i,r in enumerate(regions):
    steps=[];a=engine.probability(r,size,progress=lambda n,t:steps.append(n));border=size//2;x,y,xx,yy=r;comp[y+border:yy-border,x+border:xx-border]=a;maps.append({**save(stem+f'-map{i}.f64',a),'iterations':steps[-1]})
   selections=[[2,1,w-2,h-1]];sources=[np.fromfile(out/m['file'],dtype='<f8').reshape(m['shape']) for m in maps]+[comp[y:yy,x:xx]for x,y,xx,yy in selections];fourier=[]
   for variation,params in enumerate([('hanning',True,False,'simple',4,True),('radial',False,True,'radial',.5,False)]):
    outputs=[]
    for i,a in enumerate(sources):
     v=engine.fourier(a,(variation,i),params);rgb=matplotlib.colormaps['gray'](v,bytes=True)[:,:,:3].copy();outputs.append({'values':save(stem+f'-f{variation}-{i}.f64',v),'rgb':save(stem+f'-f{variation}-{i}.rgb',rgb)})
    fourier.append({'params':dict(zip(['window','upsample','center','highpass','gamma','rescale'],params)),'outputs':outputs})
   records.append({'file':filename,'size':size,'regions':regions,'fourierRegions':selections,'maps':maps,'composite':save(stem+'-composite.f64',comp),'rgb':save(stem+'-composite.rgb',matplotlib.colormaps['gray'](comp,bytes=True)[:,:,:3].copy()),'fourier':fourier})
(out/'reference.json').write_text(json.dumps(records,indent=2)+'\n');print(len(records))
