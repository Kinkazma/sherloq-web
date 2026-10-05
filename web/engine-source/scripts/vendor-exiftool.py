"""Pinned ExifTool 13.55 source + ZeroPerl interpreter; never executes downloaded scripts."""
import base64, hashlib, io, json, struct, tarfile, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'vendor/exiftool'; OUT.mkdir(parents=True,exist_ok=True)
def sha(b): return hashlib.sha256(b).hexdigest()
def download(url, expected):
    b=urllib.request.urlopen(url).read()
    assert sha(b)==expected,(url,sha(b))
    return b
URL='https://codeload.github.com/exiftool/exiftool/tar.gz/refs/tags/13.55'
SOURCE_SHA='5c9d422ad128fab728aacc5cc0aa77095d14cde74931389dd961d3d720e6b316'
source=download(URL,SOURCE_SHA); files={}
with tarfile.open(fileobj=io.BytesIO(source)) as ar:
    for m in ar.getmembers():
        name=m.name.removeprefix('exiftool-13.55/')
        if m.isfile() and (name=='exiftool' or name.startswith('lib/')):
            assert '..' not in Path(name).parts
            files['/'+name]=ar.extractfile(m).read()
    (OUT/'EXIFTOOL-README.txt').write_bytes(ar.extractfile('exiftool-13.55/README').read())
# No signal handlers in WASI. Leave all parsing/tag/scientific code unchanged.
cli=files['/exiftool'].decode()
for line in ["$SIG{INT}  = 'SigInt';  # do cleanup on Ctrl-C", "$SIG{CONT} = 'SigCont'; # (allows break-out of delays)"]:
    assert cli.count(line)==1;cli=cli.replace(line,'# WASI: cancellation terminates the containing worker.')
files['/exiftool']=cli.encode()
index=[];chunks=[];offset=0
for path,b in sorted(files.items()):
    index.append([path,offset,len(b)]);chunks.append(b);offset+=len(b)
header=json.dumps(index,separators=(',',':')).encode()
(OUT/'libraries.pack').write_bytes(struct.pack('<I',len(header))+header+b''.join(chunks))
NPM_URL='https://registry.npmjs.org/@6over3/zeroperl-ts/-/zeroperl-ts-1.0.10.tgz'
INTEGRITY='sha512-d7fBgN1UaP9BR6kZMyNsjIrxPd0QLqqx29VSprhK66m1csm/7E/anr+rEfp3gJDSne5FfDpM6aKtDGHyXG/vYQ=='
data=urllib.request.urlopen(NPM_URL).read()
assert 'sha512-'+base64.b64encode(hashlib.sha512(data).digest()).decode()==INTEGRITY
with tarfile.open(fileobj=io.BytesIO(data)) as ar:
    js=ar.extractfile('package/dist/esm/index.js').read().decode().split('//# sourceMappingURL')[0]
    original=ar.extractfile('package/dist/esm/zeroperl.wasm').read()
# Honor an explicitly supplied local fetch in module workers, not just window contexts.
needle='if(Ee())a=await(await(e??fetch)(q)).arrayBuffer();'
assert js.count(needle)==1;js=js.replace(needle,'if(e||Ee())a=await(await(e??fetch)(q)).arrayBuffer();')
assert js.count('withStdIo:{stdout:')==1
js=js.replace('withStdIo:{stdout:','withStdIo:{outputBuffers:true,stdout:')
(OUT/'zeroperl.js').write_text(js)
def read_uleb(data,p):
    value=0;shift=0
    while True:
        b=data[p];p+=1;value|=(b&127)<<shift
        if b<128:return value,p
        shift+=7;assert shift<=35

def uleb(n):
    out=bytearray()
    while n>=128:out.append((n&127)|128);n>>=7
    out.append(n);return bytes(out)
p=8;out=bytearray(original[:8]);changed=0
while p<len(original):
    kind=original[p];n,start=read_uleb(original,p+1);p=start+n;body=original[start:p]
    if kind==5:
        count,k=read_uleb(body,0);flags,k=read_uleb(body,k);initial,k=read_uleb(body,k)
        assert count==1 and flags in [0,1] and initial<=2048
        if flags:oldmax,k=read_uleb(body,k)
        assert k==len(body)
        body=uleb(1)+uleb(1)+uleb(initial)+uleb(2048);changed+=1
    out+=bytes([kind])+uleb(len(body))+body
assert changed==1
(OUT/'zeroperl.wasm').write_bytes(out)
licenses={
 'APACHE-LICENSE.txt':('https://www.apache.org/licenses/LICENSE-2.0.txt','cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30'),
 'PERL-ARTISTIC.txt':('https://raw.githubusercontent.com/Perl/perl5/v5.42.0/Artistic','dd90d4f42e4dcadf5a7c09eea0189d93c7b37ae560c91f0f6d5233ed3b9292a2'),
 'ZEROPERL-LICENSE.txt':('https://raw.githubusercontent.com/6over3/zeroperl/c28db5dd4fc9660e67117dfdb9f18a43623f5f3d/LICENSE','6fc708729f3370d84e941ec13ce288de2ccfa9508861310ccd1eab13d28dcfc3')}
for name,(url,digest) in licenses.items():(OUT/name).write_bytes(download(url,digest))
for name,url,digest,member in [
 ('ZLIB-LICENSE.txt','https://zlib.net/fossils/zlib-1.3.1.tar.gz','9a93b2b7dfdac77ceba5a558a580e74667dd6fede4585b91eefb60f03b72df23','zlib-1.3.1/README'),
 ('BZIP2-LICENSE.txt','https://sourceware.org/pub/bzip2/bzip2-1.0.8.tar.gz','ab5a03176ee106d3f0fa90e381da478ddae405918153cca248e682cd0c4a2269','bzip2-1.0.8/LICENSE')]:
    with tarfile.open(fileobj=io.BytesIO(download(url,digest))) as ar:(OUT/name).write_bytes(ar.extractfile(member).read())
for name in ['MUSL-LICENSE.txt','LLVM-LICENSE.txt']:(OUT/name).write_bytes((ROOT/'vendor/cloning'/name).read_bytes())
(OUT/'PINNED.json').write_text(json.dumps(dict(exiftool='13.55',sourceUrl=URL,sourceSha256=SOURCE_SHA,interpreter='@6over3/zeroperl-ts 1.0.10',npmUrl=NPM_URL,integrity=INTEGRITY,upstreamWasmSha256=sha(original),patches=['WASM memory maximum 128 MiB; all other WASM sections unchanged.','Explicit fetch works in a module worker. Inline source map removed. Standard IO uses upstream outputBuffers=true to preserve binary/UTF-8 bytes.','ExifTool signal registration omitted for WASI; no metadata extraction changes.'],libraries=len(files),files={p.name:sha(p.read_bytes()) for p in sorted(OUT.iterdir()) if p.name!='PINNED.json'}),indent=2)+'\n')
print('Vendored',len(files),'ExifTool files;',len(out),'WASM bytes; 128 MiB maximum')
