"""Read every exported sample after release; compare complete native global results."""
from pathlib import Path
import hashlib,json,zipfile,shutil,sys
import numpy as np,cv2,matplotlib
root=Path(__file__).resolve().parents[1];out=root/'.build/resampling-96mp';path=root/'docs/resampling-96mp-proof.json'
report=json.loads(path.read_text());proof=report['result'];reference=json.loads((out/'reference.json').read_text())
sys.path.insert(0,'/Users/gaeldauchy/SHERLOQ/source')
from gui.sherloq_app.core.resampling import normalize_gray
gray=None
for i,case in enumerate(proof['cases']):
 archive=out/f'values-{i}.npz';assert hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()==case['valuesExport']['sha256']
 extracted=out/f'readback-{i}.npy'
 with zipfile.ZipFile(archive) as z:
  with z.open('values.npy') as source,extracted.open('wb') as destination:shutil.copyfileobj(source,destination,4*1024**2)
  assert z.testzip() is None
 actual=np.load(extracted,mmap_mode='r');native=np.load(out/f'native-values-{i}.npy',mmap_mode='r');assert actual.shape==native.shape
 maximum=0.;total=0.;count=0;different=0;hash=hashlib.sha256()
 for y in range(0,len(actual),64):
  a=actual[y:y+64];b=native[y:y+64];assert np.isfinite(a).all() and np.isfinite(b).all();error=np.abs(a-b);maximum=max(maximum,float(error.max()));total+=float(error.sum());count+=error.size;different+=int(np.count_nonzero(error));hash.update(a.tobytes())
 assert hash.hexdigest()==case['valuesSha256'];assert maximum<=1e-5,(i,maximum)
 png=out/f'view-{i}.png';assert hashlib.file_digest(png.open('rb'),'sha256').hexdigest()==case['export']['sha256'];image=cv2.imread(str(png));assert list(image.shape)==case['shape']+[3]
 rgbhash=hashlib.sha256();changed=0;worst=0
 if i==0:gray=normalize_gray(cv2.imread(str(root/'.build/dense-96mp/copy-6000.jpg'),cv2.IMREAD_GRAYSCALE))
 for y in range(0,len(image),32):
  if i==0:
   values=gray[y:y+32].copy();first=max(y,1);last=min(y+len(values),len(gray)-1)
   if last>first:values[first-y:last-y,1:-1]=native[first-1:last-1]
  else:values=native[y:y+32]
  expected=matplotlib.colormaps['gray'](values,bytes=True)[:,:,:3];rgb=image[y:y+32,:,::-1];rgbhash.update(rgb.tobytes());error=np.abs(rgb.astype('i2')-expected.astype('i2'));changed+=int(np.count_nonzero(error));worst=max(worst,int(error.max()))
 assert rgbhash.hexdigest()==case['sha256'];assert worst<=1,(i,worst)
 case['allPixelsNativeExact']=changed==0;case['independentReader']={'numpy':np.__version__,'opencv':cv2.__version__,'afterSourceRelease':True,'crcChecked':True,'completeNumericShape':list(actual.shape),'maximumAbsoluteError':maximum,'meanAbsoluteError':total/count,'differentValues':different,'differentRgbChannels':changed,'maximumRgbDifference':worst}
 del actual,native,image;extracted.unlink();print(i,case['independentReader'],flush=True)
path.write_text(json.dumps(report,indent=2)+'\n')
