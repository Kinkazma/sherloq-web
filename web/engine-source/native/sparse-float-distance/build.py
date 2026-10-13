"""Rebuild the ordered float32 helper with an Emscripten LLVM toolchain."""
from pathlib import Path
import hashlib
import json
import subprocess
import os

HERE = Path(__file__).resolve().parent
CLANG = Path(os.environ.get('WASM_CLANG', 'clang++'))
records = []
for variant in ['scalar-control', 'simd-ordered']:
    output = HERE / (variant + '.wasm')
    command = [str(CLANG), '--target=wasm32', '-O3', '-msimd128', '-ffp-contract=off', '-fno-associative-math', '-fno-math-errno', '-fno-vectorize', '-fno-slp-vectorize', '-nostdlib', '-Wl,--no-entry', '-Wl,--import-memory', '-Wl,--initial-memory=8388608', '-Wl,--max-memory=67108864', '-Wl,--export=sparse_float_distance']
    if variant == 'simd-ordered':
        command += ['-DSPARSE_DISTANCE_SIMD=1']
    command += ['distance.cpp', '-o', output.name]
    subprocess.run(command, check=True, cwd=HERE)
    raw = output.read_bytes()
    records.append({'variant': variant, 'file': output.name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'command': command})
(HERE / 'build-proof.json').write_text(json.dumps({'status': 'built-only-not-qualified', 'sourceSha256': hashlib.sha256((HERE / 'distance.cpp').read_bytes()).hexdigest(), 'artifacts': records}, indent=2) + '\n')
print(json.dumps({'status': 'built-only-not-qualified', 'artifacts': records}))
