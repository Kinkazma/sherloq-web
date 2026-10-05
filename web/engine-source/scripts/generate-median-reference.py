"""Synthetic/public native64x64 median features; no training or private images.

The native checkpoint is read only to pin existing scores. It is not copied.
"""
from pathlib import Path
import hashlib,json,sys
import numpy as np,cv2,xgboost as xgb
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.median import get_features
out=root/'fixtures/median';out.mkdir(exist_ok=True);rng=np.random.default_rng(210022);images=[]
for i in range(36):
 image=np.zeros((64,64),np.uint8) if i==0 else np.full((64,64),127,np.uint8) if i==1 else rng.integers(0,256,(64,64),dtype=np.uint8)
 if i%3==0:image=cv2.medianBlur(image,3)
 if i%7==0:image=cv2.GaussianBlur(image,(5,5),1)
 images.append(image)
images=np.stack(images);images.tofile(out/'gray-blocks.bin');formats=[]
for features,windows,levels in [(8,1,1),(24,3,1),(96,3,4),(128,4,4)]:
 values=np.stack([get_features(image,windows,levels) for image in images]).astype('<f8');name=f'features-{features}.f64';values.tofile(out/name)
 formats.append(dict(features=features,windows=windows,levels=levels,file=name,sha256=hashlib.sha256((out/name).read_bytes()).hexdigest()))
 if features==128:final=values
model_file=root.parent/'source/gui/models/median_b64.json';model=xgb.Booster({'nthread':2});model.load_model(model_file);model.set_param({'nthread':2});margin=model.inplace_predict(final,predict_type='margin');scores=model.inplace_predict(final)
record=dict(schema=1,images=len(images),grayFile='gray-blocks.bin',graySha256=hashlib.sha256(images.tobytes()).hexdigest(),numpy=np.__version__,opencv=cv2.__version__,xgboost=xgb.__version__,nativeSourceSha256=hashlib.sha256((root.parent/'source/gui/sherloq_app/core/median.py').read_bytes()).hexdigest(),modelSha256=hashlib.sha256(model_file.read_bytes()).hexdigest(),modelBundled=False,formats=formats,variance=[float(np.var(image)) for image in images],margins=margin.tolist(),scores=scores.tolist())
(out/'reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(dict(images=len(images),formats=len(formats),modelBundled=False)))
