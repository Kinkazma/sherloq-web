"""Reproducible native mask/role-filter fixtures, no private image or model."""
from pathlib import Path
import sys,json,hashlib,gzip
import numpy as np
import cv2 as cv
from skimage.morphology import remove_small_objects
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.d2prl import postprocess
out=root/'fixtures/d2prl';payload=bytearray();records=[];rng=np.random.default_rng(290061)
def put(a):
 a=np.ascontiguousarray(a,dtype='<f4');data=a.tobytes();offset=len(payload);payload.extend(data);return dict(offset=offset,bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
for h,w in [(2,3),(32,35),(77,131),(448,448)]:
 y,x=np.indices((h,w))
 for pattern in ['horizontal','vertical','checker','random','holes','thin','diagonal','thresholds','islands']:
  t=y<h//2
  if pattern=='vertical':t=x<w//2
  elif pattern=='checker':t=(x+y)%2==0
  elif pattern=='random':t=rng.random((h,w))>.5
  elif pattern=='holes':t=((x//13+y//11)%2)==0
  elif pattern=='thin':t=(x%51)<25
  elif pattern=='diagonal':t=x/max(1,w-1)>y/max(1,h-1)
  raw=np.stack([np.ones((h,w),np.float32),t.astype(np.float32)*1e-7,(~t).astype(np.float32)*1e-7])
  if pattern=='thresholds':
   u=np.array([0.,.5,np.nextafter(np.float32(.5),np.float32(0)),np.nextafter(np.float32(.5),np.float32(1)),1.,-1.],np.float32);r=np.array([0.,-0.,2**-149,-2**-149,1.,-1.],np.float32);raw[0]=u[(x+y)%len(u)];raw[1]=r[(x+2*y)%len(r)];raw[2]=r[(2*x+y)%len(r)]
  elif pattern=='islands':raw[:,((x%29)>19)|((y%31)>16)]=0
  entry=put(raw)
  for minimum in [0,1,17,500,5000]:
   expected=np.stack(postprocess(raw,minimum));both=remove_small_objects((raw[1]>0)|(raw[2]>0),min_size=minimum);target=(raw[1]>0).astype(np.float32)*both;source=both.astype(np.float32)-target;filtered=cv.filter2D(target-source,-1,np.ones((50,50)),borderType=cv.BORDER_CONSTANT)
   records.append(dict(name=f'{w}x{h}-{pattern}-{minimum}',width=w,height=h,minimum=minimum,input=entry,output=put(expected),filtered=put(filtered)))
compressed=gzip.compress(payload,mtime=0);(out/'postprocess.bin.gz').write_bytes(compressed);report=dict(schema=1,scope='Native four-connected components and50x50 signed role filter, generated raw tensors only',opencv=cv.__version__,numpy=np.__version__,nativeSourceSha256=hashlib.sha256((root.parent/'source/gui/sherloq_app/core/d2prl.py').read_bytes()).hexdigest(),payload=dict(file='postprocess.bin.gz',bytes=len(payload),sha256=hashlib.sha256(payload).hexdigest(),compressedBytes=len(compressed),compressedSha256=hashlib.sha256(compressed).hexdigest()),records=records)
(out/'postprocess.json').write_text(json.dumps(report,indent=2)+'\n');print('Generated',len(records),'cases',len(compressed),'compressed bytes')
