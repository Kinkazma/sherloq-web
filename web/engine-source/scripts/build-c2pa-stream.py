"""Build the pinned official SDK with only JPEG metadata reads streamed.

Use Rust1.96.0, wasm32-unknown-unknown and wasm-bindgen-cli0.2.129 in PATH.
CARGO_HOME/RUSTUP_HOME may be isolated beneath .build; no installation is done here.
"""
from pathlib import Path
import base64,hashlib,json,os,re,shutil,subprocess,tarfile,urllib.request
ROOT=Path(__file__).resolve().parents[1];BUILD=ROOT/'.build/integration/c2pa-build';OUT=ROOT/'vendor/c2pa';BUILD.mkdir(parents=True,exist_ok=True)
COMMIT='edb68d82944f15b92695506e9ff9b8280a709847';PROJECT=BUILD/'contentauth-c2pa-js-edb68d8';SDK=BUILD/'c2pa-0.91.0'
sha=lambda b:hashlib.sha256(b).hexdigest()
def acquire(url,name):
 p=BUILD/name
 if not p.exists():p.write_bytes(urllib.request.urlopen(url).read())
 return p
js_url='https://api.github.com/repos/contentauth/c2pa-js/tarball/'+COMMIT;sdk_url='https://crates.io/api/v1/crates/c2pa/0.91.0/download'
js=acquire(js_url,'upstream-js.tar.gz');sdk=acquire(sdk_url,'upstream-sdk.tar.gz')
# Pinned archive hashes and the exact upstream commit identify source inputs.
expected=json.loads((OUT/'STREAM-SOURCES.json').read_text()) if (OUT/'STREAM-SOURCES.json').exists() else None
if expected:
 for p,key in [(js,'jsArchiveSha256'),(sdk,'sdkArchiveSha256')]:assert sha(p.read_bytes())==expected[key],key
if not PROJECT.exists():
 with tarfile.open(js) as archive:archive.extractall(BUILD,filter='data')
if not SDK.exists():
 with tarfile.open(sdk) as archive:archive.extractall(BUILD,filter='data')
patch=ROOT/'native/c2pa-jpeg-stream.patch';source=SDK/'src/asset_handlers/jpeg_io.rs'
if 'SHERLOQ: retain' not in source.read_text():subprocess.run(['patch','-p1','-i',str(patch)],cwd=SDK,check=True)
if expected:
 assert sha(patch.read_bytes())==expected['patchSha256'], 'Patch differs from pinned source build'
 assert sha(source.read_bytes())==expected['jpegSourceSha256'], 'JPEG reader differs from pinned patch'
 assert sha((SDK/'src/utils/hash_utils.rs').read_bytes())==expected['hashSourceSha256'], 'Hash buffering differs from pinned patch'
cargo=PROJECT/'Cargo.toml';text=cargo.read_text()
if '[patch.crates-io]' not in text:cargo.write_text(text+'\n[patch.crates-io]\nc2pa = { path = "../c2pa-0.91.0" }\n')
lock=OUT/'Cargo.lock'
if lock.exists():shutil.copyfile(lock,PROJECT/'Cargo.lock')
assert subprocess.check_output(['rustc','--version'],text=True).startswith('rustc 1.96.0 ')
assert subprocess.check_output(['wasm-bindgen','--version'],text=True).strip()=='wasm-bindgen 0.2.129'
subprocess.run(['cargo','build','--locked','--manifest-path',str(cargo),'-p','c2pa-wasm','--target','wasm32-unknown-unknown','--release'],check=True)
generated=BUILD/'generated';generated.mkdir(exist_ok=True)
subprocess.run(['wasm-bindgen',str(PROJECT/'target/wasm32-unknown-unknown/release/c2pa_wasm.wasm'),'--target','web','--out-dir',str(generated),'--out-name','c2pa'],check=True)
original=(generated/'c2pa_bg.wasm').read_bytes()
def read_uleb(data,at):
 value=0;shift=0
 while True:
  b=data[at];at+=1;value|=(b&127)<<shift
  if b<128:return value,at
  shift+=7;assert shift<=35

def uleb(value):
 out=bytearray()
 while value>=128:out.append((value&127)|128);value>>=7
 out.append(value);return bytes(out)
