"""Synthetic PNG eXIf with GPS/thumbnail; shared fixtures are read only."""
from pathlib import Path
import ast, hashlib, json, struct, zlib
import cv2 as cv
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tests/data/png-exif';OUT.mkdir(parents=True,exist_ok=True)
source=(ROOT/'fixtures/exif-tools.jpg').read_bytes()
assert source[2:4]==b'\xff\xe1' and source[6:12]==b'Exif\0\0'
segment_length=struct.unpack('>H',source[4:6])[0]
tiff=source[12:4+segment_length]
thumb=(ROOT/'fixtures/odd.jpg').read_bytes()
image=cv.imdecode(np.frombuffer(source,np.uint8),cv.IMREAD_COLOR)
_,encoded=cv.imencode('.png',image)
raw=bytes(encoded)
def chunk(kind,data):
    return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
# Exercise eXIf both before and after IDAT, with absolute byte offsets.
positions=[33,len(raw)-12]
native=Path('/Users/gaeldauchy/SHERLOQ/source/gui/sherloq_app/core/thumbnail.py')
namespace={};exec(compile(ast.parse(native.read_text()),str(native),'exec'),namespace)
sha=lambda a:hashlib.sha256(np.ascontiguousarray(a)).hexdigest()
cases=[]
for index,position in enumerate(positions):
    result=raw[:position]+chunk(b'eXIf',tiff)+raw[position:]
    file=f'exif-{index}.png';(OUT/file).write_bytes(result)
    with Image.open(OUT/file) as im:
        gps=im.getexif().get_ifd(34853)
        latitude=sum(float(v)/d for v,d in zip(gps[2],(1,60,3600)))
        longitude=sum(float(v)/d for v,d in zip(gps[4],(1,60,3600)))
    decoded=cv.imread(str(OUT/file))
    resized,difference=namespace['analyze_thumbnail'](thumb,decoded)
    cases.append(dict(file=file,latitude=latitude,longitude=longitude,thumbnailOffset=position+8+170,thumbnailLength=len(thumb),thumbnailSha256=sha(thumb),rgbSha256=sha(decoded[:,:,::-1]),resizedSha256=sha(resized[:,:,::-1]),differenceSha256=sha(difference[:,:,::-1])))
(OUT/'reference.json').write_text(json.dumps(dict(schema=1,cases=cases),indent=2)+'\n')
