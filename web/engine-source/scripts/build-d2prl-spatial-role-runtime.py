"""Reproduce the spatial role loader cap; original ORT WASM stays unchanged."""
from pathlib import Path
import argparse,hashlib,json
parser=argparse.ArgumentParser();parser.add_argument('--base',type=Path,required=True);args=parser.parse_args()
root=Path(__file__).resolve().parents[1];out=root/'vendor/d2prl/dynamic';out.mkdir(parents=True,exist_ok=True)
source=args.base/'vendor/d2prl/ort-wasm-simd-threaded.mjs';text=source.read_text();source_sha=hashlib.sha256(text.encode()).hexdigest()
assert source_sha=='c58b7d2aab041b4a19f4c941050fde7c09a46b6e156105659d7945183de8334e'
assert text.count('8192')==1 and text.count('536870912')==3
text=text.replace('8192','32768').replace('536870912','2147483648')
(out/'ort-wasm-simd-threaded-roles2048.mjs').write_text(text)
(out/'factory-roles2048.mjs').write_text("""import factory from './ort-wasm-simd-threaded-roles2048.mjs';
export const runtimeId='ort130-wasm-2048mib-d2prl-spatial';
export const memoryMaximumBytes=2147483648;
let instance;
export function heapBytes(){return instance?.HEAPU8.byteLength??0;}
export default async function(config){instance=await factory(config);return instance;}
""")
files=['factory-roles2048.mjs','ort-wasm-simd-threaded-roles2048.mjs']
(out/'roles-runtime.json').write_text(json.dumps({'schema':1,'runtimeId':'ort130-wasm-2048mib-d2prl-spatial','memoryMaximumBytes':2147483648,'sourceLoaderSha256':source_sha,'wasmUnchanged':True,'files':{name:{'bytes':(out/name).stat().st_size,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest()} for name in files}},indent=2)+'\n')

# The bounded1344 role profile uses the same upstream loader and numerical WASM.
source_text=source.read_text()
assert source_text.count('8192')==1 and source_text.count('536870912')==3
(out/'ort-wasm-simd-threaded-roles1024.mjs').write_text(source_text.replace('8192','16384').replace('536870912','1073741824'))
(out/'factory-roles1024.mjs').write_text("import factory from './ort-wasm-simd-threaded-roles1024.mjs';\nexport const runtimeId='ort130-wasm-1024mib-d2prl-spatial';\nexport const memoryMaximumBytes=1073741824;\nlet instance;\nexport function heapBytes(){return instance?.HEAPU8.byteLength??0;}\nexport default async function(config){instance=await factory(config);return instance;}\n")
files1024=['factory-roles1024.mjs','ort-wasm-simd-threaded-roles1024.mjs']
(out/'roles-runtime1024.json').write_text(json.dumps({'schema':1,'runtimeId':'ort130-wasm-1024mib-d2prl-spatial','memoryMaximumBytes':1073741824,'sourceLoaderSha256':source_sha,'wasmUnchanged':True,'files':{name:{'bytes':(out/name).stat().st_size,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest()} for name in files1024}},indent=2)+'\n')
