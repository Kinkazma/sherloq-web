from pathlib import Path
import sys,hashlib,json,time
sys.dont_write_bytecode=True
sys.path[:0]=['/Users/gaeldauchy/SHERLOQ/source/gui','/Users/gaeldauchy/SHERLOQ/source']
import numpy as np,cv2 as cv,h5py
from sherloq_app.core.prnu import extract_residual,ncc
root=Path(__file__).resolve().parents[1];out=root/'.build/prnu-96mp';out.mkdir(exist_ok=True);started=time.monotonic();source=root/'.build/dense-96mp/copy-6000.jpg';bgr=cv.imread(str(source));gray=cv.cvtColor(bgr,cv.COLOR_BGR2GRAY).astype('f8')/255;del bgr
residual=extract_residual(gray);del gray
np.save(out/'native-residual.npy',residual);print('Residual',residual.shape,time.monotonic()-started,flush=True)
shifted=np.roll(residual,13,axis=0);scores=[['same',float(ncc(residual,residual))],['shifted',float(ncc(residual,shifted))]]
with h5py.File(out/'database.h5','w') as f:
 for name,values in [('same',residual),('shifted',shifted)]:
  g=f.create_group(name);g.create_dataset('fingerprint',data=values,compression='gzip',compression_opts=4,chunks=(128,128));g.attrs['count']=1;g.attrs['files']=json.dumps(['public-development-source.jpg'])
print('HDF5',time.monotonic()-started,flush=True)
ref={'sourceSha256':hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),'residualSha256':hashlib.sha256(residual.tobytes()).hexdigest(),'shape':list(residual.shape),'scores':scores,'nativeSeconds':time.monotonic()-started};(out/'reference.json').write_text(json.dumps(ref,indent=2)+'\n')
