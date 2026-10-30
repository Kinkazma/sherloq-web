#!/usr/bin/env python3
"""Rebuild the exact SIMD SSG localization resources; keep scalar resources."""
from pathlib import Path
import argparse, hashlib, json, os, re, subprocess

p = argparse.ArgumentParser()
p.add_argument('--emsdk', type=Path, required=True)
p.add_argument('--source-root', type=Path, default=Path(__file__).resolve().parents[1])
a = p.parse_args()
root = a.source_root.resolve()
sdk = a.emsdk.resolve()
compiler = sdk / 'upstream/emscripten/em++'
family = root / 'vendor/ssg-ssim-simd'
env = dict(os.environ, EM_CONFIG=str(sdk / '.emscripten'), EM_FROZEN_CACHE='1', EMCC_CORES='1')
for key in ['CPATH', 'C_INCLUDE_PATH', 'CPLUS_INCLUDE_PATH', 'OBJC_INCLUDE_PATH']:
    env.pop(key, None)
version = subprocess.run([str(compiler), '--version'], env=env, check=True, capture_output=True, text=True)
found = re.search(r'^em(?:cc|\+\+) \(Emscripten[^\n]*\) ([0-9]+\.[0-9]+\.[0-9]+)(?:\s|$)', version.stdout)
if not found or found.group(1) != '4.0.15':
    raise RuntimeError('This reconstruction requires Emscripten 4.0.15; no resources were modified.')
base_exports = ['malloc', 'free', 'ssg_full_blur', 'ssg_full_roi', 'ssg_full_localize', 'ssg_full_ssim', 'ssg_full_salience', 'ssg_full_set_team', 'ssg_full_shutdown', 'ssg_full_morph', 'ssg_full_phrases']
strict_exports = ['ssg_strict_blur', 'ssg_strict_warp', 'ssg_strict_ssim', 'ssg_strict_morph', 'ssg_strict_salience', 'ssg_strict_localize', 'ssg_split_prepare', 'ssg_split_post']
commands = []
for name in ['ssg-full', 'ssg-strict']:
    for shared in [False, True]:
        output = family / name / ('localization-shared.mjs' if shared else 'localization.mjs')
        exports = base_exports + (strict_exports if name == 'ssg-strict' else [])
        cmd = [str(compiler), str(family / name / 'localization.cpp'), '-I' + str(root / 'vendor/pocketfft'), '-O3', '-std=c++17', '-ffp-contract=off', '-fno-fast-math', '-fno-vectorize', '-fno-slp-vectorize', '-msimd128', '-fexceptions', '-sDISABLE_EXCEPTION_CATCHING=0', '-DPOCKETFFT_NO_MULTITHREADING', '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sENVIRONMENT=node,web,worker', '-sFILESYSTEM=0', '-sIMPORTED_MEMORY=1', '-sALLOW_MEMORY_GROWTH=1', '-sINITIAL_MEMORY=33554432', '-sMAXIMUM_MEMORY=2147483648', '-sABORTING_MALLOC=0', '-sSTACK_SIZE=1048576', '-sEXPORTED_FUNCTIONS=' + json.dumps(['_' + x for x in exports]), '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF64","HEAPU32"]', '-ffile-prefix-map=' + str(root) + '/=', '-o', str(output)]
        if shared:
            cmd += ['-pthread', '-sPTHREAD_POOL_SIZE=Module["workerCount"]||1', '-sPTHREAD_POOL_SIZE_STRICT=2']
        subprocess.run(cmd, env=env, check=True)
        text = output.read_text()
        marker = 'var getHeapMax=()=>2147483648;'
        if text.count(marker) != 1:
            raise RuntimeError('Heap-bound injection boundary changed')
        output.write_text(text.replace(marker, 'var getHeapMax=()=>Module["maximumHeapBytes"]??2147483648;'))
        commands.append([v.replace(str(sdk), 'EMSDK').replace(str(root), 'SOURCE_ROOT') for v in cmd])
        print('Built', name, 'shared' if shared else 'single', flush=True)
files = {str(q.relative_to(family)): {'bytes': q.stat().st_size, 'sha256': hashlib.sha256(q.read_bytes()).hexdigest()} for q in sorted(family.rglob('*')) if q.is_file() and q.name != 'PINNED.json'}
pocket = root / 'vendor/pocketfft/pocketfft_hdronly.h'
record = {'schema': 1, 'compiler': 'Emscripten4.0.15', 'definition': 'Exact independent f64 SIMD lanes and support-aware five-moment SSG filters, tiled scratch with scalar fallback; original scalar resources preserved', 'buildScript': 'scripts/build-ssg-ssim-simd.py', 'commands': commands, 'files': files, 'dependencies': {'vendor/pocketfft/pocketfft_hdronly.h': {'sha256': hashlib.sha256(pocket.read_bytes()).hexdigest()}}}
(family / 'PINNED.json').write_text(json.dumps(record, indent=2) + '\n')
