"""Bound actual ORT linear memory per worker; leave numerical WASM untouched."""
from pathlib import Path
import argparse, hashlib, json
p=argparse.ArgumentParser();p.add_argument('--ort-dist',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[1];out=root/'.build/m2-neural-runtime';out.mkdir(parents=True,exist_ok=True)
records={}
for provider,suffix in [('wasm',''),('webgpu','.asyncify')]:
    name=f'ort-wasm-simd-threaded{suffix}.mjs';source=a.ort_dist/name
    content=source.read_text();needle='new WebAssembly.Memory({initial:256,maximum:65536,shared:!0})'
    assert content.count(needle)==1
    modified=content.replace(needle,'new WebAssembly.Memory({initial:256,maximum:globalThis.__sherloqNeuralMemoryPages,shared:!0})')
    (out/name).write_text(modified)
    wrapper=out/f'{provider}-factory.mjs'
    wrapper.write_text(f"import factory from './{name}';\nlet instance;\nexport function heapBytes(){{return instance?.HEAPU8.byteLength??0;}}\nexport default async function(config){{const n=globalThis.__sherloqNeuralMemoryPages;if(!Number.isSafeInteger(n)||n<256||n>65536)throw Error('Invalid admitted memory cap');instance=await factory(config);return instance;}}\n")
    sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
    records[provider]=dict(sourceSha256=sha(source),factory=wrapper.name,factorySha256=sha(wrapper),module=name,moduleSha256=sha(out/name),wasm=source.with_suffix('.wasm').name,wasmSha256=sha(source.with_suffix('.wasm')))
(out/'manifest.json').write_text(json.dumps(dict(schema=1,ort='1.30.0',providers=records),indent=2)+'\n')
print(json.dumps(records))
