"""Own deterministic PNG inputs; native OpenCV4.11 reference; no shared writes."""
from pathlib import Path
import cv2 as cv
import numpy as np
import hashlib,json,struct,zlib
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tests/data/png-stream';OUT.mkdir(exist_ok=True);assert cv.__version__=='4.11.0';cv.setNumThreads(1)
algorithms=[('Average',cv.img_hash.averageHash),('Block mean',cv.img_hash.blockMeanHash),('Color moments',cv.img_hash.colorMomentHash),('Marr-Hildreth',cv.img_hash.marrHildrethHash),('pHash',cv.img_hash.pHash),('Radial variance',cv.img_hash.radialVarianceHash)];cases=[]
for name,width,height,interlace in [('large',4000,5500,0),('adam7',1025,769,1)]:
 rgb=np.empty((height,width,3),np.uint8);x=np.arange(width,dtype=np.uint32)
 for y in range(height):rgb[y,:,0]=(x*13+y*7)%256;rgb[y,:,1]=(x*x+y*11)%256;rgb[y,:,2]=((x//19+y//23)*43)%256
 image=np.ascontiguousarray(rgb[:,:,::-1]);path=OUT/(name+'.png')
 if not interlace:assert cv.imwrite(str(path),image,[cv.IMWRITE_PNG_COMPRESSION,9])
 else:
  def chunk(kind,body):return struct.pack('>I',len(body))+kind+body+struct.pack('>I',zlib.crc32(kind+body)&0xffffffff)
  compressor=zlib.compressobj(9);pieces=[]
  for sx,sy,dx,dy in [(0,0,8,8),(4,0,8,8),(0,4,4,8),(2,0,4,4),(0,2,2,4),(1,0,2,2),(0,1,1,2)]:
   for y in range(sy,height,dy):pieces.append(compressor.compress(b'\0'+rgb[y,sx::dx].tobytes()))
  pieces.append(compressor.flush());path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,1))+chunk(b'IDAT',b''.join(pieces))+chunk(b'IEND',b''))
 decoded=cv.imread(str(path));assert np.array_equal(decoded,image)
 cases.append(dict(file=path.name,width=width,height=height,interlace=interlace,rgbSha256=hashlib.sha256(memoryview(rgb)).hexdigest(),sourceSha256=hashlib.sha256(path.read_bytes()).hexdigest(),hashes={name:fn(decoded).ravel().tolist()for name,fn in algorithms}))
(OUT/'reference.json').write_text(json.dumps(dict(opencv=cv.__version__,cases=cases),indent=2)+'\n')
print([(c['file'],c['width'],c['height'])for c in cases])
