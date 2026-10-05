"""Bound the ORT1.30 hybrid WebGPU/WASM study to a512MiB linear heap."""
from pathlib import Path
import argparse, hashlib, json
args = argparse.ArgumentParser()
args.add_argument('--stage', action='store_true', help='Stage the pinned portable runtime, without model weights')
options = args.parse_args()
root = Path(__file__).resolve().parents[1]
package = root / '.build/ort130/package'
assert json.loads((package / 'package.json').read_text())['version'] == '1.30.0'
source = package / 'dist/ort-wasm-simd-threaded.jsep.mjs'
old = 'new WebAssembly.Memory({initial:256,maximum:65536,shared:!0})'
text = source.read_text()
assert text.count(old) == 1
out = root / '.build/segmentation-ort-gpu'
out.mkdir(exist_ok=True)
(out / 'ort-wasm-simd-threaded.jsep.mjs').write_text(text.replace(old, 'new WebAssembly.Memory({initial:256,maximum:8192,shared:!0})'))
(out / 'factory.mjs').write_text("import factory from './ort-wasm-simd-threaded.jsep.mjs';\nlet instance;\nexport function heapBytes(){return instance?.HEAPU8.byteLength??0;}\nexport default async function(config){instance=await factory(config);return instance;}\n")
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
report = dict(schema=1, runtimeId='ort130-hybrid-512mib-study', memoryMaximumBytes=512*1024**2, upstreamFactorySha256=sha(source), wasmSha256=sha(package / 'dist/ort-wasm-simd-threaded.jsep.wasm'), scope='WASM unchanged; JavaScript instantiated maximum reduced4GiB to512MiB. GPU buffers require separate admission. No pure-GPU claim.', files={p.name:dict(bytes=p.stat().st_size,sha256=sha(p)) for p in [out / 'factory.mjs', out / 'ort-wasm-simd-threaded.jsep.mjs']})
(out / 'runtime.json').write_text(json.dumps(report, indent=2) + '\n')
if options.stage:
    target = root / 'vendor/segmentation'
    target.mkdir(exist_ok=True)
    sources = {name: out / name for name in ['factory.mjs', 'ort-wasm-simd-threaded.jsep.mjs']}
    sources.update({name: package / 'dist' / name for name in ['ort.all.min.mjs', 'ort-wasm-simd-threaded.jsep.wasm']})
    sources.update({name: root / '.build/ort130/notices' / name for name in ['LICENSE', 'ThirdPartyNotices.txt']})
    sources['ONNXRUNTIME-SOURCES.json'] = root / '.build/ort130/notices/sources.json'
    for name, source in sources.items():
        data = source.read_bytes()
        assert b'/' + b'Users/' not in data, 'Private build path: ' + name
        (target / name).write_bytes(data)
    report.update(runtimeId='ort130-segmentation-hybrid-512mib', gpuMaximumBytes=512*1024**2,
                  scope='Pinned ORT1.30 JSEP hybrid runtime. CPU and GPU may execute nodes. Linear heap512MiB; actual GPU buffers independently capped512MiB. Float32 models, no startup calibration.',
                  files={name:dict(bytes=(target / name).stat().st_size, sha256=sha(target / name)) for name in sorted(sources)})
    (target / 'PINNED.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report), flush=True)
