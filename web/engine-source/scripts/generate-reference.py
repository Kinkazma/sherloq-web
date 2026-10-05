"""Synthetic, redistributable reference only. Run with the native environment."""
from pathlib import Path
import sys, json, hashlib
import cv2 as cv
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.ela import ElaEngine
OUT=ROOT/'web-engine/fixtures';OUT.mkdir(exist_ok=True)
def sha(data):return hashlib.sha256(data).hexdigest()
def write(name,data):
    data=bytes(data);(OUT/name).write_bytes(data);return dict(file=name,sha256=sha(data),bytes=len(data))
y,x=np.indices((48,64));rgb=np.stack(((x*17+y*3)%256,(x*5+y*23)%256,((x//8+y//8)%2)*220+17),axis=2).astype(np.uint8)
rng=np.random.default_rng(7281);rgb[12:30,19:44]=rng.integers(0,256,(18,25,3),dtype=np.uint8)
_,jpeg=cv.imencode('.jpg',rgb[:,:,::-1],[cv.IMWRITE_JPEG_QUALITY,91]);write('synthetic.jpg',jpeg)
cases=[]
for name,rgb in [('synthetic',cv.imdecode(jpeg,cv.IMREAD_COLOR)[:,:,::-1]),('all-byte-pairs',np.stack((np.repeat(np.arange(256,dtype=np.uint8),256),np.tile(np.arange(256,dtype=np.uint8),256),np.arange(65536,dtype=np.uint32)%256),axis=1).astype(np.uint8).reshape(256,256,3))]:
    bgr=np.ascontiguousarray(rgb[:,:,::-1]);engine=ElaEngine(bgr)
    if name=='all-byte-pairs':
        rec=np.ascontiguousarray(rgb.transpose(1,0,2)[:,:,::-1]);engine.compressed.put(75,rec)
    rec=engine.recompressed(75)
    expected=[]
    for linear in (False,True):
        for gray in (False,True):
            for scale,contrast in ((1,0),(50,20),(100,100),(37,59),(20,0)):
                params=(75,scale,contrast,linear,gray)
                result=np.ascontiguousarray(engine.compute(params)[:,:,::-1])
                expected.append(dict(params=dict(quality=75,scale=scale,contrast=contrast,linear=linear,grayscale=gray),sha256=sha(result.tobytes())))
    cases.append(dict(name=name,width=rgb.shape[1],height=rgb.shape[0],original=write(name+'.rgb',np.ascontiguousarray(rgb).tobytes()),recompressed=write(name+'.q75.rgb',np.ascontiguousarray(rec[:,:,::-1]).tobytes()),expected=expected))
report=dict(schema=1,source='generated arithmetic pattern and seeded noise; no user image',opencv=cv.__version__,jpeg=next(x.strip() for x in cv.getBuildInformation().splitlines() if 'JPEG:' in x),cases=cases)
(OUT/'reference.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(cases=len(cases),expected=sum(len(c['expected']) for c in cases))))