result=bytearray(original[:8]);at=8;memories=0
while at<len(original):
 kind=original[at];at+=1;size,start=read_uleb(original,at);end=start+size;body=original[start:end];at=end
 if kind==5:
  count,p=read_uleb(body,0);assert count==1
  flags,p=read_uleb(body,p);assert flags in (0,1)
  initial,p=read_uleb(body,p)
  if flags==1:oldmax,p=read_uleb(body,p)
  assert p==len(body) and initial<=2048;body=uleb(1)+uleb(1)+uleb(initial)+uleb(2048);memories+=1
 result+=bytes([kind])+uleb(len(body))+body
assert memories==1
js_text=(generated/'c2pa.js').read_text();start=js_text.index('    json() {');end=js_text.index('    manifestStore()',start);section=js_text[start:end];needle='            return getStringFromWasm0(ret[0], ret[1]);';assert section.count(needle)==1
section=section.replace(needle,"            if (ret[1] > 4 * 1024 * 1024) throw Object.assign(new Error('C2PA JSON report exceeds 4 MiB.'), {code:'MEMORY_LIMIT'});\n"+needle);js_text=js_text[:start]+section+js_text[end:]
js_text+='\nexport const WASM_SRI = "sha512-'+base64.b64encode(hashlib.sha512(result).digest()).decode()+'";\n'
(OUT/'c2pa.js').write_text(js_text);(OUT/'c2pa_bg.wasm').write_bytes(result)
sdkCommit=json.loads((SDK/'.cargo_vcs_info.json').read_text())['git']['sha1']
for name in ['LICENSE-MIT','LICENSE-APACHE']:
 if not (SDK/name).exists():(SDK/name).write_bytes(urllib.request.urlopen('https://raw.githubusercontent.com/contentauth/c2pa-rs/'+sdkCommit+'/'+name).read())
 shutil.copyfile(SDK/name,OUT/('SDK-'+name))
img=BUILD/'img-parts-0.4.0'
if not img.exists():
 archive=acquire('https://crates.io/api/v1/crates/img-parts/0.4.0/download','img-parts-0.4.0.tar.gz')
 assert sha(archive.read_bytes())=='19734e3c43b2a850f5889c077056e47c874095f2d87e853c7c41214ae67375f0'
 with tarfile.open(archive) as unpack:unpack.extractall(BUILD,filter='data')
for name in ['LICENSE-MIT','LICENSE-APACHE']:
 if img.exists():shutil.copyfile(img/name,OUT/('IMG-PARTS-'+name))
shutil.copyfile(PROJECT/'Cargo.lock',lock)
record={'package':'@contentauth/c2pa-wasm','version':'0.13.2','sdk':'c2pa-rs 0.91.0','sourceCommit':COMMIT,'jsSourceUrl':js_url,'jsArchiveSha256':sha(js.read_bytes()),'sdkSourceUrl':sdk_url,'sdkArchiveSha256':sha(sdk.read_bytes()),'jpegSourceSha256':sha(source.read_bytes()),'hashSourceSha256':sha((SDK/'src/utils/hash_utils.rs').read_bytes()),'patchSha256':sha(patch.read_bytes()),'cargoLockSha256':sha(lock.read_bytes()),'sdkSourceCommit':sdkCommit,'headerParserReference':'img-parts0.4.0 MIT/Apache-2.0; same marker rules and first original entropy byte','rustc':subprocess.check_output(['rustc','--version'],text=True).strip(),'wasmBindgen':'0.2.129','patches':['JPEG metadata extraction retains headers through first SOS/EOI, preserving img-parts0.4.0 marker rules; unchanged SDK validates hashes on original full stream.','Sequential WASM hashing uses1MiB chunks instead of256MiB; digest algorithms and range/exclusion bytes unchanged.','128MiB memory-section maximum and4MiB JSON UTF8 limit; no cryptographic or trust changes.'],'unboundedBuildWasmSha256':sha(original),'files':{name:sha((OUT/name).read_bytes()) for name in ['c2pa.js','c2pa_bg.wasm','LICENSE','SDK-LICENSE-MIT','SDK-LICENSE-APACHE','IMG-PARTS-LICENSE-MIT','IMG-PARTS-LICENSE-APACHE']}}
(OUT/'STREAM-SOURCES.json').write_text(json.dumps(record,indent=2)+'\n');(OUT/'PINNED.json').write_text(json.dumps(record,indent=2)+'\n');print('Built bounded JPEG metadata reader',len(result),'bytes')
