"""Public synthetic non-JPEG quality predictions from the unchanged native engine.

Checks the existing checkpoint's identity, generates no weights, and never trains.
"""
from pathlib import Path
import hashlib,json,sys
import cv2 as cv,numpy as np,xgboost
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT.parent/'source'))
from gui.sherloq_app.core.jpeg_quality import QualityEngine,quality_booster
source=ROOT.parent/'source/gui/models/jpeg_qf.mdl';source_sha=hashlib.sha256(source.read_bytes()).hexdigest();assert source_sha=='4b3a90e3b22ec4436b4a4e2bee7abd5055e7c541d2d3ae9b541dc890656424d4'
out=ROOT/'fixtures/quality-model';out.mkdir(exist_ok=True);images=[];sha=lambda b:hashlib.sha256(b).hexdigest()
for name in ('synthetic.jpg','one.jpg','odd.jpg','gray.jpg','progressive.jpg','exif-6-le.jpg'):
 images.append((Path(name).stem+'.png',cv.imread(str(ROOT/'fixtures'/name))))
rng=np.random.default_rng(230002);images.extend([('constant.png',np.full((17,23,3),127,np.uint8)),('raw.png',rng.integers(0,256,(35,67,3),dtype=np.uint8)),('gray16.png',rng.integers(0,65536,(29,41),dtype=np.uint16)),('rgb16.tiff',rng.integers(0,65536,(19,31,3),dtype=np.uint16))])
images.append(('large.png',cv.imread(str(ROOT/'fixtures/median/median-1024.jpg'))))
cases=[]
for name,original in images:
 cv.imwrite(str(out/name),original);image=cv.imread(str(out/name));engine=QualityEngine(str(out/name),image,workers=1);result=engine.compute();assert result['quantization'] is None and result['metadata_error'] is None and result['model_error'] is None
 cases.append(dict(file=name,width=image.shape[1],height=image.shape[0],originalSha256=sha((out/name).read_bytes()),rgbSha256=sha(image[:,:,::-1].copy().tobytes()),raw=[engine.raw[q] for q in range(1,101)],curve=result['curve'].tolist(),minimum=result['minimum'],prediction=result['prediction'],display=f"{result['prediction']:.1f}"))
record=dict(schema=1,source='public generated PNG/TIFF, including re-encoded synthetic JPEG pixels; no private images',nativeSourceSha256=sha((ROOT.parent/'source/gui/sherloq_app/core/jpeg_quality.py').read_bytes()),sourceModelSha256=source_sha,modelBundled=False,opencv=cv.__version__,numpy=np.__version__,xgboost=xgboost.__version__,cases=cases)
(out/'reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(dict(images=len(cases),predictions=len(cases),weightsBundled=False)))
