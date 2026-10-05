"""Native large-image channel-rank references; input is the synthetic JPEG recipe."""
from pathlib import Path
import hashlib,json,sys
import cv2,numpy as np
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.pixel_stats import StatsEngine
reference=json.loads((root/'.build/jpeg-12000x8000-reference.json').read_text())
image=cv2.imread(str(root/'.build'/reference['file']),cv2.IMREAD_COLOR)
assert image.shape[:2]==(reference['height'],reference['width'])
engine=StatsEngine(image);cases=[]
for mode in ['min','avg','max']:
 for inclusive in [False,True]:
  result=engine.compute((mode,inclusive));digest=hashlib.sha256()
  for y in range(0,result.shape[0],64):digest.update(np.ascontiguousarray(result[y:y+64,:,::-1]).tobytes())
  windows=[]
  for rect in reference['regions']:
   x,y,w,h=[rect[key] for key in ['x','y','width','height']]
   windows.append(dict(rect={key:rect[key] for key in ['x','y','width','height']},sha256=hashlib.sha256(np.ascontiguousarray(result[y:y+h,x:x+w,::-1]).tobytes()).hexdigest()))
  cases.append(dict(params=dict(mode=mode,inclusive=inclusive),rgbSha256=digest.hexdigest(),windows=windows))
  del result
record=dict(schema=1,operation='colors.stats',sourceSha256=hashlib.sha256((root.parent/'source/gui/sherloq_app/core/pixel_stats.py').read_bytes()).hexdigest(),numpy=np.__version__,opencv=cv2.__version__,originalSha256=reference['originalSha256'],width=reference['width'],height=reference['height'],cases=cases)
(root/'.build/pixel-stats-12000x8000-reference.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(dict(cases=len(cases),width=reference['width'],height=reference['height'],sourceSha256=record['sourceSha256'])))
