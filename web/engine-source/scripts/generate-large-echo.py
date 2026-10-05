"""Public synthetic odd-sized JPEG and unchanged whole-image Echo CPU oracles."""
from pathlib import Path
import hashlib,json,sys
import cv2,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.interactive import EchoEngine
cv2.setNumThreads(1);w,h,seed=4099,3077,1001410;file=root/'.build/echo-4099x3077.jpg'
if not file.exists():
 image=np.random.default_rng(seed).integers(0,256,(h,w,3),dtype=np.uint8);assert cv2.imwrite(str(file),image,[cv2.IMWRITE_JPEG_QUALITY,90]);del image
image=cv2.imread(str(file),cv2.IMREAD_COLOR);assert image.shape==(h,w,3);engine=EchoEngine(image,backend='cpu');cases=[]
regions=[dict(x=0,y=0,width=17,height=19),dict(x=w-31,y=h-23,width=31,height=23),dict(x=w//2-33,y=h//2-35,width=67,height=71),dict(x=13,y=57,width=257,height=63)]
for radius,contrast,grayscale in [(4,0,False),(5,85,True),(15,85,False)]:
 out=engine.compute((radius,contrast,grayscale));digest=hashlib.sha256();windows=[]
 for y in range(0,h,64):digest.update(np.ascontiguousarray(out[y:y+64,:,::-1]).tobytes())
 for r in regions:
  x,y,rw,rh=[r[k] for k in ['x','y','width','height']];windows.append(dict(rect=r,sha256=hashlib.sha256(np.ascontiguousarray(out[y:y+rh,x:x+rw,::-1]).tobytes()).hexdigest()))
 cases.append(dict(params=dict(radius=radius,contrast=contrast,grayscale=grayscale),sha256=digest.hexdigest(),windows=windows))
native=['source/gui/sherloq_app/core/'+n+'.py' for n in ['interactive','echo_bounded','utility']]
record=dict(schema=1,scope='Whole native EchoEngine CPU; full-image global normalization.',recipe=dict(seed=seed,generator='numpy.default_rng uint8 BGR',jpegQuality=90),file=file.name,operation='detail.echo',nativeSources={p:hashlib.sha256((root.parent/p).read_bytes()).hexdigest() for p in native},numpy=np.__version__,opencv=cv2.__version__,originalSha256=hashlib.sha256(file.read_bytes()).hexdigest(),width=w,height=h,cases=cases)
(root/'.build/echo-4099x3077-reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(dict(cases=len(cases),width=w,height=h,originalSha256=record['originalSha256'])))
