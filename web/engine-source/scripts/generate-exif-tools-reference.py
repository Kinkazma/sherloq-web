"""Synthetic GPS and embedded thumbnail, without real location/user metadata."""
from pathlib import Path
import struct,json,hashlib,sys
import cv2 as cv
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'web-engine/fixtures'
p=lambda fmt,*v:struct.pack('<'+fmt,*v)
def entry(tag,kind,count,value):return p('HHI',tag,kind,count)+value
thumbnail=(OUT/'odd.jpg').read_bytes()
header=b'II'+p('HI',42,8)
ifd0=p('H',2)+entry(274,3,1,p('H',1)+b'\0\0')+entry(34853,4,1,p('I',38))+p('I',140)
gps=p('H',4)+entry(1,2,2,b'N\0\0\0')+entry(2,5,3,p('I',92))+entry(3,2,2,b'E\0\0\0')+entry(4,5,3,p('I',116))+p('I',0)
rationals=b''.join(p('II',v,1)for v in range(1,7))
ifd1=p('H',2)+entry(513,4,1,p('I',170))+entry(514,4,1,p('I',len(thumbnail)))+p('I',0)
payload=b'Exif\0\0'+header+ifd0+gps+rationals+ifd1+thumbnail
source=(OUT/'synthetic.jpg').read_bytes();raw=source[:2]+b'\xff\xe1'+struct.pack('>H',len(payload)+2)+payload+source[2:]
(OUT/'exif-tools.jpg').write_bytes(raw)
# Pillow is an independent metadata reader; exact byte offsets remain independently known.
with Image.open(OUT/'exif-tools.jpg') as image:
 values=image.getexif().get_ifd(34853);lat=sum(float(v)/d for v,d in zip(values[2],(1,60,3600)));lon=sum(float(v)/d for v,d in zip(values[4],(1,60,3600)))
sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.thumbnail import analyze_thumbnail
resized,difference=analyze_thumbnail(thumbnail,cv.imread(str(OUT/'exif-tools.jpg')))
resized_sha=hashlib.sha256(np.ascontiguousarray(resized[:,:,::-1])).hexdigest();difference_sha=hashlib.sha256(np.ascontiguousarray(difference[:,:,::-1])).hexdigest()
(OUT/'exif-tools-reference.json').write_text(json.dumps(dict(schema=1,latitude=lat,longitude=lon,resizedSha256=resized_sha,differenceSha256=difference_sha,thumbnailSha256=hashlib.sha256(thumbnail).hexdigest(),thumbnailOffset=182,thumbnailLength=len(thumbnail)),indent=2)+'\n')
