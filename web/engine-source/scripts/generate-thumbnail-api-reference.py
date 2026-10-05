"""Own miniature files and native end-to-end extraction/resize references."""
from pathlib import Path
import sys,subprocess,struct,hashlib,json,shutil,cv2 as cv,numpy as np
root=Path(__file__).resolve().parents[1];out=root/'tests/data/thumbnail-api';out.mkdir(exist_ok=True);sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.thumbnail import analyze_thumbnail
tool=root.parent/'native/exiftool/exiftool';assert subprocess.check_output([str(tool),'-ver']).strip()==b'13.55';cv.setNumThreads(1)
def rgb(w,h):
 y,x,c=np.indices((h,w,3),dtype=np.int32);return ((x*17+y*29+c*71+x*y*3)%256).astype(np.uint8)
def source(ext):
 ok,thumbnail=cv.imencode('.'+ext,cv.cvtColor(rgb(31,17),cv.COLOR_RGB2BGR));assert ok
 raw=thumbnail.tobytes();tiff=b'II'+struct.pack('<HI',42,8)+struct.pack('<HI',0,14)+struct.pack('<H',3)
 tiff+=struct.pack('<HHII',259,3,1,6)+struct.pack('<HHII',513,4,1,56)+struct.pack('<HHII',514,4,1,len(raw))+struct.pack('<I',0)+raw
 app=b'Exif\0\0'+tiff;ok,main=cv.imencode('.jpg',cv.cvtColor(rgb(259,193),cv.COLOR_RGB2BGR));assert ok
 path=out/('embedded-'+ext+'.jpg');path.write_bytes(main[:2].tobytes()+b'\xff\xe1'+struct.pack('>H',len(app)+2)+app+main[2:].tobytes());return path
paths=[root/'fixtures/exif-tools.jpg',root/'tests/data/png-exif/exif-1.png',root/'fixtures/odd.jpg',source('png'),source('tiff')];cases=[];sha=lambda b:hashlib.sha256(b).hexdigest()
for path in paths:
 raw=subprocess.check_output([str(tool),'-config','','-b','-ThumbnailImage',str(path)]);original=cv.imread(str(path));result=analyze_thumbnail(raw,original);row=dict(file=str(path.relative_to(root)),width=original.shape[1],height=original.shape[0],available=result is not None,thumbnailBytes=len(raw),thumbnailSha256=sha(raw))
 if result is not None:
  row['resizedSha256']=sha(memoryview(cv.cvtColor(result[0],cv.COLOR_BGR2RGB)));row['differenceSha256']=sha(memoryview(cv.cvtColor(result[1],cv.COLOR_BGR2RGB)))
 cases.append(row);print(row['file'],len(raw),row['available'])
large_path=out/'large.tiff';shutil.copyfile(root/'tests/data/tiff-stream/strips.tiff',large_path)
tmp=root/'.build/m5/thumbnail-api';tmp.mkdir(parents=True,exist_ok=True);thumb=tmp/'thumbnail.jpg';cv.imwrite(str(thumb),cv.cvtColor(rgb(31,17),cv.COLOR_RGB2BGR))
raw_thumb=thumb.read_bytes();container=bytearray(large_path.read_bytes());assert container[:2]==b'II';first=struct.unpack_from('<I',container,4)[0];count=struct.unpack_from('<H',container,first)[0];link=first+2+12*count;assert struct.unpack_from('<I',container,link)[0]==0
if len(container)%2:container.append(0)
ifd=len(container);offset=ifd+42;struct.pack_into('<I',container,link,ifd)
container+=struct.pack('<H',3)+struct.pack('<HHII',259,3,1,6)+struct.pack('<HHII',513,4,1,offset)+struct.pack('<HHII',514,4,1,len(raw_thumb))+struct.pack('<I',0)+raw_thumb;large_path.write_bytes(container)
raw=subprocess.check_output([str(tool),'-config','','-b','-ThumbnailImage',str(large_path)]);original=cv.imread(str(large_path));resized,difference=analyze_thumbnail(raw,original)
large=dict(file=str(large_path.relative_to(root)),width=original.shape[1],height=original.shape[0],available=True,thumbnailBytes=len(raw),thumbnailSha256=sha(raw),resizedSha256=sha(memoryview(cv.cvtColor(resized,cv.COLOR_BGR2RGB))),differenceSha256=sha(memoryview(cv.cvtColor(difference,cv.COLOR_BGR2RGB))))
(out/'reference.json').write_text(json.dumps(dict(native='ExifTool13.55 + core.thumbnail.analyze_thumbnail',opencv=cv.__version__,cases=cases,large=large),indent=2)+'\n')
print('Large TIFF',large['width'],large['height'],len(raw))
