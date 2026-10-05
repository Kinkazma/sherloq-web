"""Private 1GiB ORT study factory; existing 512MiB runtime stays unchanged."""
from pathlib import Path
import hashlib, json
root = Path(__file__).resolve().parents[1]
package = root / '.build/ort130/package'
assert json.loads((package / 'package.json').read_text())['version'] == '1.30.0'
source = package / 'dist/ort-wasm-simd-threaded.mjs'
text = source.read_text()
old = 'new WebAssembly.Memory({initial:256,maximum:65536,shared:!0})'
assert text.count(old) == 1
out = root / '.build/segmentation-ort-1024'
out.mkdir(exist_ok=True)
(out / 'ort-wasm-simd-threaded.mjs').write_text(text.replace(old, 'new WebAssembly.Memory({initial:256,maximum:16384,shared:!0})'))
(out / 'factory.mjs').write_text("import factory from './ort-wasm-simd-threaded.mjs';\nlet instance;\nexport function heapBytes(){return instance?.HEAPU8.byteLength??0;}\nexport default async function(config){instance=await factory(config);return instance;}\n")
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(package / 'dist/ort-wasm-simd-threaded.wasm') == sha(root / 'vendor/d2prl/ort-wasm-simd-threaded.wasm')
report = dict(schema=1, runtimeId='ort130-wasm-1024mib-study', memoryMaximumBytes=1024**3, upstreamFactorySha256=sha(source), wasmSha256=sha(root / 'vendor/d2prl/ort-wasm-simd-threaded.wasm'), scope='Only instantiated maximum changes4GiB to1GiB. Numerical WASM unchanged. Private candidate; not included in current public runtime.', files={p.name:dict(bytes=p.stat().st_size,sha256=sha(p)) for p in [out / 'factory.mjs', out / 'ort-wasm-simd-threaded.mjs']})
(out / 'runtime.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report), flush=True)
