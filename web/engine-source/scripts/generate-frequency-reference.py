from pathlib import Path
from itertools import product
import sys,json,hashlib,numpy as np,cv2 as cv
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.interactive import FrequencyEngine
from gui.sherloq_app.core.frequency_mask import circular_mask
OUT=ROOT/'web-engine/fixtures';inputs=[{k:f[k] for k in ('name','width','height','file')} for f in json.loads((OUT/'pixel-reference.json').read_text())['cases']];inputs.append(dict(name='texture',width=137,height=129,file='opencv-texture-input.rgb'));cases=[]
for f in inputs:
 bgr=np.frombuffer((OUT/f['file']).read_bytes(),np.uint8).reshape(f['height'],f['width'],3)[:,:,::-1].copy();engine=FrequencyEngine(bgr);engine.prepare();raw=bytearray();expected=[]
 base=np.concatenate([engine.dft,engine.magnitude0[:,:,None],engine.phase0[:,:,None]],axis=2);basefile='frequency-'+f['name']+'-base.f32';(OUT/basefile).write_bytes(base.tobytes())
 for split,smooth,threshold,filtering in product([0,15,50,100],[0,25,100],[0,37,100],[0,1,15]):
  frames=engine.compute((split,smooth,threshold,filtering));hashes=[];offsets=[]
  for frame in frames[:4]:
   rgb=frame[:,:,::-1].copy().tobytes();hashes.append(hashlib.sha256(rgb).hexdigest());offsets.append([len(raw),len(rgb)]);raw.extend(rgb)
  expected.append(dict(params=dict(split=split,smooth=smooth,threshold=threshold,filter=filtering),sha256=hashes,offsets=offsets,zeroPercent=frames[4]))
 out='frequency-'+f['name']+'.rgb';(OUT/out).write_bytes(raw);cases.append({**f,'baseFile':basefile,'baseShape':list(base.shape),'outputFile':out,'expected':expected});print(f['name'],len(expected)*4,flush=True)
sources={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in ['source/gui/sherloq_app/core/interactive.py','source/gui/sherloq_app/core/frequency_mask.py']};(OUT/'frequency-reference.json').write_text(json.dumps(dict(schema=1,sources=sources,opencv=cv.__version__,cases=cases),separators=(',',':'))+'\n')
