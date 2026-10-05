"""Regenerate private development vectors from an existing local checkpoint.

Vectors touch real split boundaries; keep them in excluded .build, never in the
delivery. Only the aggregate verification report is a public proof. No training.
"""
from pathlib import Path
import sys,json,hashlib
import numpy as np,cv2,xgboost as xgb
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.median import get_features
model_path=Path(sys.argv[1]) if len(sys.argv)>1 else root.parent/'source/gui/models/median_b64.json'
rng=np.random.default_rng(210022);features=[]
for i in range(36):
 image=np.zeros((64,64),np.uint8) if i==0 else np.full((64,64),127,np.uint8) if i==1 else rng.integers(0,256,(64,64),dtype=np.uint8)
 if i%3==0:image=cv2.medianBlur(image,3)
 if i%7==0:image=cv2.GaussianBlur(image,(5,5),1)
 features.append(get_features(image,4,4))
a=np.array(features);j=json.loads(model_path.read_text());trees=j['learner']['gradient_booster']['model']['trees'];random=rng.uniform(a.min(0),a.max(0),(2048,128))
for i in range(2048):
 tree=trees[i%len(trees)];fid=tree['split_indices'][0];value=np.float32(tree['split_conditions'][0]);random[i,fid]=np.nextafter(value,np.float32(np.inf if i%2 else -np.inf)) if i%3 else value
 if i%23==0:random[i,(i*7)%128]=np.nan
values=np.concatenate((a,random));model=xgb.Booster({'nthread':2});model.load_model(model_path);model.set_param({'nthread':2})
margin=model.inplace_predict(values,predict_type='margin');scores=model.inplace_predict(values)
out=root/'.build/median-arithmetic';out.mkdir(exist_ok=True);files={}
for name,array in [('features.f64',values.astype('<f8')),('margins.f32',margin.astype('<f4')),('scores.f32',scores.astype('<f4'))]:
 array.tofile(out/name);files[name]=hashlib.sha256((out/name).read_bytes()).hexdigest()
(out/'reference.json').write_text(json.dumps(dict(rows=len(values),features=128,nativeFeatureRows=len(a),xgboost=xgb.__version__,numpy=np.__version__,opencv=cv2.__version__,modelSha256=hashlib.sha256(model_path.read_bytes()).hexdigest(),files=files),indent=2)+'\n')
print(json.dumps(dict(rows=len(values),finiteMargins=bool(np.isfinite(margin).all()),vectorsExcludedFromDelivery=True)))
