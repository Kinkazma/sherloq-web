"""Original-byte metadata fixtures, compared to the native file loader."""
from pathlib import Path
import struct,hashlib,json,sys
import cv2 as cv
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.image_io import decode_image
OUT=ROOT/'web-engine/fixtures'
base=(OUT/'synthetic.jpg').read_bytes()
def segment(marker,data):return bytes([255,marker])+struct.pack('>H',len(data)+2)+data
def exif(orientation,endian):
 order=b'II' if endian=='<' else b'MM'
 return b'Exif\0\0'+order+struct.pack(endian+'HIH',42,8,1)+struct.pack(endian+'HHI',274,3,1)+struct.pack(endian+'H',orientation)+b'\0\0'+b'\0'*4
cases=[]
for endian in '<>':
 for orientation in range(1,9):
  name=f'exif-{orientation}-'+('le' if endian=='<' else 'be')+'.jpg';raw=base[:2]+segment(0xe1,exif(orientation,endian))+base[2:];(OUT/name).write_bytes(raw)
  _,_,bgr,meta=decode_image(OUT/name);rgb=np.ascontiguousarray(bgr[:,:,::-1]);cases.append(dict(file=name,width=rgb.shape[1],height=rgb.shape[0],orientation=orientation,sha256=hashlib.sha256(rgb).hexdigest(),originalSha256=hashlib.sha256(raw).hexdigest(),metadata=meta))
for name,extra in [('icc',segment(0xe2,b'ICC_PROFILE\0\x01\x01synthetic-profile-not-applied')),('xmp',segment(0xe1,b'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmlns:x="adobe:ns:meta/"><test>synthetic</test></x:xmpmeta>'))]:
 raw=base[:2]+extra+base[2:];path=OUT/(name+'.jpg');path.write_bytes(raw);_,_,bgr,meta=decode_image(path);rgb=np.ascontiguousarray(bgr[:,:,::-1]);cases.append(dict(file=path.name,width=rgb.shape[1],height=rgb.shape[0],orientation=1,sha256=hashlib.sha256(rgb).hexdigest(),originalSha256=hashlib.sha256(raw).hexdigest(),metadata=meta))
(OUT/'metadata-reference.json').write_text(json.dumps(dict(schema=1,source='generated JPEG and synthetic EXIF/ICC/XMP bytes',opencv=cv.__version__,cases=cases),indent=2)+'\n')
print(len(cases),'metadata decoding references')
