"""Small native ExifTool 13.55 corpus; writes only M5-owned tests/data/exiftool."""
import ast, hashlib, json, shutil, subprocess, struct, zlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'tests/data/exiftool';OUT.mkdir(parents=True,exist_ok=True)
TOOL='/Users/gaeldauchy/SHERLOQ/native/exiftool/exiftool'
assert subprocess.check_output([TOOL,'-ver']).strip()==b'13.55'
inputs=[('rich.jpg',ROOT/'fixtures/exif-tools.jpg'),('exif.png',ROOT/'tests/data/png-exif/exif-1.png'),('rotated.tiff',ROOT/'fixtures/codec-orientation-6.tiff'),('plain.jpg',ROOT/'fixtures/odd.jpg')]
for name,source in inputs:shutil.copyfile(source,OUT/name)
subprocess.run([TOOL,'-overwrite_original','-Artist=M5 synthétique','-XMP-dc:Subject=first','-XMP-dc:Subject+=deuxième','-IPTC:Keywords=tag-one','-IPTC:Keywords+=tag-two','-XMP-exif:GPSLatitude=0','-XMP-exif:GPSLongitude=-12.25','-EXIF:GPSAltitude=0','-EXIF:UserComment=<script>not executable</script>',str(OUT/'rich.jpg')],check=True,capture_output=True)
# XMP-only GPS exercises a composite source outside the old EXIF rational parser.
shutil.copyfile(ROOT/'fixtures/odd.jpg',OUT/'xmp-gps.jpg')
subprocess.run([TOOL,'-overwrite_original','-XMP-exif:GPSLatitude=0','-XMP-exif:GPSLongitude=-12.25',str(OUT/'xmp-gps.jpg')],check=True,capture_output=True)
inputs.append(('xmp-gps.jpg',None))
shutil.copyfile(OUT/'rich.jpg',OUT/'zero-gps.jpg')
subprocess.run([TOOL,'-overwrite_original','-GPSLatitude=0','-GPSLatitudeRef=N','-GPSLongitude=0','-GPSLongitudeRef=E',str(OUT/'zero-gps.jpg')],check=True,capture_output=True)
inputs.append(('zero-gps.jpg',None))
raw=(OUT/'exif.png').read_bytes();data=b'Description\0\0'+zlib.compress(b'Synthetic compressed PNG metadata. '*100)
chunk=struct.pack('>I',len(data))+b'zTXt'+data+struct.pack('>I',zlib.crc32(b'zTXt'+data))
(OUT/'compressed.png').write_bytes(raw[:33]+chunk+raw[33:]);inputs.append(('compressed.png',None))
virtual=['SourceFile','File:FileName','File:Directory','File:FileModifyDate','File:FileInodeChangeDate','File:FileAccessDate','File:FilePermissions']
ns={};native=Path('/Users/gaeldauchy/SHERLOQ/source/gui/sherloq_app/core/metadata.py');exec(compile(ast.parse(native.read_text()),str(native),'exec'),ns)
cases=[]
for name,_ in inputs:
 path=OUT/name
 meta=json.loads(subprocess.check_output([TOOL,'-config','','-G','-n','-j',str(path)]))[0]
 rows=ns['metadata_rows'](meta)
 location=json.loads(subprocess.check_output([TOOL,'-config','','-G','-n','-j','-Composite:GPSLatitude','-Composite:GPSLongitude',str(path)]))[0]
 location.pop('SourceFile',None)
 for tag in virtual:meta.pop(tag,None)
 html=subprocess.check_output([TOOL,'-config','','-htmldump0',str(path)]).decode().replace(str(path),'/input/source').replace(name,'source')
 thumb=subprocess.check_output([TOOL,'-config','','-b','-ThumbnailImage',str(path)])
 (OUT/(name+'.html')).write_text(html)
 cases.append(dict(file=name,metadata=meta,locationMetadata=location,nativeDisplayRows=rows,htmlSha256=hashlib.sha256(html.encode()).hexdigest(),thumbnailBytes=len(thumb),thumbnailSha256=hashlib.sha256(thumb).hexdigest()))
(OUT/'reference.json').write_text(json.dumps(dict(version='13.55',cases=cases),ensure_ascii=False,indent=2)+'\n')
print(len(cases),'native ExifTool cases')
