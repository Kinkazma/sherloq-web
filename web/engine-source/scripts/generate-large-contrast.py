"""Whole native contrast maps and displays on public synthetic12.61MP JPEG."""
from pathlib import Path
import hashlib,json,sys
import cv2,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.contrast import ContrastEngine
cv2.setNumThreads(1)
source=json.loads((root/'.build/echo-4099x3077-reference.json').read_text());file=root/'.build'/source['file'];assert hashlib.sha256(file.read_bytes()).hexdigest()==source['originalSha256']
image=cv2.imread(str(file),cv2.IMREAD_COLOR);engine=ContrastEngine(image);cases=[]
for block,mode in [(32,0),(64,1),(256,2)]:
 maps=engine.analyze(block);out=engine.render(block,mode,maps);digest=hashlib.sha256();windows=[]
 for y in range(0,image.shape[0],64):digest.update(np.ascontiguousarray(out[y:y+64,:,::-1]).tobytes())
 for r in source['cases'][0]['windows']:
  rect=r['rect'];x,y,w,h=[rect[k] for k in ['x','y','width','height']];windows.append(dict(rect=rect,sha256=hashlib.sha256(np.ascontiguousarray(out[y:y+h,x:x+w,::-1]).tobytes()).hexdigest()))
 values=np.stack(maps,axis=-1);(root/'.build'/f'contrast-4099x3077-{block}-maps.bin').write_bytes(values.tobytes());cases.append(dict(params=dict(block=block,mode=mode),sha256=digest.hexdigest(),windows=windows,mapSha256=hashlib.sha256(values.tobytes()).hexdigest(),shape=list(values.shape)))
p='source/gui/sherloq_app/core/contrast.py'
record=dict(schema=1,scope='Whole native ContrastEngine global preparation, all padded blocks, median map and cropped nearest rendering.',operation='tampering.contrast',nativeSources={p:hashlib.sha256((root.parent/p).read_bytes()).hexdigest()},numpy=np.__version__,opencv=cv2.__version__,originalSha256=source['originalSha256'],width=source['width'],height=source['height'],cases=cases)
(root/'.build/contrast-4099x3077-reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(dict(cases=len(cases),nativeSources=record['nativeSources'])))
