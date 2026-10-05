"""M5-owned TIFF format corpus against the native file loader; never shared fixtures."""
from pathlib import Path
import os,ast,json,hashlib
import numpy as np
import cv2 as cv
import tifffile
from PIL import Image,TiffImagePlugin
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tests/data/tiff-formats';OUT.mkdir(parents=True,exist_ok=True)
native=Path(os.environ['SHERLOQ_NATIVE_CORE'])/'image_io.py';source=native.read_text();tree=ast.parse(source)
ns=dict(os=os,Path=Path,np=np,cv=cv,Cancelled=RuntimeError,RAW_EXTENSIONS=set());exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('image_metadata','decode_image')],type_ignores=[]),str(native),'exec'),ns)
y,x=np.indices((37,53));rgb=np.stack(((x*17+y*9)%256,(x*31+y*5)%256,(x*7+y*29)%256),axis=-1).astype('u1');alpha=((x*11+y*19)%256).astype('u1');cases=[]
def record(name):
 path=OUT/name;record=dict(file=name)
 try:
  _,_,bgr,metadata=ns['decode_image'](path);pixels=np.ascontiguousarray(bgr[:,:,::-1]);record.update(width=pixels.shape[1],height=pixels.shape[0],rgbSha256=hashlib.sha256(pixels.tobytes()).hexdigest(),graySha256=hashlib.sha256(cv.imread(str(path),cv.IMREAD_GRAYSCALE).tobytes()).hexdigest(),metadata=metadata)
 except ValueError as error:record['nativeError']=str(error)
 cases.append(record)
def save(name,pixels,**kw):
 tifffile.imwrite(OUT/name,pixels,metadata=None,**kw);record(name)
for orientation in range(1,5):
 tags=TiffImagePlugin.ImageFileDirectory_v2();tags[274]=orientation
 file=f'bilevel-{orientation}.tiff';Image.fromarray(((x+y*3)%7<3)).save(OUT/file,tiffinfo=tags);record(file)
 image=Image.fromarray(((x*7+y*3)%256).astype('u1'),'P');image.putpalette([v for i in range(256)for v in ((i*37)%256,(i*83)%256,255-i)])
 file=f'palette-{orientation}.tiff';image.save(OUT/file,tiffinfo=tags);record(file)
for compression in ['group3','group4','tiff_ccitt']:
 file=f'bilevel-{compression}.tiff';Image.fromarray(((x+y*3)%7<3)).save(OUT/file,compression=compression);record(file)
for compression in ['tiff_lzw','tiff_adobe_deflate','packbits']:
 file=f'palette-{compression}.tiff';image.save(OUT/file,compression=compression);record(file)
for dtype in ['u1','u2']:
 gray=(x*3017+y*977).astype(dtype)
 for order in ['<','>']:
  save(f'whitezero-{dtype}-{ord(order)}.tiff',gray,photometric='miniswhite',byteorder=order)
 for photo,data in [('minisblack',gray),('rgb',rgb.astype(dtype)*(257 if dtype=='u2' else 1))]:
  save(f'tiled-{photo}-{dtype}.tiff',data,photometric=photo,tile=(16,16))
for dtype in ['u1','u2']:
 data=rgb.astype(dtype)*(257 if dtype=='u2' else 1)
 save(f'planar-{dtype}.tiff',data.transpose(2,0,1),photometric='rgb',planarconfig='separate')
 for extra in ['unassalpha','assocalpha']:
  rgba=np.concatenate([data,(alpha.astype(dtype)*(257 if dtype=='u2' else 1))[:,:,None]],axis=2)
  save(f'rgba-{extra}-{dtype}.tiff',rgba,photometric='rgb',extrasamples=[extra])
for orientation in [2,3,4]:save(f'tiled-orientation-{orientation}.tiff',rgb,photometric='rgb',tile=(16,16),extratags=[(274,'H',1,orientation,False)])
for dtype in ['u1','u2']:
 data=rgb.astype(dtype)*(257 if dtype=='u2' else 1)
 save(f'tiled-planar-{dtype}.tiff',data.transpose(2,0,1),photometric='rgb',planarconfig='separate',tile=(16,16))
 save(f'tiled-deflate-{dtype}.tiff',data,photometric='rgb',tile=(16,16),compression='deflate')
 for extra in ['unassalpha','assocalpha']:
  rgba=np.concatenate([data,(alpha.astype(dtype)*(257 if dtype=='u2' else 1))[:,:,None]],axis=2)
  save(f'tiled-rgba-{extra}-{dtype}.tiff',rgba,photometric='rgb',extrasamples=[extra],tile=(16,16))
palette=np.stack([(np.arange(256)*37)%256,(np.arange(256)*83)%256,255-np.arange(256)]).astype('u2')*257
save('tiled-palette.tiff',((x*7+y*3)%256).astype('u1'),photometric='palette',colormap=palette,tile=(16,16))
save('tiled-big-gray16.tiff',(x*3017+y*977).astype('u2'),photometric='minisblack',byteorder='>',tile=(16,16))
save('tiled-bilevel.tiff',(x+y*3)%7<3,photometric='minisblack',tile=(16,16))
with tifffile.TiffWriter(OUT/'multipage.tiff') as tif:
 tif.write(rgb,photometric='rgb',metadata=None);tif.write(rgb[:19,:23],photometric='rgb',metadata=None)
record('multipage.tiff')
save('float32.tiff',rgb.astype('f4')/255,photometric='rgb')
(OUT/'reference.json').write_text(json.dumps(dict(sourceSha256=hashlib.sha256(source.encode()).hexdigest(),opencv=cv.__version__,tifffile=tifffile.__version__,cases=cases),indent=2)+'\n')
print(len(cases),'TIFF native cases',[(c['file'],c['nativeError'])for c in cases if 'nativeError'in c])
