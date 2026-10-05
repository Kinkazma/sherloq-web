"""Synthetic1MP JPEG and native detector reference; no private image or training."""
from pathlib import Path
import hashlib,json,sys
import numpy as np,cv2,xgboost
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.median import MedianEngine
out=root/'fixtures/median';w=h=1024;rgb=np.empty((h,w,3),np.uint8);state=220024
for y in range(h):
 for x in range(w):
  state^=(state<<13)&0xffffffff;state^=state>>17;state^=(state<<5)&0xffffffff;state&=0xffffffff
  rgb[y,x]=[(state>>i)&255 for i in (0,8,16)] if x<w//2 else [(x//8+y//8+c*47)%256 for c in range(3)]
rgb[128:768,128:448]=cv2.medianBlur(rgb[128:768,128:448],3)
ok,jpeg=cv2.imencode('.jpg',rgb[:,:,::-1], [cv2.IMWRITE_JPEG_QUALITY,95]);assert ok
name='median-1024.jpg';(out/name).write_bytes(jpeg.tobytes());image=cv2.imdecode(jpeg,cv2.IMREAD_COLOR)
model_file=root.parent/'source/gui/models/median_b64.json';engine=MedianEngine(image,str(model_file));engine.workers=2;engine.analyze()
margin=np.zeros_like(engine.prob,dtype=np.float32);margin[:-1,:-1]=engine.model.inplace_predict(engine.features,predict_type='margin').reshape(engine.prob.shape[0]-1,engine.prob.shape[1]-1)
sha=lambda data:hashlib.sha256(data).hexdigest();cases=[]
for score,speckle in [(False,True),(True,True),(False,False),(True,False)]:
 p=(5,.4,score,speckle);pixels,mean=engine.render(p);prob=engine.prob.astype(np.float32);prob=cv2.medianBlur(prob,3) if speckle else prob;valid=engine.var>=5;decisions=np.where(valid,np.where(prob>=.4,2,1),0).astype(np.uint8)
 cases.append(dict(params=dict(variance=5,threshold=.4,showScore=score,speckle=speckle),rgbSha256=sha(pixels[:,:,::-1].copy().tobytes()),decisionSha256=sha(decisions.tobytes()),validSha256=sha(valid.astype(np.uint8).tobytes()),mean=mean))
record=dict(schema=1,width=w,height=h,file=name,bytes=len(jpeg),jpegSha256=sha(jpeg.tobytes()),rgbSha256=sha(image[:,:,::-1].copy().tobytes()),modelSha256=sha(model_file.read_bytes()),modelBundled=False,nativeSourceSha256=sha((root.parent/'source/gui/sherloq_app/core/median.py').read_bytes()),opencv=cv2.__version__,numpy=np.__version__,xgboost=xgboost.__version__,gridWidth=engine.prob.shape[1],gridHeight=engine.prob.shape[0],probabilities=engine.prob.ravel().tolist(),variances=engine.var.ravel().tolist(),margins=margin.ravel().tolist(),renders=cases)
(out/'large-reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(dict(width=w,height=h,jpegBytes=len(jpeg),blocks=len(engine.features),renders=len(cases))))
