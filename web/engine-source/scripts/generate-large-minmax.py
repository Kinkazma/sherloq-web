"""Independent native extrema references for the public synthetic96MP JPEG.

Call the full-image CPU reference explicitly; browser proof is separate.
"""
from pathlib import Path
import hashlib,json,sys,gc
import cv2,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.minmax import MinMaxEngine
source=json.loads((root/'.build/jpeg-12000x8000-reference.json').read_text())
image=cv2.imread(str(root/'.build'/source['file']),cv2.IMREAD_COLOR);cases=[]
settings=[(0,1,0,0),(0,1,0,1),(1,3,3,2),(2,4,3,3),(3,3,4,4),(4,2,0,5)]
for channel,minimum,maximum,filtering in settings:
 engine=MinMaxEngine(image);result,low,high=engine._compute((channel,minimum,maximum,filtering));hashes={key:hashlib.sha256() for key in ['rgb','minimum','maximum']}
 for y in range(0,image.shape[0],64):
  hashes['rgb'].update(np.ascontiguousarray(result[y:y+64,:,::-1]).tobytes())
  for key,mask in [('minimum',low),('maximum',high)]:hashes[key].update(np.ascontiguousarray(mask[y:y+64],dtype=np.uint8).tobytes())
 windows=[]
 for region in source['regions']:
  x,y,w,h=[region[key] for key in ['x','y','width','height']];rect={key:region[key] for key in ['x','y','width','height']}
  windows.append(dict(rect=rect,rgbSha256=hashlib.sha256(np.ascontiguousarray(result[y:y+h,x:x+w,::-1]).tobytes()).hexdigest(),maskSha256={key:hashlib.sha256(np.ascontiguousarray(mask[y:y+h,x:x+w],dtype=np.uint8).tobytes()).hexdigest() for key,mask in [('minimum',low),('maximum',high)]}))
 cases.append(dict(params=dict(channel=channel,minimum=minimum,maximum=maximum,filter=filtering),rgbSha256=hashes['rgb'].hexdigest(),maskSha256={key:hashes[key].hexdigest() for key in ['minimum','maximum']},windows=windows));del engine,result,low,high;gc.collect()
record=dict(schema=1,operation='noise.minmax',sourceSha256=hashlib.sha256((root.parent/'source/gui/sherloq_app/core/minmax.py').read_bytes()).hexdigest(),numpy=np.__version__,opencv=cv2.__version__,referencePath='MinMaxEngine._compute (full-image CPU)',originalSha256=source['originalSha256'],width=source['width'],height=source['height'],cases=cases)
(root/'.build/minmax-12000x8000-reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(dict(cases=len(cases),width=source['width'],height=source['height'],sourceSha256=record['sourceSha256'])))
