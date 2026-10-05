"""Independent native illuminant oracle over synthetic input data."""
from pathlib import Path
from itertools import product
import json,sys,hashlib
import numpy as np
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.illuminant import IlluminantEngine
OUT=ROOT/'web-engine/fixtures';inputs=json.loads((OUT/'pixel-reference.json').read_text())['cases'];inputs.append(dict(name='texture',width=137,height=129,file='opencv-texture-input.rgb'));cases=[]
for f in inputs:
 rgb=np.frombuffer((OUT/f['file']).read_bytes(),np.uint8).reshape(f['height'],f['width'],3);e=IlluminantEngine(np.ascontiguousarray(rgb[:,:,::-1]));expected=[]
 for block,method,linear,exclude,mode in product((32,64,128,256),range(3),(False,True),(False,True),range(3)):
  output,result=e.compute(((block,method,linear,exclude),mode));unit,count,areas,valid,glob,angle=result
  expected.append(dict(params=dict(block=block,method=method,linear=linear,exclude=exclude,mode=mode),sha256=hashlib.sha256(output[:,:,::-1].copy().tobytes()).hexdigest(),rgb=unit.ravel().tolist(),counts=count.ravel().tolist(),areas=areas.ravel().tolist(),valid=valid.ravel().astype(int).tolist(),globalRGB=glob.tolist(),angles=angle.ravel().tolist()))
 cases.append({**f,'expected':expected})
p='source/gui/sherloq_app/core/illuminant.py';(OUT/'illuminant-reference.json').write_text(json.dumps(dict(schema=1,source=p,sha256=hashlib.sha256((ROOT/p).read_bytes()).hexdigest(),cases=cases),separators=(',',':'))+'\n')
print(sum(len(f['expected']) for f in cases),'outputs')
