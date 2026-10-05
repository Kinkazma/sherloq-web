from pathlib import Path
import sys,json,hashlib,numpy as np,cv2 as cv
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.contrast import ContrastEngine,_WINDOW
OUT=ROOT/'web-engine/fixtures';rng=np.random.default_rng(893224);cases=[]
for name,w,h in [('tiny',1,1),('flat',32,32),('odd',35,33),('divisible',64,128),('gradient',129,65),('texture',257,259),('checker',127,129),('white',63,65),('correlated',173,193),('quantized',319,273),('gamma',129,127),('monochrome',131,133),('large',1024,1024)]:
 a=rng.integers(0,256,(h,w,3),np.uint8)
 if name=='large':a=cv.imread(str(OUT/'bench-1024.jpg'))
 if name=='flat':a.fill(127)
 if name=='white':a.fill(255)
 if name=='gradient':a=(np.indices((h,w))[1][:,:,None]*np.array([1,2,3],np.uint16)%256).astype(np.uint8)
 if name=='correlated':
  gray=rng.integers(20,230,(h,w),np.uint8);a=np.stack([gray,gray+rng.integers(0,10,(h,w),np.uint8),gray+rng.integers(0,20,(h,w),np.uint8)],axis=2)
 if name=='quantized':a=(a//16*16).astype(np.uint8)
 if name=='gamma':a=(np.power(a.astype(np.float64)/255,2.2)*255).astype(np.uint8)
 if name=='monochrome':a=np.repeat(a[:,:,:1],3,2)
 if name=='checker':a=np.repeat((np.indices((h,w)).sum(0)%2*255).astype(np.uint8)[:,:,None],3,2)
 file='contrast-'+name+'.rgb';(OUT/file).write_bytes(a[:,:,::-1].copy().tobytes());engine=ContrastEngine(a);expected=[]
 for block in [32,64,128,256]:
  maps=engine.analyze(block);values=np.stack(maps,axis=2);expected.append(dict(block=block,shape=list(values.shape),values=values.ravel().tolist(),sha256=hashlib.sha256(values.tobytes()).hexdigest(),views=[hashlib.sha256(engine.render(block,i,maps)[:,:,::-1].copy().tobytes()).hexdigest() for i in range(3)]))
 cases.append(dict(name=name,file=file,width=w,height=h,expected=expected));print(name,flush=True)
(OUT/'contrast-reference.json').write_text(json.dumps(dict(schema=1,sourceSha256=hashlib.sha256((ROOT/'source/gui/sherloq_app/core/contrast.py').read_bytes()).hexdigest(),cases=cases),indent=2)+'\n')
(ROOT/'web-engine/native/contrast-window.h').write_text('// Pinned native float32 histogram taper, represented exactly.\nstatic const float contrastWindow[256]={'+','.join(float(v).hex()+'f' for v in _WINDOW)+'};\n')
