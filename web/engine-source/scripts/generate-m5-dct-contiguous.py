"""Native 50MP regression fixture for the legacy contiguous load boundary."""
from pathlib import Path
import hashlib,json,sys,time
import cv2 as cv
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.double_jpeg import analyze
directory=root/'.build/integration/dct-contiguous';directory.mkdir(parents=True,exist_ok=True)
original=cv.imread(str(root.parent/'web-engine-m2/.build/forgeryscope-source/source-96mp-rich.jpg'))
source=directory/'source.jpg';assert cv.imwrite(str(source),original[:5000,:10000],[cv.IMWRITE_JPEG_QUALITY,90])
started=time.perf_counter();expected=analyze(source);assert expected['dimensions']==[10000,5000]
with source.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
size=source.stat().st_size
assert size*2+50000000*9+32*1024**2<=512*1024**2
assert size*2+50000000*10+32*1024**2>512*1024**2
report=dict(sha256=digest,sourceBytes=size,expected=expected,nativeSeconds=time.perf_counter()-started,scope='Independent full50MP JPEG made by cropping the rich96MP fixture; exercises contiguous decode plus external DCT fallback. Not a new96MP qualification.')
(root/'docs/m5-dct-contiguous-native-reference.json').write_text(json.dumps(report,indent=2)+'\n')
print('Native contiguous-boundary reference complete',flush=True)
