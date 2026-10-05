"""Bounded authored BigTIFF inputs, native RGB oracle; no shared fixture writes."""
from pathlib import Path
import os,ast,json,hashlib
import numpy as np
import cv2 as cv
import tifffile
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tests/data/bigtiff';OUT.mkdir(parents=True,exist_ok=True)
native=Path(os.environ['SHERLOQ_NATIVE_CORE'])/'image_io.py';source=native.read_text();tree=ast.parse(source)
ns=dict(os=os,Path=Path,np=np,cv=cv,Cancelled=RuntimeError,RAW_EXTENSIONS=set());exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('image_metadata','decode_image')],type_ignores=[]),str(native),'exec'),ns)
y,x=np.indices((37,53));rgb=np.stack(((x*17+y*9)%256,(x*31+y*5)%256,(x*7+y*29)%256),axis=-1).astype('u1');cases=[]
def record(name):
 _,_,bgr,metadata=ns['decode_image'](OUT/name);data=np.ascontiguousarray(bgr[:,:,::-1]);gray=cv.imread(str(OUT/name),cv.IMREAD_GRAYSCALE)
 cases.append(dict(file=name,width=data.shape[1],height=data.shape[0],rgbSha256=hashlib.sha256(data.tobytes()).hexdigest(),graySha256=hashlib.sha256(gray.tobytes()).hexdigest(),metadata=metadata))
def save(name,data,**kw):tifffile.imwrite(OUT/name,data,bigtiff=True,metadata=None,**kw);record(name)
save('rgb8-le.tiff',rgb,photometric='rgb',extratags=[(65000,'Q',1,2**60+123,False),(65001,'q',1,-2**60-123,False),(65002,'Q',2,[2**53-1,2**53],False)])
save('gray16-be.tiff',(x*3017+y*977).astype('u2'),photometric='minisblack',byteorder='>')
save('tiled-rgb8.tiff',rgb,photometric='rgb',tile=(16,16))
save('tiled-rgb16-be.tiff',rgb.astype('u2')*257,photometric='rgb',byteorder='>',tile=(16,16))
palette=np.stack([(np.arange(256)*37)%256,(np.arange(256)*83)%256,255-np.arange(256)]).astype('u2')*257
save('tiled-palette.tiff',((x*7+y*3)%256).astype('u1'),photometric='palette',colormap=palette,tile=(16,16),compression='deflate')
with tifffile.TiffWriter(OUT/'multipage.tiff',bigtiff=True)as tif:tif.write(rgb,photometric='rgb',metadata=None);tif.write(rgb[:13,:23],photometric='rgb',metadata=None)
record('multipage.tiff')
(OUT/'reference.json').write_text(json.dumps(dict(sourceSha256=hashlib.sha256(source.encode()).hexdigest(),cases=cases),indent=2)+'\n');print(len(cases),'native BigTIFF cases')
