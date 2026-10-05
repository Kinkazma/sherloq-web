"""Own bounded-storage TIFF corpus; native OpenCV RGB/hash reference."""
from pathlib import Path
import cv2 as cv,numpy as np,tifffile,hashlib,json
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tests/data/tiff-stream';OUT.mkdir(exist_ok=True);assert cv.__version__=='4.11.0';cv.setNumThreads(1)
width,height=4103,5401;rgb=np.empty((height,width,3),np.uint8);x=np.arange(width,dtype=np.uint32)
for y in range(height):rgb[y,:,0]=(x+y)%256;rgb[y,:,1]=(2*x+3*y)%256;rgb[y,:,2]=(5*x+7*y)%256
algorithms=[('Average',cv.img_hash.averageHash),('Block mean',cv.img_hash.blockMeanHash),('Color moments',cv.img_hash.colorMomentHash),('Marr-Hildreth',cv.img_hash.marrHildrethHash),('pHash',cv.img_hash.pHash),('Radial variance',cv.img_hash.radialVarianceHash)];cases=[]
for file,big,tile,orientation in [('strips.tiff',False,None,1),('tiles-bigtiff.tiff',True,(128,128),3)]:
 path=OUT/file;tifffile.imwrite(path,rgb,photometric='rgb',compression='deflate',predictor=True,bigtiff=big,tile=tile,rowsperstrip=None if tile else 64,metadata=None,extratags=[(274,'H',1,orientation,False)])
 image=cv.imread(str(path));assert image is not None and image.shape==rgb.shape;native_rgb=cv.cvtColor(image,cv.COLOR_BGR2RGB)
 cases.append(dict(file=file,width=width,height=height,bigTiff=big,orientation=orientation,sourceSha256=hashlib.sha256(path.read_bytes()).hexdigest(),rgbSha256=hashlib.sha256(memoryview(native_rgb)).hexdigest(),hashes={name:fn(image).ravel().tolist()for name,fn in algorithms}))
(OUT/'reference.json').write_text(json.dumps(dict(opencv=cv.__version__,cases=cases),indent=2)+'\n');print([(c['file'],(OUT/c['file']).stat().st_size)for c in cases])
