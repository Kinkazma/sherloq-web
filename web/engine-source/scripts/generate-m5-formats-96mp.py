"""Distinct original96MP PNG Adam7 and compressed TIFF tile memory paths."""
from pathlib import Path
import cv2 as cv
import numpy as np
import tifffile
import hashlib,json,struct,zlib,time
root=Path(__file__).resolve().parents[1];folder=root/'.build/integration/formats-96mp';folder.mkdir(parents=True,exist_ok=True)
assert cv.__version__=='4.11.0';cv.setNumThreads(1);started=time.perf_counter()
image=cv.imread(str(root.parent/'web-engine-m2/.build/forgeryscope-source/source-96mp-rich.jpg'));assert image.shape==(8000,12000,3)
rgb=cv.cvtColor(image,cv.COLOR_BGR2RGB);del image
height,width=rgb.shape[:2];cases=[]
def chunk(stream,kind,data):
    stream.write(struct.pack('>I',len(data)));stream.write(kind);stream.write(data);stream.write(struct.pack('>I',zlib.crc32(data,zlib.crc32(kind))&0xffffffff))
def row16(y):
    low=((np.arange(width,dtype=np.uint32)[:,None]*17+y*29+np.array([13,61,139],np.uint32))&255).astype(np.uint16)
    return (rgb[y].astype(np.uint16)<<8)|low
def reference(file,**metadata):
    path=folder/file;decoded=cv.imread(str(path));assert decoded.shape==(height,width,3)
    native=cv.cvtColor(decoded,cv.COLOR_BGR2RGB);del decoded
    result=dict(file=file,width=width,height=height,bytes=path.stat().st_size,rgbSha256=hashlib.sha256(memoryview(native)).hexdigest(),**metadata);del native
    with path.open('rb') as source:result['sha256']=hashlib.file_digest(source,'sha256').hexdigest()
    cases.append(result);print(file,'native reference complete',flush=True)
path=folder/'adam7-rgb16.png'
with path.open('wb') as stream:
    stream.write(b'\x89PNG\r\n\x1a\n');chunk(stream,b'IHDR',struct.pack('>IIBBBBB',width,height,16,2,0,0,1));compressor=zlib.compressobj(3)
    for sx,sy,dx,dy in [(0,0,8,8),(4,0,8,8),(0,4,4,8),(2,0,4,4),(0,2,2,4),(1,0,2,2),(0,1,1,2)]:
        for y in range(sy,height,dy):
            data=compressor.compress(b'\0'+row16(y)[sx::dx].astype('>u2').tobytes())
            if data:chunk(stream,b'IDAT',data)
    data=compressor.flush()
    if data:chunk(stream,b'IDAT',data)
    chunk(stream,b'IEND',b'')
reference(path.name,format='png',depth=16,interlace=1,orientation=1)
pixels=np.empty((height,width,3),np.uint16)
for y in range(height):pixels[y]=row16(y)
path=folder/'tiles-rgb16-bigtiff.tiff';tifffile.imwrite(path,pixels,photometric='rgb',compression='deflate',predictor=True,bigtiff=True,tile=(256,256),metadata=None,extratags=[(274,'H',1,3,False)]);del pixels,rgb
reference(path.name,format='tiff',depth=16,bigTiff=True,tile=[256,256],orientation=3,compression='deflate',predictor=True)
(root/'docs/m5-formats-96mp-native-reference.json').write_text(json.dumps(dict(cases=cases,opencv=cv.__version__,nativeSeconds=time.perf_counter()-started,complexity='Rich copied M2 original in16-bit RGB with deterministic nonzero low bits; full native RGB8 conversion, original96MP, no resize.'),indent=2)+'\n')
