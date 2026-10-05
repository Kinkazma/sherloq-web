from pathlib import Path
from itertools import product
import sys,json,hashlib,numpy as np
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.interactive import PlotEngine
OUT=ROOT/'web-engine/fixtures';inputs=json.loads((OUT/'pixel-reference.json').read_text())['cases'];inputs.append(dict(name='texture',width=137,height=129,file='opencv-texture-input.rgb'));cases=[]
for f in inputs:
 e=PlotEngine(np.frombuffer((OUT/f['file']).read_bytes(),np.uint8).reshape(f['height'],f['width'],3)[:,:,::-1].copy());expected=[];values=[]
 for scale in range(int(np.log2(min(f['width'],f['height'])))+1):
  data=e.compute(scale);values.append(data.ravel().tolist())
  for axes,kind,colored,alpha in product([(0,1,2),(3,4,5),(5,2,0)],['2d','3d','classic'],[False,True],[0,.37,1]):
   x,y,z=axes;p=(scale,x,y,z if kind=='3d' else -1,colored,alpha,kind);r=e.prepare_plot(p)
   expected.append(dict(params=dict(scale=scale,x=x,y=y,z=z,colored=colored,alpha=alpha,kind=kind),positions=hashlib.sha256(r['positions'].tobytes()).hexdigest(),colors=hashlib.sha256(r['colors'].tobytes()).hexdigest() if colored else list(r['colors'])))
 cases.append({**f,'values':values,'expected':expected})
p='source/gui/sherloq_app/core/interactive.py';(OUT/'plots-reference.json').write_text(json.dumps(dict(schema=1,source=p,sha256=hashlib.sha256((ROOT/p).read_bytes()).hexdigest(),cases=cases),separators=(',',':'))+'\n');print(sum(len(f['expected']) for f in cases),'plot views')
