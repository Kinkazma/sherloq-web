"""Public12.61MP synthetic median-filter oracle; existing local model, no training."""
from pathlib import Path
import hashlib,json,sys,time
import numpy as np,cv2,xgboost
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.median import MedianEngine
cv2.setNumThreads(1);out=root/'.build';out.mkdir(exist_ok=True);w,h=4099,3077
rng=np.random.default_rng(220025);rgb=rng.integers(0,256,(h,w,3),dtype=np.uint8)
y,x=np.indices((h,w-w//2));rgb[:,w//2:]=np.stack([(x//8+y//8+c*47)%256 for c in range(3)],axis=-1).astype(np.uint8)
rgb[128:2305,128:1457]=cv2.medianBlur(rgb[128:2305,128:1457],3)
ok,jpeg=cv2.imencode('.jpg',rgb[:,:,::-1], [cv2.IMWRITE_JPEG_QUALITY,95]);assert ok
name='median-4099x3077.jpg';(out/name).write_bytes(jpeg.tobytes());image=cv2.imdecode(jpeg,cv2.IMREAD_COLOR)
model_file=root.parent/'source/gui/models/median_b64.json';engine=MedianEngine(image,str(model_file));engine.workers=4
started=time.perf_counter();engine.analyze();margin=np.zeros_like(engine.prob,dtype=np.float32);margin[:-1,:-1]=engine.model.inplace_predict(engine.features,predict_type='margin').reshape(engine.prob.shape[0]-1,engine.prob.shape[1]-1)
sha=lambda data:hashlib.sha256(data).hexdigest();cases=[]
rects=[dict(x=0,y=0,width=67,height=71),dict(x=1023,y=63,width=131,height=67),dict(x=3001,y=1997,width=83,height=127),dict(x=w-31,y=h-29,width=31,height=29)]
for score,speckle,variance,threshold in [(False,True,5,.4),(True,False,100,.65),(False,False,0,1)]:
 pixels,mean=engine.render((variance,threshold,score,speckle));prob=engine.prob.astype(np.float32);prob=cv2.medianBlur(prob,3) if speckle else prob;valid=engine.var>=variance;decisions=np.where(valid,np.where(prob>=threshold,2,1),0).astype(np.uint8)
 windows=[]
 for r in rects:
  x0,y0,ww,hh=[r[k] for k in ['x','y','width','height']];windows.append(dict(rect=r,sha256=sha(np.ascontiguousarray(pixels[y0:y0+hh,x0:x0+ww,::-1]).tobytes())))
 cases.append(dict(params=dict(variance=variance,threshold=threshold,showScore=score,speckle=speckle),rgbSha256=sha(pixels[:,:,::-1].copy().tobytes()),filtered=prob.ravel().tolist(),decisionSha256=sha(decisions.tobytes()),validSha256=sha(valid.astype(np.uint8).tobytes()),mean=mean,windows=windows,positiveCells=int(np.count_nonzero(decisions==2))))
p='source/gui/sherloq_app/core/median.py'
record=dict(schema=1,width=w,height=h,file=name,bytes=len(jpeg),originalSha256=sha(jpeg.tobytes()),rgbSha256=sha(image[:,:,::-1].copy().tobytes()),modelSha256=sha(model_file.read_bytes()),modelBundled=False,nativeSources={p:sha((root.parent/p).read_bytes())},opencv=cv2.__version__,numpy=np.__version__,xgboost=xgboost.__version__,gridWidth=engine.prob.shape[1],gridHeight=engine.prob.shape[0],probabilities=engine.prob.ravel().tolist(),variances=engine.var.ravel().tolist(),margins=margin.ravel().tolist(),cases=cases)
(out/'median-4099x3077-reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(dict(width=w,height=h,jpegBytes=len(jpeg),blocks=len(engine.features),renders=len(cases),seconds=time.perf_counter()-started,positiveCells=[e['positiveCells'] for e in cases])))
