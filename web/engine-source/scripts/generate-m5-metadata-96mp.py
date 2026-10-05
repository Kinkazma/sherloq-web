"""Own rich 96MP metadata/thumbnail/C2PA fixture; native offline references."""
from pathlib import Path
import ast,hashlib,json,os,struct,subprocess,sys,time
import cv2 as cv
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.build/integration/large-metadata';OUT.mkdir(parents=True,exist_ok=True)
TOOL=ROOT.parent/'native/exiftool/exiftool';C2PA=ROOT.parent/'native/c2pa/c2patool';SAMPLE=ROOT.parent/'third_party/c2patool-v0.28.0/c2patool/sample'
sha=lambda b:hashlib.sha256(b).hexdigest();cv.setNumThreads(1);started=time.time()
source=cv.imread(str(ROOT/'.build/integration/large-zero/source.png'));assert source.shape==(8000,12000,3)
thumb=cv.resize(source,(160,107),interpolation=cv.INTER_AREA);ok,thumb=cv.imencode('.jpg',thumb,[cv.IMWRITE_JPEG_QUALITY,90]);assert ok;raw=thumb.tobytes()
tiff=b'II'+struct.pack('<HI',42,8)+struct.pack('<HI',0,14)+struct.pack('<H',3)
tiff+=struct.pack('<HHII',259,3,1,6)+struct.pack('<HHII',513,4,1,56)+struct.pack('<HHII',514,4,1,len(raw))+struct.pack('<I',0)+raw
app=b'Exif\0\0'+tiff;ok,main=cv.imencode('.jpg',source,[cv.IMWRITE_JPEG_QUALITY,95]);assert ok
unsigned=OUT/'thumbnail.jpg';unsigned.write_bytes(main[:2].tobytes()+b'\xff\xe1'+struct.pack('>H',len(app)+2)+app+main[2:].tobytes());del main,source
subprocess.run([str(TOOL),'-overwrite_original','-Artist=M5 synthetic 96MP test','-XMP-dc:Subject=distant-copy','-GPSLatitude=0','-GPSLatitudeRef=N','-GPSLongitude=0','-GPSLongitudeRef=E',str(unsigned)],check=True,capture_output=True)
ns={'__file__':str(ROOT.parent/'source/gui/sherloq_app/core/c2pa.py')};exec(compile(ast.parse(Path(ns['__file__']).read_text()),ns['__file__'],'exec'),ns)
settings=OUT/'settings.json';settings.write_text(json.dumps(ns['SETTINGS']))
# Public upstream SAMPLE signing credentials only. No network timestamp authority.
manifest={'claim_generator_info':[{'name':'SHERLOQ M5 synthetic qualification','version':'1'}],'title':'Rich 12000x8000 synthetic copied texture','alg':'es256','sign_cert':str(SAMPLE/'es256_certs.pem'),'private_key':str(SAMPLE/'es256_private.key'),'assertions':[{'label':'c2pa.actions','data':{'actions':[{'action':'c2pa.created','digitalSourceType':'http://cv.iptc.org/newscodes/digitalsourcetype/softwareImage'}]}}]}
manifestPath=OUT/'manifest.json';manifestPath.write_text(json.dumps(manifest));signed=OUT/'signed.jpg'
env={k:v for k,v in os.environ.items() if not k.startswith(('C2PA','C2PATOOL'))}
r=subprocess.run([str(C2PA),str(unsigned),'--manifest',str(manifestPath),'--output',str(signed),'--settings',str(settings),'--force'],capture_output=True,env=env)
if r.returncode:raise RuntimeError(r.stderr.decode()[:2000])
# Same source pixels after metadata-only signing. Real native thumbnail functions.
sys.path.insert(0,str(ROOT.parent/'source'));from gui.sherloq_app.core.thumbnail import analyze_thumbnail
image=cv.imread(str(signed));assert image.shape==(8000,12000,3)
raw=subprocess.check_output([str(TOOL),'-config','','-b','-ThumbnailImage',str(signed)]);resized,difference=analyze_thumbnail(raw,image)
thumbref={'thumbnailSha256':sha(raw),'thumbnailBytes':len(raw),'resizedSha256':sha(memoryview(cv.cvtColor(resized,cv.COLOR_BGR2RGB))),'differenceSha256':sha(memoryview(cv.cvtColor(difference,cv.COLOR_BGR2RGB)))}
del resized,difference,image
meta=json.loads(subprocess.check_output([str(TOOL),'-config','','-G','-n','-j',str(signed)]))[0]
for tag in ['SourceFile','File:FileName','File:Directory','File:FileModifyDate','File:FileInodeChangeDate','File:FileAccessDate','File:FilePermissions']:meta.pop(tag,None)
# Corrupt a quantizer, preserving JPEG readability while invalidating signed data.
b=bytearray(signed.read_bytes());at=2
while at<len(b):
 marker=b[at+1];length=int.from_bytes(b[at+2:at+4],'big')
 if marker==0xdb:b[at+5]^=1;break
 at+=2+length
else:raise AssertionError('No DQT')
(OUT/'altered.jpg').write_bytes(b);del b
b=bytearray(signed.read_bytes());tail=len(b)-1024
while b[tail] in (0,255) or b[tail-1]==255:tail-=1
b[tail]^=1;(OUT/'altered-tail.jpg').write_bytes(b);del b
cases=[]
for filename in ['signed.jpg','altered.jpg','altered-tail.jpg']:
 p=subprocess.run([str(C2PA),str(OUT/filename),'--detailed','--settings',str(settings)],capture_output=True,env=env,timeout=60);result=ns['parse']((p.stdout,p.stderr.decode(),{'trust_configured':False}));cases.append({'file':filename,'sha256':sha((OUT/filename).read_bytes()),'states':{k:result[k] for k in ['manifest','integrity','signature','trust']},'validationResults':result['report']['validation_results']})
assert cases[0]['states']['integrity']=='valid' and cases[0]['states']['signature']=='valid',cases[0]['states']
assert all(c['states']['integrity']=='invalid' for c in cases[1:])
html=subprocess.check_output([str(TOOL),'-config','','-htmldump0',str(signed)]).decode().replace(str(signed),'/input/source').replace(signed.name,'source')
reference={'headersSha256':sha(html.encode()),'native':'ExifTool13.55 + core.thumbnail.analyze_thumbnail + c2patool0.28.0/c2pa-rs0.91.0 offline','dimensions':[12000,8000],'complexity':'Rich texture with distant1500x1200 copied region, JPEG95, embedded thumbnail and signed synthetic C2PA claim','signingCredentials':'Public c2patool upstream sample only; no timestamp/network; fixture not a real provenance assertion','metadata':meta,'thumbnail':thumbref,'c2pa':cases,'sourceBytes':signed.stat().st_size,'nativeReferenceSeconds':time.time()-started}
(OUT/'reference.json').write_text(json.dumps(reference,indent=2)+'\n');print(json.dumps({k:v for k,v in reference.items() if k not in ('metadata','c2pa')},indent=2));print([x['states'] for x in cases])
