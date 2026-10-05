from pathlib import Path
import sys,json,hashlib,warnings,numpy as np,cv2 as cv,sewar.full_ref,sewar.utils
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.comparison import ComparisonEngine
OUT=ROOT/'web-engine/fixtures';rng=np.random.default_rng(29851);cases=[]
specs=[('tiny',1,1),('small',3,5),('zero',16,16),('constant',32,32),('same',47,49),('shift',65,63),('brightness',97,99),('noise',131,127),('random',192,192),('gamma',257,259),('large',512,512)]
specs += [('row',33,1),('column',1,33),('narrow',17,3),('inverse',129,127),('impulse',33,31),('gradient',95,97),('checker',66,68),('saturated',47,51)]
specs += [('edge'+str(n),n,n+1) for n in [8,9,10,11,17,31,33,79,80,81,175,176,177]]
specs += [('megapixel',1024,1024)]
for name,w,h in specs:
 a=rng.integers(0,256,(h,w,3),np.uint8);b=a.copy()
 if name=='zero':a.fill(0);b.fill(0)
 elif name=='constant':a.fill(127);b.fill(130)
 elif name=='shift':b=np.roll(a,1,axis=1)
 elif name=='brightness':b=np.clip(a.astype(np.int16)+15,0,255).astype(np.uint8)
 elif name=='noise':b=np.clip(a.astype(np.int16)+rng.integers(-8,9,a.shape),0,255).astype(np.uint8)
 elif name=='random':b=rng.integers(0,256,a.shape,np.uint8)
 elif name=='gamma':b=(np.power(a.astype(np.float64)/255,1.1)*255).astype(np.uint8)
 elif name in ['large','megapixel']:b[h//3:h*2//3,w//3:w*2//3]=np.roll(a,1,1)[h//3:h*2//3,w//3:w*2//3]
 elif name=='inverse':b=255-a
 elif name=='impulse':a.fill(0);a[h//2,w//2]=255;b.fill(0);b[h//2,w//2+1]=255
 elif name=='gradient':a=np.repeat(np.tile(np.arange(w,dtype=np.uint8)*2,(h,1))[:,:,None],3,axis=2);b=np.roll(a,1,axis=1)
 elif name=='checker':a=np.repeat(((np.indices((h,w)).sum(axis=0)%2)*255).astype(np.uint8)[:,:,None],3,axis=2);b=255-a
 elif name=='saturated':a.fill(255);b.fill(0)
 elif name.startswith('edge') or name in ['row','column','narrow']:b=np.clip(a.astype(np.int16)+rng.integers(-40,41,a.shape),0,255).astype(np.uint8)
 first=f'comparison-{name}-first.rgb';second=f'comparison-{name}-second.rgb'
 (OUT/first).write_bytes(a[:,:,::-1].copy().tobytes());(OUT/second).write_bytes(b[:,:,::-1].copy().tobytes())
 engine=ComparisonEngine(a,b)
 with warnings.catch_warnings():warnings.simplefilter('ignore');result=engine.compute()
 values={k:(float(v) if np.isfinite(v) else '+Infinity') for k,v in result['values'].items()}
 views=[]
 for mode in ['normal','difference','ssim','butter']:
  if mode not in ['normal','difference'] and mode not in engine.maps:continue
  for equalized in [False,True]:
   for gray in [False,True]:views.append(dict(mode=mode,equalized=equalized,grayscale=gray,sha256=hashlib.sha256(engine.display(mode,equalized,gray)[:,:,::-1].copy().tobytes()).hexdigest()))
 hist=[cv.calcHist([im],[0,1,2],None,[256]*3,[0,256]*3).reshape(-1,1) for im in [a,b]]
 full_bins=float(cv.compareHist(*hist,cv.HISTCMP_CORREL));del hist
 cases.append(dict(name=name,width=w,height=h,first=first,second=second,values=values,histogramCorrelationFullBins=full_bins,errors={k:v.replace(str(ROOT),'<native-root>') for k,v in result['errors'].items()},views=views));print(name,values,result['errors'].keys(),flush=True)
sources={name:hashlib.sha256((ROOT/'source/gui/sherloq_app/core'/name).read_bytes()).hexdigest() for name in ['comparison.py','utility.py']}
for module in [sewar.full_ref,sewar.utils]:sources[module.__name__]=hashlib.sha256(Path(module.__file__).read_bytes()).hexdigest()
for file in ['butteraugli/linux/butteraugli.cc','butteraugli/linux/butteraugli.h','butteraugli/linux/butteraugli_main.cc','butteraugli/macos/butteraugli','ssimulacra/linux/ssimulacra.cpp','ssimulacra/macos/ssimulacra']:
 sources[file]=hashlib.sha256((ROOT/'source/gui'/file).read_bytes()).hexdigest()
(OUT/'comparison-reference.json').write_text(json.dumps(dict(schema=1,sourceSha256=sources,cases=cases),indent=2)+'\n')
