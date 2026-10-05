from pathlib import Path
import sys,json
import numpy as np
from matplotlib import colormaps
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.trufor import TruForRenderer
lut=(colormaps['RdBu_r'](np.arange(256))[:,:3]*255).astype(np.uint8)
(root/'src/trufor-palette.js').write_text('// Native matplotlib RdBu_r, 256 quantized RGB bins.\nexport const TRUFOR_PALETTE=new Uint8Array('+json.dumps(lut.ravel().tolist(),separators=(',',':'))+');\n')
rng=np.random.default_rng(448);cases=[]
for kind in ('random','constant','bins'):
 values=rng.normal(0,3,600).astype(np.float32) if kind=='random' else np.full(600,2.5,np.float32) if kind=='constant' else np.linspace(-.001,1.001,600,dtype=np.float32)
 result={'map':np.clip(values,0,1).reshape(20,30),'conf':np.clip(values/4,0,1).reshape(20,30),'np++':values.reshape(20,30)}
 renderer=TruForRenderer(result);cases.append(dict(kind=kind,width=30,height=20,data={k:v.ravel().tolist() for k,v in result.items()},expected=[renderer.render(i)[:,:,::-1].ravel().tolist() for i in range(3)]))
out=root/'tests/data/trufor';out.mkdir(parents=True,exist_ok=True);(out/'render.json').write_text(json.dumps(cases,separators=(',',':'))+'\n')
