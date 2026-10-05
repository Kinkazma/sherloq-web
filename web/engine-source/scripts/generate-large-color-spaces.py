"""Native full-row channel references for the existing public 96 MP JPEG."""
from pathlib import Path
import hashlib,json,sys
import cv2,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.color_spaces import SpaceEngine
source=json.loads((root/'.build/jpeg-12000x8000-reference.json').read_text());file=root/'.build'/source['file']
assert hashlib.sha256(file.read_bytes()).hexdigest()==source['originalSha256'];image=cv2.imread(str(file),cv2.IMREAD_COLOR);cases=[]
for space,channel in [('hsv',0),('hls',2),('luv',1)]:
 digest=hashlib.sha256();windows=[]
 for y in range(0,image.shape[0],64):
  # These pointwise functions preserve complete native row width and its tails.
  out=SpaceEngine(image[y:y+64])._compute((space,channel));digest.update(np.ascontiguousarray(out[:,:,::-1]).tobytes())
 for r in source['regions']:
  x,y,w,h=[r[k] for k in ['x','y','width','height']];out=SpaceEngine(image[y:y+h])._compute((space,channel));windows.append(dict(rect={k:r[k] for k in ['x','y','width','height']},sha256=hashlib.sha256(np.ascontiguousarray(out[:,x:x+w,::-1]).tobytes()).hexdigest()))
 cases.append(dict(params=dict(space=space,channel=channel),sha256=digest.hexdigest(),windows=windows))
native='source/gui/sherloq_app/core/color_spaces.py';record=dict(schema=1,scope='Complete native oriented-width row strips; pixel-independent color conversion only.',operation='colors.space',nativeSourceSha256=hashlib.sha256((root.parent/native).read_bytes()).hexdigest(),numpy=np.__version__,opencv=cv2.__version__,originalSha256=source['originalSha256'],width=source['width'],height=source['height'],cases=cases)
(root/'.build/color-spaces-12000x8000-reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(dict(cases=len(cases),nativeSourceSha256=record['nativeSourceSha256'])))
