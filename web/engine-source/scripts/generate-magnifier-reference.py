from pathlib import Path
from itertools import product
import json,sys,hashlib,numpy as np
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.magnifier import MagnifierEngine
OUT=ROOT/'web-engine/fixtures';inputs=json.loads((OUT/'pixel-reference.json').read_text())['cases'];inputs.append(dict(name='texture',width=137,height=129,file='opencv-texture-input.rgb'));cases=[]
for f in inputs:
 e=MagnifierEngine(np.frombuffer((OUT/f['file']).read_bytes(),np.uint8).reshape(f['height'],f['width'],3)[:,:,::-1].copy());expected=[]
 for bounds in [None,[-3,-2,2,3],[1,1,f['width']+8,f['height']+8],[f['width']+5,0,f['width']+8,4]]:
  raw=bounds or [0,0,f['width'],f['height']];b=e.bounds((raw[0],raw[1],raw[2]-raw[0],raw[3]-raw[1]))
  for mode,percent,channel in [('equalize',20,False)]+[('contrast',a,c) for a,c in product((0,1,20,50,100),(False,True))]:
   _,out=e.compute((b,mode,percent,channel));expected.append(dict(params=dict(bounds=bounds,mode=mode,percent=percent,channel=channel),bounds=b,sha256=None if out is None else hashlib.sha256(out[:,:,::-1].copy().tobytes()).hexdigest()))
 cases.append({**f,'expected':expected})
p='source/gui/sherloq_app/core/magnifier.py';(OUT/'magnifier-reference.json').write_text(json.dumps(dict(schema=1,source=p,sha256=hashlib.sha256((ROOT/p).read_bytes()).hexdigest(),cases=cases),separators=(',',':'))+'\n')
