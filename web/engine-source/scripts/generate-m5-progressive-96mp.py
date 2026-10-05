"""Native progressive96MP decode with EXIF rotation, full RGB and ELA hashes."""
from pathlib import Path
import cv2 as cv
import hashlib,json,struct,sys,time
from PIL import Image
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.ela import ElaEngine
assert cv.__version__=='4.11.0';cv.setNumThreads(1);started=time.perf_counter()
original=root.parent/'web-engine-m2/.build/forgeryscope-source/source-96mp-rich.jpg'
folder=root/'.build/integration/progressive-96mp';folder.mkdir(parents=True,exist_ok=True)
image=cv.imread(str(original));assert image.shape==(8000,12000,3)
path=folder/'source.jpg';assert cv.imwrite(str(path),image,[cv.IMWRITE_JPEG_QUALITY,90,cv.IMWRITE_JPEG_PROGRESSIVE,1]);del image
exif=Image.Exif();exif[274]=6;payload=exif.tobytes();encoded=path.read_bytes();path.write_bytes(encoded[:2]+b'\xff\xe1'+struct.pack('>H',len(payload)+2)+payload+encoded[2:]);del encoded
image=cv.imread(str(path));assert image.shape==(12000,8000,3)
rgb=cv.cvtColor(image,cv.COLOR_BGR2RGB);rgb_sha=hashlib.sha256(memoryview(rgb)).hexdigest();del rgb
ela=ElaEngine(image).compute((75,50,20,False,False));rgb=cv.cvtColor(ela,cv.COLOR_BGR2RGB);ela_sha=hashlib.sha256(memoryview(rgb)).hexdigest();del ela,rgb,image
with path.open('rb') as stream:sha=hashlib.file_digest(stream,'sha256').hexdigest()
report=dict(width=8000,height=12000,encodedDimensions=[12000,8000],orientation=6,progressive=True,sourceBytes=path.stat().st_size,sha256=sha,rgbSha256=rgb_sha,elaSha256=ela_sha,elaParams=dict(quality=75,scale=50,contrast=20,linear=False,grayscale=False),opencv=cv.__version__,nativeSeconds=time.perf_counter()-started,complexity='Rich M2 original with distant copied boxes, encoded as progressive JPEG90 and EXIF orientation6; full native decoded pixels, no source reduction.')
(root/'docs/m5-progressive-96mp-native-reference.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
