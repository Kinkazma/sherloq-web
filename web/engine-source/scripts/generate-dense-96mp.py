"""Own rich large source; the shared public source is read-only."""
from pathlib import Path
import cv2, hashlib, json
source=Path('/Users/gaeldauchy/SHERLOQ/web-engine/.build/jpeg-12000x8000.jpg')
out=Path(__file__).resolve().parents[1]/'.build/dense-96mp'
out.mkdir(parents=True,exist_ok=True)
image=cv2.imread(str(source))
assert image.shape==(8000,12000,3)
image[:,6000:]=image[:,:6000]
path=out/'copy-6000.jpg'
assert cv2.imwrite(str(path),image,[cv2.IMWRITE_JPEG_QUALITY,90])
report={'source':str(source),'source_sha256':hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),'output':path.name,'sha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest(),'shape':[8000,12000,3],'recipe':'Native cv2 JPEG decode; copy entire left 6000x8000 to right half without resize; JPEG quality90. Original seeded public noise130014.','translation':[6000,0]}
(out/'recipe.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
