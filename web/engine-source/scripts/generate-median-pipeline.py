"""Public synthetic median grids and RGB pipelines, using the unchanged native engine.

Reads the already available checkpoint to generate references; never trains or
copies model weights. Render hashes cover all 101 UI thresholds separately.
"""
from pathlib import Path
import hashlib,json,sys
import numpy as np,cv2,xgboost
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.median import MedianEngine
out=root/'fixtures/median';out.mkdir(exist_ok=True);rng=np.random.default_rng(220023)
sha=lambda data:hashlib.sha256(data).hexdigest()
model_file=root.parent/'source/gui/models/median_b64.json'
def renders(engine,thresholds):
 records=[]
 for variance in (0,5,100):
  for speckle in (False,True):
   prob=engine.prob.astype(np.float32)
   if speckle:prob=cv2.medianBlur(prob,3)
   valid=(engine.var>=variance).astype(np.uint8)
   for threshold in thresholds:
    decisions=np.where(valid,np.where(prob>=threshold,2,1),0).astype(np.uint8)
    # Score mode ignores threshold; one case suffices per variance/speckle pair.
    for score in ((False,True) if threshold==thresholds[0] else (False,)):
     image,mean=engine.render((variance,threshold,score,speckle))
     records.append(dict(params=dict(variance=variance,threshold=threshold,showScore=score,speckle=speckle),rgbSha256=sha(image[:,:,::-1].copy().tobytes()),filtered=prob.ravel().tolist(),valid=valid.ravel().tolist(),decisions=decisions.ravel().tolist(),mean=mean))
 return records
cases=[]
for index,(w,h) in enumerate([(1,1),(32,17),(64,64),(65,127),(129,193)]):
 rgb=rng.integers(0,256,(h,w,3),dtype=np.uint8)
 if index%2:rgb=cv2.medianBlur(rgb,3)
 name=f'pipeline-{index}.rgb';rgb.tofile(out/name)
 engine=MedianEngine(rgb[:,:,::-1].copy(),str(model_file));engine.workers=1;engine.analyze()
 margins=np.zeros_like(engine.prob,dtype=np.float32);margins[:-1,:-1]=engine.model.inplace_predict(engine.features,predict_type='margin').reshape(engine.prob.shape[0]-1,engine.prob.shape[1]-1)
 feature_name=f'pipeline-{index}-features.f64';engine.features.astype('<f8').tofile(out/feature_name)
 gray=cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY)
 cases.append(dict(width=w,height=h,rgbFile=name,rgbSha256=sha(rgb.tobytes()),graySha256=sha(gray.tobytes()),featureFile=feature_name,featureSha256=sha((out/feature_name).read_bytes()),gridWidth=engine.prob.shape[1],gridHeight=engine.prob.shape[0],margins=margins.ravel().tolist(),probabilities=engine.prob.ravel().tolist(),variances=engine.var.ravel().tolist(),renders=renders(engine,[i/100 for i in range(101)])))
synthetic=[]
for index,(w,h) in enumerate([(1,1),(64,64),(65,127),(129,193)]):
 engine=MedianEngine(np.zeros((h,w,3),np.uint8),str(model_file))
 shape=(h//64+2,w//64+2);n=shape[0]*shape[1]
 values=np.array([0,1,.4,np.nextafter(np.float32(.4),np.float32(0)),np.nextafter(np.float32(.4),np.float32(1)),.5,2.5/255,3.5/255,.001,.999],np.float32)
 engine.prob=np.resize(values,n).reshape(shape).astype(np.float64)
 engine.var=np.resize(np.array([0,4.999999,5,5.000001,99.999999,100,100.000001]),n).reshape(shape)
 synthetic.append(dict(width=w,height=h,gridWidth=shape[1],gridHeight=shape[0],probabilities=engine.prob.ravel().tolist(),variances=engine.var.ravel().tolist(),renders=renders(engine,[0,.005,.4,float(np.float32(.4)),float(np.nextafter(np.float32(.4),np.float32(1))),.5,1])))
record=dict(schema=1,nativeSourceSha256=sha((root.parent/'source/gui/sherloq_app/core/median.py').read_bytes()),modelSha256=sha(model_file.read_bytes()),modelBundled=False,opencv=cv2.__version__,numpy=np.__version__,xgboost=xgboost.__version__,cases=cases,synthetic=synthetic)
(out/'pipeline-reference.json').write_text(json.dumps(record,separators=(',',':'))+'\n')
print(json.dumps(dict(images=len(cases),syntheticGrids=len(synthetic),renders=sum(len(c['renders']) for c in cases+synthetic),modelBundled=False)))
