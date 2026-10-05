from pathlib import Path
import sys,hashlib,json,time
sys.dont_write_bytecode=True
sys.path[:0]=['/Users/gaeldauchy/SHERLOQ/source/gui','/Users/gaeldauchy/SHERLOQ/source']
import numpy as np,cv2 as cv
from sherloq_app.core.prnu import extract_residual
root=Path(__file__).resolve().parents[1];out=root/'.build/prnu-build-96mp';out.mkdir(exist_ok=True);started=time.monotonic()
source=root/'.build/pixels-96mp/source.jpg';bgr=cv.imread(str(source));gray=cv.cvtColor(bgr,cv.COLOR_BGR2GRAY).astype('f8')/255;del bgr
sample=extract_residual(gray);del gray
first=np.load(root/'.build/prnu-96mp/native-residual.npy',mmap_mode='r');mean=np.lib.format.open_memmap(out/'native-mean.npy',mode='w+',dtype='f8',shape=first.shape)
for y in range(0,len(first),128):mean[y:y+128]=first[y:y+128]+(sample[y:y+128]-first[y:y+128])/2
mean.flush();manifest=[{'name':name,'sha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest()} for name,path in [('copy.jpg',root/'.build/dense-96mp/copy-6000.jpg'),('original.jpg',source)]]
(out/'reference.json').write_text(json.dumps({'shape':list(first.shape),'trainingManifest':manifest,'nativeSeconds':time.monotonic()-started},indent=2)+'\n');print('Native training mean complete',time.monotonic()-started,flush=True)
