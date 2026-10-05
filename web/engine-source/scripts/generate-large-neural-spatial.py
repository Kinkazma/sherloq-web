"""Native source-coordinate projection oracles; synthetic grids, not detections."""
from pathlib import Path
import cv2,numpy as np,json,hashlib,time
root=Path(__file__).resolve().parents[1];out=root/'.build/neural-spatial-bands';out.mkdir(exist_ok=True);cv2.setNumThreads(1);rng=np.random.default_rng(448512256);cases=[];started=time.perf_counter()
for side,w,h,nearest in [(448,12000,8000,False),(256,12000,8000,True),(512,12003,8003,False)]:
 values=rng.random((side,side),dtype=np.float32)
 if nearest:values=(values>.5).astype(np.float32)
 name=f'grid-{side}.f32';data=values.tobytes();(out/name).write_bytes(data);resized=cv2.resize(values,(w,h),interpolation=cv2.INTER_NEAREST if nearest else cv2.INTER_LINEAR);digest=hashlib.sha256()
 for y in range(0,h,64):digest.update(resized[y:y+64].tobytes())
 windows=[]
 for x,y,ww,hh in [(0,0,67,71),(w//2-13,h//2-7,131,67),(w-31,h-29,31,29)]:windows.append(dict(rect=dict(x=x,y=y,width=ww,height=hh),sha256=hashlib.sha256(resized[y:y+hh,x:x+ww].tobytes()).hexdigest()))
 cases.append(dict(side=side,width=w,height=h,nearest=nearest,input=dict(file=name,sha256=hashlib.sha256(data).hexdigest()),sha256=digest.hexdigest(),windows=windows));del resized;print(json.dumps(dict(side=side,nearest=nearest)),flush=True)
(out/'large-reference.json').write_text(json.dumps(dict(schema=1,scope='Native OpenCV projection of synthetic finite float32 grids to whole96MP geometry. No inference or model-mask accuracy claim.',opencv=cv2.__version__,cases=cases),indent=2)+'\n');print(json.dumps(dict(cases=len(cases),seconds=time.perf_counter()-started)))
