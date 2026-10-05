from pathlib import Path
import ast,json
import numpy as np
import cv2 as cv
root=Path(__file__).resolve().parents[1];source=root.parent/'source/gui/sherloq_app/ui/research_panel.py'
module=ast.parse(source.read_text());function=next(n for n in module.body if isinstance(n,ast.FunctionDef) and n.name=='display');namespace={'np':np,'cv':cv};exec(compile(ast.Module(body=[function],type_ignores=[]),str(source),'exec'),namespace)
lut=cv.applyColorMap(np.arange(256,dtype=np.uint8)[:,None],cv.COLORMAP_INFERNO)[:,0,::-1]
(root/'src/research-palette.js').write_text('// Native OpenCV INFERNO lookup in RGB order.\nexport const INFERNO=new Uint8Array('+json.dumps(lut.ravel().tolist(),separators=(',',':'))+');\n')
cases=[];rng=np.random.default_rng(3)
for method in ['catnet','adaptive_cfa']:
 image=rng.integers(0,256,(27,29,3),dtype=np.uint8)
 if method=='catnet':result=dict(map=np.array([[-.1,.3,.9],[1.1,.5,0]],np.float32),metadata=dict(method=method))
 else:result=dict(suspicion=np.array([[.1,.2],[.7,1]],np.float32),local_grid=np.array([[0,1],[2,3]],np.uint8),metadata=dict(method=method,block=8,origin=[4,4],valid_shape=[16,16]))
 for mode in range(3 if method=='adaptive_cfa' else 2):
  rendered=namespace['display']((image[:,:,::-1].copy(),result,mode))[:,:,::-1]
  cases.append(dict(width=29,height=27,method=method,mode=mode,rgb=image.ravel().tolist(),result={k:v.tolist() if isinstance(v,np.ndarray) else v for k,v in result.items()},expected=rendered.ravel().tolist()))
path=root/'tests/data/research-render.json';path.write_text(json.dumps(cases,separators=(',',':'))+'\n')
