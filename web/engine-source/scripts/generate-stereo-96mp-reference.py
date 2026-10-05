from pathlib import Path
import sys,json,hashlib,time
sys.dont_write_bytecode=True
sys.path[:0]=['/Users/gaeldauchy/SHERLOQ/source/gui','/Users/gaeldauchy/SHERLOQ/source']
import cv2,numpy as np
from sherloq_app.core.stereogram import StereoEngine
root=Path(__file__).resolve().parents[1];out=root/'.build/stereo-96mp';out.mkdir(exist_ok=True);source=out/'periodic.jpg';original=Path('/Users/gaeldauchy/SHERLOQ/web-engine/.build/jpeg-12000x8000.jpg')
if not source.exists():
 image=cv2.imread(str(original));base=image[:,:192].copy();x=np.arange(12000);shift=(x//192)//4
 for y in range(8000):
  phase=shift+np.rint(np.sin(y/43)*x/3000).astype(np.int32);image[y]=base[y,(x+phase)%192]
 cv2.imwrite(str(source),image,[cv2.IMWRITE_JPEG_QUALITY,92]);del image,base
image=cv2.imread(str(source));engine=StereoEngine(image);started=time.monotonic();offset=engine.search();print('native period',offset,flush=True);assert offset is not None
cases=[]
for mode in [2,3]:
 result=engine.compute(mode);digest=hashlib.sha256()
 for row in result:digest.update(row[:,::-1].tobytes())
 cases.append({'params':{'mode':mode},'sha256':digest.hexdigest()});print('native view',mode,'done',flush=True)
flow=engine.flow;flow.astype('<f4').tofile(out/'flow.f32')
ref={'sourceSha256':hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),'width':12000,'height':8000,'outputWidth':12000-offset,'offset':offset,'cases':cases,'differences':engine.difference.tolist(),'flowSha256':hashlib.sha256(flow.tobytes()).hexdigest(),'flowMinimum':float(flow.min()),'flowMaximum':float(flow.max()),'nonzeroFlow':int(np.count_nonzero(flow)),'nativeSeconds':time.monotonic()-started,'opencv':cv2.__version__,'recipe':{'publicSource':str(original),'sourceSha256':hashlib.file_digest(original.open('rb'),'sha256').hexdigest(),'period':192,'xPhase':'floor(floor(x/192)/4)+rint(sin(y/43)*x/3000)','jpegQuality':92}}
(out/'reference.json').write_text(json.dumps(ref,indent=2)+'\n');print(json.dumps({k:v for k,v in ref.items() if k!='differences'}))
