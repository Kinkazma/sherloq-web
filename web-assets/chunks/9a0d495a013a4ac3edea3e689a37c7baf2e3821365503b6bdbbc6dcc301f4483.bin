"""Independently decode the 100 MP browser exports and verify the complete raster."""
from pathlib import Path
import hashlib,json
import cv2
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS=None
root=Path(__file__).resolve().parents[1]/'.build/media-large';w=h=10000
m1,m2,c1,c2,c3=2610/16384,2523/32,3424/4096,2413/128,2392/128
v=np.arange(65536,dtype=np.float64)/65535;p=v**(1/m2);lut=10000/203*(np.maximum(0,p-c1)/(c2-c3*p))**(1/m1)
reports=[]
for fmt in ['avif','heic','webp','png']:
 file=root/('10000.'+fmt)
 if fmt=='avif':
  data=cv2.imread(str(root/'avif-decoded.png'),cv2.IMREAD_UNCHANGED);assert data.dtype==np.uint16;data=data[:,:,::-1]
 elif fmt=='heic':
  assert (root/'heic-decoded.rgb').stat().st_size==w*h*3
  data=np.memmap(root/'heic-decoded.rgb',dtype=np.uint8,mode='r',shape=(h,w,3))
 else:data=np.array(Image.open(file).convert('RGB'))
 assert data.shape==(h,w,3)
 total=0.;squares=0.;maximum=0;seam_total=0.;seam_n=0
 x=np.arange(w)[None,:];expected_r=np.floor(x/(w-1)*255+.5).astype(np.uint8)
 for y in range(0,h,32):
  rows=min(32,h-y);yy=np.arange(y,y+rows)[:,None]
  expected=np.empty((rows,w,3),dtype=np.uint8);expected[:,:,0]=expected_r;expected[:,:,1]=np.floor(yy/(h-1)*255+.5).astype(np.uint8);expected[:,:,2]=(x>>7)^(yy>>7)
  actual=data[y:y+rows]
  if fmt=='avif':
   rgb=lut[actual];r,g,b=[rgb[:,:,i] for i in range(3)];linear=np.stack((1.660491*r-.587641*g-.072850*b,-.124550*r+1.132900*g-.008350*b,-.018151*r-.100579*g+1.118730*b),axis=-1);linear=np.clip(linear,0,1);actual=np.rint(np.where(linear<=.0031308,linear*12.92,1.055*linear**(1/2.4)-.055)*255)
  d=np.abs(actual.astype(np.float64)-expected);total+=d.sum();squares+=(d*d).sum();maximum=max(maximum,int(d.max()))
  seam=d[:,[i for v in range(2048,w,2048) for i in [v-1,v,v+1]]];seam_total+=seam.sum();seam_n+=seam.size
 if fmt=='png':assert maximum==0
 assert total/(w*h*3)<4,(fmt,total/(w*h*3))
 reports.append(dict(format=fmt,width=w,height=h,bytes=file.stat().st_size,sha256=hashlib.sha256(file.read_bytes()).hexdigest(),meanAbsoluteError=total/(w*h*3),maximumError=maximum,psnr=None if squares==0 else float(10*np.log10(255**2/(squares/(w*h*3)))),gridBoundaryMeanError=seam_total/seam_n,decoder='libavif/dav1d (16-bit then inverse PQ/BT.2020)' if fmt=='avif' else 'ImageMagick/libheif' if fmt=='heic' else 'Pillow native codec'))
 del data
(root/'native-verification.json').write_text(json.dumps({'syntheticRaster':'deterministic SDR gradient/xor, complete pixel comparison','cases':reports},indent=2)+'\n')
print(json.dumps(reports,indent=2))
