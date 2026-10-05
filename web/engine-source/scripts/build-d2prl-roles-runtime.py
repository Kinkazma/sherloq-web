"""Bound ORT1.30's linear memory without changing its WASM numerical code.
Keep upstream distribution untouched. No preload/inference/calibration here.
"""
from pathlib import Path
import json,hashlib
root=Path(__file__).resolve().parents[1];package=root/'.build/ort130/package';assert json.loads((package/'package.json').read_text())['version']=='1.30.0';source=package/'dist/ort-wasm-simd-threaded.mjs';wasm=package/'dist/ort-wasm-simd-threaded.wasm';out=root/'.build/d2prl-roles-runtime';out.mkdir(exist_ok=True)
s=source.read_text();old='new WebAssembly.Memory({initial:256,maximum:65536,shared:!0})';assert s.count(old)==1
s=s.replace(old,'new WebAssembly.Memory({initial:256,maximum:8192,shared:!0})');(out/'ort-wasm-simd-threaded.mjs').write_text(s)
(out/'factory.mjs').write_text("import factory from './ort-wasm-simd-threaded.mjs';\nlet instance;\nexport function heapBytes(){return instance?.HEAPU8.byteLength??0;}\nexport default async function(config){instance=await factory(config);return instance;}\n")
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();report=dict(schema=1,runtimeId='ort130-wasm-512mib',upstreamVersion='1.30.0',memoryMaximumBytes=512*1024**2,scope='Only instantiated linear-memory maximum reduced4GiB->512MiB. WASM bytes untouched; allocation refusal remains explicit. Factory exposes actual heap capacity after useful inference, not RSS.',upstreamFactorySha256=sha(source),wasmSha256=sha(wasm),factory='factory.mjs',files={p.name:dict(bytes=p.stat().st_size,sha256=sha(p)) for p in [out/'ort-wasm-simd-threaded.mjs',out/'factory.mjs']})
(out/'runtime.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
