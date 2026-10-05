from pathlib import Path
import sys,json,hashlib,warnings,time,subprocess
sys.dont_write_bytecode=True
sys.path[:0]=['/Users/gaeldauchy/SHERLOQ/source/gui','/Users/gaeldauchy/SHERLOQ/source']
import numpy as np,cv2 as cv
from sherloq_app.core.comparison import ComparisonEngine,helper_inputs
from sherloq_app.core.utility import butter_exe,ssimul_exe
root=Path(__file__).resolve().parents[1];out=root/'.build/comparison-96mp';out.mkdir(exist_ok=True);folder=out/'native-helper';folder.mkdir(exist_ok=True);first=root/'.build/dense-96mp/copy-6000.jpg';second=out/'modified.jpg';a=cv.imread(str(first))
if not second.exists():
 b=a.copy()
 for y in range(8000):b[y]=np.clip(np.rint(b[y].astype('f8')*1.02+2),0,255).astype('u1')
 b[3000:5000,9000:11000]=a[1000:3000,1000:3000];cv.imwrite(str(second),b,[cv.IMWRITE_JPEG_QUALITY,93]);del b
b=cv.imread(str(second));engine=ComparisonEngine(a,b);engine.helper_folder=str(folder);started=time.monotonic();views={}
def rgbhash(image):
 h=hashlib.sha256()
 for row in image:h.update(row[:,::-1].tobytes())
 return h.hexdigest()
def checkpoint(values,maps,errors,progress):
 print(progress,'seconds',time.monotonic()-started,'errors',errors,flush=True)
 for name in ['ssim','butter']:
  if name in maps and name not in views:views[name]=rgbhash(maps[name])
 (out/'native-progress.json').write_text(json.dumps({'values':{k:float(v) for k,v in values.items()},'errors':errors,'views':views,'seconds':time.monotonic()-started},indent=2)+'\n')
engine.checkpoint=checkpoint
with warnings.catch_warnings():warnings.simplefilter('ignore');result=engine.compute()
# The application's generic helper wrapper has a120s wall timeout. Development
# reference generation may invoke the identical executable directly for a large
# input if that wrapper times out; no scientific implementation changes.
for name in ['ssimul','butter']:
 if name in result['errors'] and 'timed out' in result['errors'][name]:
  paths=helper_inputs(folder,cv.cvtColor(a,cv.COLOR_BGR2GRAY),cv.cvtColor(b,cv.COLOR_BGR2GRAY));exe=butter_exe() if name=='butter' else ssimul_exe();completed=subprocess.run([exe,*paths[:2]]+([paths[2]] if name=='butter' else []),capture_output=True,check=True,timeout=3600);result['values'][name]=float(completed.stdout);del result['errors'][name]
  if name=='butter':engine.maps[name]=cv.imread(paths[2])
checkpoint(result['values'],engine.maps,result['errors'],('complete',''))
assert not result['errors'],result['errors'];assert len(result['values'])==20
views['normal']=rgbhash(b);views['difference']=rgbhash(engine.display('difference',False,False));values={k:(float(v) if np.isfinite(v) else '+Infinity') for k,v in result['values'].items()}
ref={'width':12000,'height':8000,'sourceSha256':[hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in [first,second]],'values':values,'views':views,'nativeSeconds':time.monotonic()-started,'recipe':{'first':'rich copied6000px JPEG','second':'gain1.02/offset2, distant4MP region replacement, JPEG93'},'errors':result['errors']};(out/'reference.json').write_text(json.dumps(ref,indent=2)+'\n');print('Native20metrics complete',ref['nativeSeconds'],flush=True)
