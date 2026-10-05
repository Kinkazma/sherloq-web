from pathlib import Path
import sys,json,hashlib,numpy as np,cv2 as cv
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.interactive import FrequencyEngine
OUT=ROOT/'web-engine/fixtures';rng=np.random.default_rng(8761);cases=[]
for width,height in [(257,261),(625,625),(1024,1024)]:
 name=f'frequency-{width}x{height}';rgb=rng.integers(0,256,(height,width,3),np.uint8);file=name+'.rgb';(OUT/file).write_bytes(rgb.tobytes());bgr=rgb[:,:,::-1].copy();engine=FrequencyEngine(bgr);engine.prepare();base=np.concatenate([engine.dft,engine.magnitude0[:,:,None],engine.phase0[:,:,None]],axis=2);basefile=name+'-base.f32';(OUT/basefile).write_bytes(base.tobytes());expected=[]
 for params in [(0,0,0,0),(15,25,0,0),(50,100,37,0),(100,0,100,15)]:
  frames=engine.compute(params);other=FrequencyEngine(bgr).compute(params);hashes=[hashlib.sha256(f[:,:,::-1].copy().tobytes()).hexdigest() for f in frames[:4]];repeated=[hashlib.sha256(f[:,:,::-1].copy().tobytes()).hexdigest() for f in other[:4]];expected.append(dict(params=dict(zip(['split','smooth','threshold','filter'],params)),sha256=hashes,repeatSha256=repeated,zeroPercent=frames[4]));print(name,params,'repeat exact',hashes==repeated,flush=True)
 cases.append(dict(name=name,file=file,width=width,height=height,baseFile=basefile,baseShape=list(base.shape),expected=expected))
(OUT/'frequency-large-reference.json').write_text(json.dumps(dict(schema=1,opencv=cv.__version__,nativeThreads=cv.getNumThreads(),cases=cases),indent=2)+'\n')
