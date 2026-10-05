from pathlib import Path
import argparse,hashlib,json,re,time,cv2 as cv
parser=argparse.ArgumentParser();parser.add_argument('--variant',default='');args=parser.parse_args();assert re.fullmatch('[a-z0-9-]*',args.variant)
basename='m5-progressive-96mp'+('-'+args.variant if args.variant else '')
root=Path(__file__).resolve().parents[1];started=time.perf_counter()
proof=json.loads((root/'docs'/(basename+'-proof.json')).read_text());reference=json.loads((root/'docs/m5-progressive-96mp-native-reference.json').read_text());path=root/'.build/integration'/(basename+'.png')
assert proof['passed'] and proof['sourceSha256']==reference['sha256'] and path.stat().st_size==proof['archive']['byteLength']
with path.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
assert digest==proof['archive']['sha256'];image=cv.imread(str(path));assert list(image.shape)==[reference['height'],reference['width'],3]
rgb=cv.cvtColor(image,cv.COLOR_BGR2RGB);rgb_sha=hashlib.sha256(memoryview(rgb)).hexdigest();assert rgb_sha==reference['rgbSha256']
report=dict(passed=True,scope='Independent OpenCV decode of every delivered PNG pixel after source unload; oriented native RGB hash exact.',bytes=path.stat().st_size,sha256=digest,rgbSha256=rgb_sha,dimensions=proof['dimensions'],engineCommit=proof['engineCommit'],seconds=time.perf_counter()-started)
(root/'docs'/(basename+'-export-proof.json')).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
