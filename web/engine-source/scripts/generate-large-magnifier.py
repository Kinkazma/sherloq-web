"""Native ROI references; public synthetic 96 MP JPEG, no private images."""
from pathlib import Path
from itertools import product
import hashlib,json,sys
import cv2,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.magnifier import MagnifierEngine
source=json.loads((root/'.build/jpeg-12000x8000-reference.json').read_text())
file=root/'.build'/source['file'];assert hashlib.sha256(file.read_bytes()).hexdigest()==source['originalSha256']
image=cv2.imread(str(file),cv2.IMREAD_COLOR);assert image.shape==(8000,12000,3)
engine=MagnifierEngine(image);cases=[]
for raw in [[13,17,270,210],[4793,2981,6330,4006],[-5,-3,35,29],[11971,7983,12050,8010],[12005,0,12010,20]]:
 b=engine.bounds((raw[0],raw[1],raw[2]-raw[0],raw[3]-raw[1]))
 for mode,percent,channel in [('equalize',20,False)]+[('contrast',a,c) for a,c in product((0,20,100),(False,True))]:
  _,out=engine.compute((b,mode,percent,channel))
  cases.append(dict(params=dict(bounds=raw,mode=mode,percent=percent,channel=channel),bounds=b,sha256=None if out is None else hashlib.sha256(np.ascontiguousarray(out[:,:,::-1]).tobytes()).hexdigest()))
source_files=['source/gui/sherloq_app/core/magnifier.py','source/gui/sherloq_app/core/utility.py']
record=dict(schema=1,operation='inspection.magnifier',nativeSources={p:hashlib.sha256((root.parent/p).read_bytes()).hexdigest() for p in source_files},numpy=np.__version__,opencv=cv2.__version__,originalSha256=source['originalSha256'],width=source['width'],height=source['height'],cases=cases)
(root/'.build/magnifier-12000x8000-reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(dict(cases=len(cases),width=source['width'],height=source['height'],nativeSources=record['nativeSources'])))
