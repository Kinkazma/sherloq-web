"""Vendor the pinned official reader, with bounded WASM heap and JSON output only."""
import base64,hashlib,io,json,re,tarfile,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'vendor/c2pa';OUT.mkdir(parents=True,exist_ok=True)
# npm package integrity is independently pinned below, not accepted from a moving tag.
VERSION='0.13.2'
META=json.load(urllib.request.urlopen(f'https://registry.npmjs.org/@contentauth/c2pa-wasm/{VERSION}'))
INTEGRITY='sha512-2cj0iV6EW2JmfbT3US8Ho7sZVzc12y0sLdGrIW9MqJC+sCqtEawOGuY5K7KAvIwCX9OOse9LvYOEwIJMglzbWw=='
data=urllib.request.urlopen(META['dist']['tarball']).read()
assert 'sha512-'+base64.b64encode(hashlib.sha512(data).digest()).decode()==INTEGRITY
with tarfile.open(fileobj=io.BytesIO(data)) as archive:
    files={name:archive.extractfile('package/'+name).read() for name in ['pkg/c2pa.js','pkg/c2pa_bg.wasm','LICENSE']}
original=files['pkg/c2pa_bg.wasm']
def read_uleb(data,at):
    value=0;shift=0
    while True:
        b=data[at];at+=1;value|=(b&127)<<shift
        if b<128:return value,at
        shift+=7
        assert shift<=35

def uleb(value):
    out=bytearray()
    while value>=128:out.append((value&127)|128);value>>=7
    out.append(value);return bytes(out)
result=bytearray(original[:8]);at=8;memories=0
while at<len(original):
    kind=original[at];at+=1;size,start=read_uleb(original,at);end=start+size;body=original[start:end];at=end
    if kind==5:
        count,p=read_uleb(body,0);assert count==1
        flags,p=read_uleb(body,p);assert flags in [0,1]
        initial,p=read_uleb(body,p)
        if flags==1:oldmax,p=read_uleb(body,p)
        assert p==len(body) and initial<=2048
        body=uleb(1)+uleb(1)+uleb(initial)+uleb(2048);memories+=1
    result+=bytes([kind])+uleb(len(body))+body
assert memories==1
js=files['pkg/c2pa.js'].decode()
# The reader's JSON string is bounded before decoding/copying out of linear memory.
start=js.index('    json() {');end=js.index('    manifestStore()',start)
section=js[start:end];needle='            return getStringFromWasm0(ret[0], ret[1]);';assert section.count(needle)==1
section=section.replace(needle,"            if (ret[1] > 4 * 1024 * 1024) throw Object.assign(new Error('C2PA JSON report exceeds 4 MiB.'), {code:'MEMORY_LIMIT'});\n"+needle)
js=js[:start]+section+js[end:]
js=re.sub(r'export const WASM_SRI = "[^"]+";', 'export const WASM_SRI = "sha512-'+base64.b64encode(hashlib.sha512(result).digest()).decode()+'";',js)
(OUT/'c2pa.js').write_text(js);(OUT/'c2pa_bg.wasm').write_bytes(result);(OUT/'LICENSE').write_bytes(files['LICENSE'])
sha=lambda b:hashlib.sha256(b).hexdigest()
(OUT/'PINNED.json').write_text(json.dumps(dict(package='@contentauth/c2pa-wasm',version=VERSION,sdk='c2pa-rs 0.91.0',url=META['dist']['tarball'],integrity=INTEGRITY,upstreamWasmSha256=sha(original),patches=['Only memory-section maximum changed to 2048 pages (128 MiB); all other WASM sections unchanged.','Reader.json() rejects >4 MiB UTF-8 before JS decoding; scientific/cryptographic code unchanged. WASM_SRI updated for bounded binary.'],files={name:sha((OUT/name).read_bytes()) for name in ['c2pa.js','c2pa_bg.wasm','LICENSE']}),indent=2)+'\n')
print('Pinned',VERSION,'WASM',len(result),'heap maximum128MiB')
