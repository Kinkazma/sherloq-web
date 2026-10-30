"""Rebuild unchanged SciPy cKDTree plus the exact batched Ghost peer statistic."""
from pathlib import Path
import argparse, hashlib, json, os, subprocess

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--source-root', type=Path, default=root)
args = parser.parse_args()
sources = args.source_root.resolve()
out = root / 'vendor/ela-peers-fast'
out.mkdir(parents=True, exist_ok=True)
compiler = Path(os.environ['EMSDK']) / 'upstream/emscripten/em++'
env = {**os.environ, 'EM_FROZEN_CACHE': '1', 'EMCC_CORES': '1'}
for key in ['CPATH', 'C_INCLUDE_PATH', 'CPLUS_INCLUDE_PATH', 'OBJC_INCLUDE_PATH']:
    env.pop(key, None)
version = subprocess.check_output([str(compiler), '--version'], env=env, text=True).splitlines()[0]
assert '4.0.15' in version
spatial = sources / 'vendor/scipy-spatial'
inputs = [root / 'native/ela-peers.cpp', root / 'native/ela-ghost-profiles.cpp',
          root / 'native/ela-residual-profiles.cpp',
          spatial / 'build.cxx', spatial / 'query.cxx']
exports = ['_malloc', '_free', '_ela_peers_create', '_ela_peers_query',
           '_ela_peers_release', '_ela_ghost_profiles_batch', '_ela_residual_profiles_batch']
subprocess.run([str(compiler), *map(str, inputs), '-I' + str(spatial),
                '-I' + str(sources / 'native/scipy-compat'), '-O3',
                '-ffp-contract=off', '-fno-fast-math', '-fexceptions',
                '-ffile-prefix-map=' + str(root) + '/=',
                '-ffile-prefix-map=' + str(sources) + '/=',
                '-sDISABLE_EXCEPTION_CATCHING=0', '-sMODULARIZE=1',
                '-sEXPORT_ES6=1', '-sENVIRONMENT=web,worker,node',
                '-sFILESYSTEM=0', '-sALLOW_MEMORY_GROWTH=1',
                '-sINITIAL_MEMORY=16777216', '-sMAXIMUM_MEMORY=67108864',
                '-sEXPORTED_FUNCTIONS=' + json.dumps(exports),
                '-sEXPORTED_RUNTIME_METHODS=["HEAPF64","HEAPF32","HEAP32","HEAP16","HEAPU8"]',
                '-o', str(out / 'peers.js')], env=env, check=True)
files = [out / 'peers.js', out / 'peers.wasm']
(out / 'PINNED.json').write_text(json.dumps({
    'scipy': '1.17.1', 'compiler': version, 'leafsize': 16,
    'balanced': True, 'compact': True,
    'statistic': 'unchanged binary64 Ghost median/MAD with exact native peer order',
    'sources': {str(p.relative_to(root) if p.is_relative_to(root) else p.relative_to(sources)):
                hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs},
    'files': {p.name: {'bytes': p.stat().st_size,
                       'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files}
}, indent=2) + '\n')
