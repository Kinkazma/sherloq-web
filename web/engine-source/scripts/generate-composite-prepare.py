from pathlib import Path
import sys,json
import numpy as np
import cv2 as cv
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.splicing import estimate_model,noise_display
from gui.sherloq_app.core.jpeg_curve import RecompressionCurve
out=root/'.build/composite';cases=[]
for i,(h,w) in enumerate([(73,81),(96,128)]):
 rgb=np.random.default_rng(875+i).integers(0,256,(h,w,3),dtype=np.uint8)
 if i:
  _,jpg=cv.imencode('.jpg',rgb[:,:,::-1],[cv.IMWRITE_JPEG_QUALITY,90]);rgb=cv.imdecode(jpg,cv.IMREAD_COLOR)[:,:,::-1].copy()
 gray=cv.cvtColor(rgb,cv.COLOR_RGB2GRAY).astype(np.float32)/255
 noise=np.random.default_rng(3+i).normal(0,2,(h,w)).astype(np.float32)
 curve=RecompressionCurve(rgb[:,:,::-1]).compute();arrays=dict(rgb=rgb,gray=gray,noise=noise,noise_rgb=noise_display(noise)[:,:,::-1],curve=curve)
 files={}
 for name,value in arrays.items():
  file=f'prepare-{i}-{name}.bin';value.tofile(out/file);files[name]=dict(file=file,dtype=str(value.dtype),shape=list(value.shape))
 cases.append(dict(id=i,width=w,height=h,model=estimate_model(rgb[:,:,::-1]),files=files))
(out/'prepare-reference.json').write_text(json.dumps(cases,separators=(',',':'))+'\n')
