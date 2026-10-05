from pathlib import Path
import sys,json,hashlib,time
sys.dont_write_bytecode=True
sys.path[:0]=['/Users/gaeldauchy/SHERLOQ/source/gui','/Users/gaeldauchy/SHERLOQ/source']
import cv2
from sherloq_app.core.interactive import FrequencyEngine
from sherloq_app.core.frequency_mask import circular_mask
root=Path(__file__).resolve().parents[1];out=root/'.build/frequency-96mp';out.mkdir(exist_ok=True);source=root/'.build/dense-96mp/copy-6000.jpg';image=cv2.imread(str(source));engine=FrequencyEngine(image);cases=[];start=time.monotonic()
for params in [(15,5,37,3),(15,5,37,7)]:
 frames=engine.compute(params);hashes=[]
 for frame in frames[:4]:
  digest=hashlib.sha256()
  for row in frame:digest.update(row[:,::-1].tobytes())
  hashes.append(digest.hexdigest())
 mask=circular_mask(engine.dft.shape[:2],*params[:2]);mask=mask.copy();mask[engine.magnitude0<int(params[2]/100*255)]=0
 cases.append({'params':dict(zip(['split','smooth','threshold','filter'],params)),'hashes':hashes,'zeroPercent':frames[4],'maskSha256':hashlib.sha256(mask.tobytes()).hexdigest()})
ref={'sourceSha256':hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),'width':image.shape[1],'height':image.shape[0],'cases':cases,'nativeSeconds':time.monotonic()-start,'opencv':cv2.__version__};(out/'reference.json').write_text(json.dumps(ref,indent=2)+'\n');print(json.dumps(ref))
