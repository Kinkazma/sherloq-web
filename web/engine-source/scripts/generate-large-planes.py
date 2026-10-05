"""Independent native bit-plane references for the public synthetic96MP JPEG."""
from pathlib import Path
import hashlib,json,sys
import cv2,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.bit_planes import PlanesEngine
source=json.loads((root/'.build/jpeg-12000x8000-reference.json').read_text())
image=cv2.imread(str(root/'.build'/source['file']),cv2.IMREAD_COLOR);engine=PlanesEngine(image);cases=[]
settings=[(0,0,f) for f in range(3)]+[(4,3,f) for f in range(3)]+[(1,7,2),(2,7,1),(3,0,0)]
for channel,bit,filtering in settings:
 result=engine.compute((channel,bit,filtering));mask=np.right_shift(engine.channel(channel),bit)&1;rgb_hash=hashlib.sha256();mask_hash=hashlib.sha256()
 for y in range(0,image.shape[0],64):
  rgb_hash.update(np.ascontiguousarray(result[y:y+64,:,::-1]).tobytes());mask_hash.update(np.ascontiguousarray(mask[y:y+64]).tobytes())
 windows=[]
 for region in source['regions']:
  x,y,w,h=[region[key] for key in ['x','y','width','height']];rect={key:region[key] for key in ['x','y','width','height']}
  windows.append(dict(rect=rect,rgbSha256=hashlib.sha256(np.ascontiguousarray(result[y:y+h,x:x+w,::-1]).tobytes()).hexdigest(),maskSha256=hashlib.sha256(np.ascontiguousarray(mask[y:y+h,x:x+w]).tobytes()).hexdigest()))
 cases.append(dict(params=dict(channel=channel,bit=bit,filter=filtering),rgbSha256=rgb_hash.hexdigest(),maskSha256=mask_hash.hexdigest(),windows=windows));del result,mask
record=dict(schema=1,operation='noise.planes',sourceSha256=hashlib.sha256((root.parent/'source/gui/sherloq_app/core/bit_planes.py').read_bytes()).hexdigest(),numpy=np.__version__,opencv=cv2.__version__,originalSha256=source['originalSha256'],width=source['width'],height=source['height'],cases=cases)
(root/'.build/bit-planes-12000x8000-reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(dict(cases=len(cases),width=source['width'],height=source['height'],sourceSha256=record['sourceSha256'])))
