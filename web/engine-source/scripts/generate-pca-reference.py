from pathlib import Path
from itertools import product
import sys,json,hashlib,numpy as np
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.pca import PcaEngine
OUT=ROOT/'web-engine/fixtures';inputs=json.loads((OUT/'pixel-reference.json').read_text())['cases'];inputs.append(dict(name='texture',width=137,height=129,file='opencv-texture-input.rgb'));cases=[]
for f in inputs:
 bgr=np.frombuffer((OUT/f['file']).read_bytes(),np.uint8).reshape(f['height'],f['width'],3)[:,:,::-1].copy();e=PcaEngine(bgr);raw=bytearray();expected=[]
 for component,mode,invert,equalize in product(range(3),['distance','project','crossprod'],[False,True],[False,True]):
  result,model=e.compute((component,mode,invert,equalize));rgb=result[:,:,::-1].copy().tobytes();expected.append(dict(params=dict(component=component,mode=mode,invert=invert,equalize=equalize),sha256=hashlib.sha256(rgb).hexdigest(),offset=len(raw),length=len(rgb)));raw.extend(rgb)
 file='pca-'+f['name']+'.rgb';(OUT/file).write_bytes(raw);cases.append({**f,'outputFile':file,'expected':expected,'model':dict(mean=model[0].ravel().tolist(),eigenvectors=model[1].ravel().tolist(),eigenvalues=model[2].ravel().tolist())})
p='source/gui/sherloq_app/core/pca.py';(OUT/'pca-reference.json').write_text(json.dumps(dict(schema=1,source=p,sha256=hashlib.sha256((ROOT/p).read_bytes()).hexdigest(),cases=cases),separators=(',',':'))+'\n');print(sum(len(f['expected']) for f in cases),'PCA outputs')
