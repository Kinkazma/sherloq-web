"""Synthetic PNG/TIFF depth, alpha and orientation fixtures from the native loader."""
from pathlib import Path
import sys,json,hashlib
import numpy as np
import cv2 as cv
from PIL import Image,TiffImagePlugin
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.image_io import decode_image
OUT=ROOT/'web-engine/fixtures';y,x=np.indices((13,17));rgb=np.stack(((x*17+y*9)%256,(x*31+y*5)%256,(x*7+y*29)%256),axis=-1).astype(np.uint8);alpha=((x*11+y*19)%256).astype(np.uint8);cases=[]
def record(name):
 path=OUT/name
 try:_,_,bgr,metadata=decode_image(path)
 except ValueError:
  cases.append(dict(file=name,nativeError='Native file loader rejects this encoding/orientation'));return
 data=np.ascontiguousarray(bgr[:,:,::-1]).tobytes();cases.append(dict(file=name,width=bgr.shape[1],height=bgr.shape[0],sha256=hashlib.sha256(data).hexdigest(),metadata=metadata));(OUT/(name+'.rgb')).write_bytes(data)
for ext in ('png','tiff'):
 for name,pixels in [('rgb8',rgb),('rgba8',np.concatenate((rgb,alpha[:,:,None]),axis=2)),('gray8',rgb[:,:,0]),('gray16',(x*3017+y*977).astype(np.uint16))]:
  file=f'codec-{name}.{ext}';Image.fromarray(pixels).save(OUT/file);record(file)
for orientation in range(1,9):
 tags=TiffImagePlugin.ImageFileDirectory_v2();tags[274]=orientation;file=f'codec-orientation-{orientation}.tiff';Image.fromarray(rgb).save(OUT/file,tiffinfo=tags);record(file)
for compression in ('tiff_lzw','tiff_adobe_deflate','packbits'):
 file=f'codec-{compression}.tiff';Image.fromarray(rgb).save(OUT/file,compression=compression);record(file)
# True 16-bit three-channel paths use OpenCV writer (Pillow RGB is 8-bit).
for ext in ('png','tiff'):
 file=f'codec-rgb16.{ext}';cv.imwrite(str(OUT/file),(rgb[:,:,::-1].astype(np.uint16)*257));record(file)
(OUT/'image-codec-reference.json').write_text(json.dumps(dict(schema=1,source='generated patterns only',opencv=cv.__version__,cases=cases),indent=2)+'\n');print(len(cases),'PNG/TIFF native references')
