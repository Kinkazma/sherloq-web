from pathlib import Path
import hashlib,json,sys,time,os
import cv2 as cv
import numpy as np
root=Path(__file__).resolve().parents[1]
native=Path(os.environ.get('M5_NATIVE_SOURCE',root.parent/'source'));sys.path.insert(0,str(native))
from gui.sherloq_app.core.auto_zones import detect_panels
assert cv.__version__=='4.11.0' and np.__version__=='1.26.4'
cv.setNumThreads(1)
source=Path(os.environ.get('M5_PANELS_SOURCE',root.parent/'web-engine-m2/.build/forgeryscope-source/source-96mp-rich.jpg'))
with source.open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
assert digest=='7a6ac1368fd28adbbf841a88b3b897f791695ac6fe265c7ba6c9a93f36d704ca'
start=time.perf_counter();image=cv.imread(str(source),cv.IMREAD_COLOR);assert image.shape==(8000,12000,3)
decoded=hashlib.sha256(memoryview(image)).hexdigest();loaded=time.perf_counter();polygons=detect_panels(image);end=time.perf_counter()
proof=dict(sourceSha256=digest,width=12000,height=8000,decodedBgrSha256=decoded,polygons=polygons,decodeSeconds=loaded-start,panelSeconds=end-loaded,totalSeconds=end-start,opencv=cv.__version__,numpy=np.__version__,threads=1,nativeFunctionFileSha256=hashlib.sha256((native/'gui/sherloq_app/core/auto_zones.py').read_bytes()).hexdigest())
(root/'docs/m5-panels-96mp-native-reference.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof),flush=True)
