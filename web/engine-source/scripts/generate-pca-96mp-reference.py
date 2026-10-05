from pathlib import Path
import sys,json,hashlib,time
sys.dont_write_bytecode=True
sys.path[:0]=['/Users/gaeldauchy/SHERLOQ/source/gui','/Users/gaeldauchy/SHERLOQ/source']
import cv2
from sherloq_app.core.pca import PcaEngine
root=Path(__file__).resolve().parents[1];out=root/'.build/pca-96mp';out.mkdir(exist_ok=True)
source=root/'.build/dense-96mp/copy-6000.jpg';image=cv2.imread(str(source));engine=PcaEngine(image);cases=[];started=time.monotonic()
for params in [(1,'project',False,False),(2,'crossprod',True,True)]:
 result,model=engine.compute(params);digest=hashlib.sha256()
 for row in result: digest.update(row[:,::-1].tobytes())
 cases.append({'params':dict(zip(['component','mode','invert','equalize'],params)),'sha256':digest.hexdigest(),'model':[v.reshape(-1).tolist() for v in model]})
ref={'sourceSha256':hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),'width':image.shape[1],'height':image.shape[0],'cases':cases,'nativeSeconds':time.monotonic()-started,'opencv':cv2.__version__};(out/'reference.json').write_text(json.dumps(ref,indent=2)+'\n');print(json.dumps(ref))
