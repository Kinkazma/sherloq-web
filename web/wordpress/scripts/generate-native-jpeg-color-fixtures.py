"""Small synthetic references, independently decoded by Pillow/libjpeg."""
from pathlib import Path
from PIL import Image,ImageOps
import hashlib,json,shutil,subprocess
out=Path(__file__).resolve().parents[1]/'tests/data/native-jpeg-color';out.mkdir(parents=True,exist_ok=True)
records=[]
def emit(name,image,**options):
 path=out/(name+'.jpg');image.save(path,quality=97,subsampling=0,**options)
 decoded=ImageOps.exif_transpose(Image.open(path));raw=out/(name+'.bin');raw.write_bytes(decoded.tobytes())
 records.append({'name':name,'encoded':path.name,'reference':raw.name,'width':decoded.width,'height':decoded.height,'space':{'L':'GRAY','RGB':'RGB','CMYK':'CMYK'}[decoded.mode],'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'referenceSha256':hashlib.sha256(raw.read_bytes()).hexdigest()})
image=Image.new('CMYK',(19,13));image.putdata([((x*31+y*5)%256,(x*13+y*29)%256,(x*47+y*7)%256,(x*3+y*53)%256)for y in range(image.height)for x in range(image.width)])
for orientation in range(1,9):
 exif=Image.Exif();exif[274]=orientation;emit('cmyk-orientation-'+str(orientation),image,exif=exif)
progressive=Image.new('CMYK',(512,512));progressive.putdata([((x*37+y*11)%256,(x*7+y*19)%256,(x*17+y*3)%256,(x*23+y*43)%256)for y in range(progressive.height)for x in range(progressive.width)]);emit('cmyk-progressive',progressive,progressive=True)
gray=Image.new('L',(31,17));gray.putdata([(x*13+y*19)%256 for y in range(gray.height)for x in range(gray.width)]);emit('gray-baseline',gray)
rgb=Image.new('RGB',(23,11));rgb.putdata([((x*13+y*3)%256,(x*11+y*31)%256,(x*29+y*17)%256)for y in range(rgb.height)for x in range(rgb.width)]);emit('rgb-baseline',rgb)
magick=shutil.which('magick')
if not magick:raise SystemExit('ImageMagick CLI is required to rebuild the YCCK reference fixture.')
ycck=out/'cmyk-ycck.jpg';subprocess.run([magick,str(out/'cmyk-orientation-1.jpg'),'-quality','97',str(ycck)],check=True)
original=(out/'cmyk-orientation-1.jpg').read_bytes();position=2
while position<len(original):
 marker=original[position+1];length=int.from_bytes(original[position+2:position+4],'big')
 if marker==0xee:
  (out/'cmyk-no-adobe.jpg').write_bytes(original[:position]+original[position+2+length:]);break
 position+=2+length
else:raise RuntimeError('Missing CMYK Adobe marker in the source fixture')
for name in ['cmyk-ycck','cmyk-no-adobe']:
 path=out/(name+'.jpg');decoded=ImageOps.exif_transpose(Image.open(path));raw=out/(name+'.bin');raw.write_bytes(decoded.tobytes());records.append({'name':name,'encoded':path.name,'reference':raw.name,'width':decoded.width,'height':decoded.height,'space':'CMYK','sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'referenceSha256':hashlib.sha256(raw.read_bytes()).hexdigest()})
(out/'manifest.json').write_text(json.dumps({'source':'Synthetic channel patterns; Pillow independently decodes JPEG and applies only EXIF orientation.','fixtures':records},indent=2)+'\n')
print(json.dumps({'fixtures':len(records),'directory':str(out)}))
