from pathlib import Path
import sys,hashlib,json,time,gc
sys.dont_write_bytecode=True
sys.path.insert(0,'/Users/gaeldauchy/SHERLOQ/source')
import numpy as np,cv2 as cv,matplotlib
from gui.sherloq_app.core.resampling import ResamplingEngine,normalize_gray
from gui.sherloq_app.core.memory_resources import MEMORY
MEMORY.limit=256*1024**2 # Exercise the existing native bounded path, not the 36GB resident alternative.
root=Path(__file__).resolve().parents[1];out=root/'.build/resampling-96mp';out.mkdir(exist_ok=True);source=root/'.build/dense-96mp/copy-6000.jpg';started=time.monotonic()
gray=normalize_gray(cv.imread(str(source),cv.IMREAD_GRAYSCALE));engine=ResamplingEngine(gray);steps=[]
def progress(n,t):
 steps.append(n);print('EM',n,t,time.monotonic()-started,flush=True)
probability=engine.probability([0,0,12000,8000],3,progress=progress);np.save(out/'native-values-0.npy',probability)
composite=gray.copy();composite[1:-1,1:-1]=probability
records=[]
def record(i,values,rgbvalues,params):
 if i:np.save(out/f'native-values-{i}.npy',values)
 h=hashlib.sha256()
 for y in range(0,rgbvalues.shape[0],32):h.update(matplotlib.colormaps['gray'](rgbvalues[y:y+32],bytes=True)[:,:,:3].copy())
 valuehash=hashlib.sha256()
 for y in range(0,values.shape[0],32):valuehash.update(values[y:y+32].tobytes())
 records.append({'shape':list(values.shape),'sha256':h.hexdigest(),'valuesSha256':valuehash.hexdigest(),'params':params});print('saved',i,time.monotonic()-started,flush=True)
record(0,probability,composite,{'size':3,'iterations':steps[-1]});del composite
# Native engine is recreated between stages to release its large bounded caches.
for i,(path,gamma,up) in enumerate([('em',2,False),('em',3,False),('source',2,True),('source',3,True)],1):
 engine=ResamplingEngine(gray);values=engine.fourier(probability if path=='em' else gray,path,('hanning',up,False,'simple',gamma,False));record(i,values,values,{'path':path,'gamma':gamma,'upsample':up});del engine,values;gc.collect()
(out/'reference.json').write_text(json.dumps({'sourceSha256':hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),'cases':records,'nativeSeconds':time.monotonic()-started},indent=2)+'\n')
