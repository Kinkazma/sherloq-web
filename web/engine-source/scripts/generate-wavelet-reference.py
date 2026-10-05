from pathlib import Path
from itertools import product
import sys,json,hashlib,numpy as np,pywt
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.interactive import WaveletEngine
OUT=ROOT/'web-engine/fixtures'
wavelets=[f'db{i}' for i in range(1,21)]+[f'sym{i}' for i in range(2,21)]+[f'coif{i}' for i in range(1,6)]+['bior'+s for s in ['1.1','1.3','1.5','2.2','2.4','2.6','2.8','3.1','3.3','3.5','3.7','3.9','4.4','5.5','6.8']]
inputs=[{k:f[k] for k in ('name','width','height','file')} for f in json.loads((OUT/'pixel-reference.json').read_text())['cases']]
inputs.append(dict(name='texture',width=137,height=129,file='opencv-texture-input.rgb'));cases=[]
for f in inputs:
 bgr=np.frombuffer((OUT/f['file']).read_bytes(),np.uint8).reshape(f['height'],f['width'],3)[:,:,::-1].copy();e=WaveletEngine(bgr);expected=[]
 for wavelet in wavelets:
  maximum=pywt.dwtn_max_level(bgr.shape[:2],wavelet)
  params=[(0,0,'soft')]
  if maximum:
   params+=list(product([1,37,100],sorted(set([1,maximum])),['soft','hard','garrote','greater','less']))
  for threshold,level,mode in params:
   rgb=e.compute((wavelet,threshold,level,mode))[:,:,::-1].copy().tobytes()
   expected.append(dict(params=dict(wavelet=wavelet,threshold=threshold,level=level,mode=mode),maximum=maximum,sha256=hashlib.sha256(rgb).hexdigest()))
 cases.append({**f,'expected':expected});print(f['name'],len(expected),flush=True)
sources={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in ['source/gui/sherloq_app/core/interactive.py','source/gui/sherloq_app/core/wavelet_threshold.py','source/gui/sherloq_app/tools/detail/wavelets.py']}
(OUT/'wavelet-reference.json').write_text(json.dumps(dict(schema=1,pywavelets=pywt.__version__,sources=sources,wavelets=wavelets,cases=cases),separators=(',',':'))+'\n');print(sum(len(f['expected']) for f in cases),'wavelet outputs')
