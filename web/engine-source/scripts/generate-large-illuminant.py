"""Unchanged native illuminant estimates and whole-image render on public96MP."""
from pathlib import Path
import hashlib,json,sys
import cv2,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.illuminant import IlluminantEngine
cv2.setNumThreads(1)
source=json.loads((root/'.build/jpeg-12000x8000-reference.json').read_text());file=root/'.build'/source['file'];assert hashlib.sha256(file.read_bytes()).hexdigest()==source['originalSha256']
image=cv2.imread(str(file),cv2.IMREAD_COLOR);engine=IlluminantEngine(image);cases=[]
for index,(block,method,linear,exclude,mode) in enumerate([(32,1,True,True,1),(128,2,False,False,0),(256,0,True,True,2)]):
 out,result=engine._compute(((block,method,linear,exclude),mode));digest=hashlib.sha256();windows=[]
 for y in range(0,image.shape[0],64):digest.update(np.ascontiguousarray(out[y:y+64,:,::-1]).tobytes())
 for r in source['regions']:
  x,y,w,h=[r[k] for k in ['x','y','width','height']];windows.append(dict(rect={k:r[k] for k in ['x','y','width','height']},sha256=hashlib.sha256(np.ascontiguousarray(out[y:y+h,x:x+w,::-1]).tobytes()).hexdigest()))
 arrays={}
 for name,value in zip(['rgb','counts','areas','valid','globalRGB','angles'],result):
  dtype='<f8' if name in ['rgb','globalRGB','angles'] else 'u1' if name=='valid' else '<u4';data=np.ascontiguousarray(value,dtype=dtype).tobytes();namefile=f'illuminant-12000x8000-{index}-{name}.bin';(root/'.build'/namefile).write_bytes(data);arrays[name]=dict(file=namefile,sha256=hashlib.sha256(data).hexdigest(),bytes=len(data),dtype=dtype)
 cases.append(dict(params=dict(block=block,method=method,linear=linear,exclude=exclude,mode=mode),sha256=digest.hexdigest(),windows=windows,arrays=arrays))
p='source/gui/sherloq_app/core/illuminant.py'
record=dict(schema=1,scope='Unchanged native complete-frame illuminant analysis and rendering; all global histogram bins retained.',operation='various.illuminant',nativeSources={p:hashlib.sha256((root.parent/p).read_bytes()).hexdigest()},numpy=np.__version__,opencv=cv2.__version__,originalSha256=source['originalSha256'],width=source['width'],height=source['height'],cases=cases)
(root/'.build/illuminant-12000x8000-reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(dict(cases=len(cases),nativeSources=record['nativeSources'])))
