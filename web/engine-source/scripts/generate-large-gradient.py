"""Whole-image native gradient oracles on the public synthetic 96 MP JPEG."""
from pathlib import Path
import hashlib,json,sys
import cv2,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.gradient import GradientEngine
cv2.setNumThreads(1)
source=json.loads((root/'.build/jpeg-12000x8000-reference.json').read_text());file=root/'.build'/source['file'];assert hashlib.sha256(file.read_bytes()).hexdigest()==source['originalSha256']
image=cv2.imread(str(file),cv2.IMREAD_COLOR);engine=GradientEngine(image);cases=[]
for intensity,mode,invert,equalize in [(0,2,False,False),(33,3,True,False),(95,3,True,True)]:
 out=engine.compute((intensity,mode,invert,equalize));digest=hashlib.sha256();windows=[]
 for y in range(0,image.shape[0],64):digest.update(np.ascontiguousarray(out[y:y+64,:,::-1]).tobytes())
 for r in source['regions']:
  x,y,w,h=[r[k] for k in ['x','y','width','height']];windows.append(dict(rect={k:r[k] for k in ['x','y','width','height']},sha256=hashlib.sha256(np.ascontiguousarray(out[y:y+h,x:x+w,::-1]).tobytes()).hexdigest()))
 cases.append(dict(params=dict(intensity=intensity,mode=mode,invert=invert,equalize=equalize),sha256=digest.hexdigest(),windows=windows))
native=['source/gui/sherloq_app/core/'+n+'.py' for n in ['gradient','gradient_bounded','utility']]
record=dict(schema=1,scope='Unchanged whole-image native GradientEngine, including all global reductions and final displays.',operation='detail.gradient',nativeSources={p:hashlib.sha256((root.parent/p).read_bytes()).hexdigest() for p in native},numpy=np.__version__,opencv=cv2.__version__,originalSha256=source['originalSha256'],width=source['width'],height=source['height'],cases=cases)
(root/'.build/gradient-12000x8000-reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(dict(cases=len(cases),nativeSources=record['nativeSources'])))
