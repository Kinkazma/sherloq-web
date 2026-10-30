"""Build additive, support-aware SSG kernels beside the pinned native kernels.

No model, detector parameter or original source file is rewritten. Keep the
licenses/notices of vendor/ssg-full and PocketFFT with the resulting dependency.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--emsdk', type=Path, required=True)
parser.add_argument('--engine-source', type=Path, default=Path(__file__).resolve().parents[1])
args = parser.parse_args()
root = args.engine_source.resolve()
output = Path(__file__).resolve().parents[1] / 'vendor' / 'ssg-strict'
exports = ['malloc', 'free', 'ssg_full_blur', 'ssg_full_ssim', 'ssg_full_roi',
           'ssg_full_localize', 'ssg_full_salience', 'ssg_full_set_team',
           'ssg_full_shutdown', 'ssg_full_morph', 'ssg_full_phrases',
           'ssg_strict_blur', 'ssg_strict_warp', 'ssg_strict_ssim',
           'ssg_strict_morph', 'ssg_strict_salience', 'ssg_strict_localize',
           'ssg_split_prepare', 'ssg_split_post']
command = [str(args.emsdk / 'upstream/emscripten/em++'), str(output / 'localization.cpp'),
           '-I' + str(root / 'vendor/ssg-strict'), '-I' + str(root / 'vendor/ssg-full'),
           '-I' + str(root / 'vendor/pocketfft'), '-O3', '-std=c++17',
           '-ffp-contract=off', '-fexceptions', '-sDISABLE_EXCEPTION_CATCHING=0',
           '-DPOCKETFFT_NO_MULTITHREADING', '-sMODULARIZE=1', '-sEXPORT_ES6=1',
           '-sENVIRONMENT=node,web,worker', '-sFILESYSTEM=0', '-sIMPORTED_MEMORY=1',
           '-sALLOW_MEMORY_GROWTH=1', '-sINITIAL_MEMORY=33554432',
           '-sMAXIMUM_MEMORY=2147483648', '-sABORTING_MALLOC=0', '-sSTACK_SIZE=1048576',
           '-sEXPORTED_FUNCTIONS=' + json.dumps(['_' + name for name in exports]),
           '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF64","HEAPU32"]']
environment = dict(os.environ, EM_CONFIG=str(args.emsdk / '.emscripten'))
for shared in (False, True):
    target = output / ('localization-shared.mjs' if shared else 'localization.mjs')
    current = command + ['-o', str(target)]
    if shared:
        current += ['-pthread', '-sPTHREAD_POOL_SIZE=Module["workerCount"]||1',
                    '-sPTHREAD_POOL_SIZE_STRICT=2']
    subprocess.run(current, check=True, env=environment)
    source = target.read_text()
    marker = 'var getHeapMax=()=>2147483648;'
    assert source.count(marker) == 1
    target.write_text(source.replace(marker, 'var getHeapMax=()=>Module["maximumHeapBytes"]??2147483648;'))

# Relative, rebuildable source/resource provenance; no installation paths.
source_names=['vendor/ssg-full/localization.cpp','vendor/ssg-full/n4-binary-bitset.h','vendor/ssg-full/localization-parallel.h','vendor/ssg-full/nearest.h','vendor/pocketfft/pocketfft_hdronly.h','vendor/ssg-strict/localization.cpp']
resource_names=['localization.mjs','localization.wasm','localization-shared.mjs','localization-shared.wasm']
record={'schema':1,'compiler':'Emscripten4.0.15','definition':'Same independent SSG operators with exact binary+neutral n4 representation; original Float64 fallback retained, no threshold/SSIM/BFS change','buildScript':'scripts/build-ssg-strict.py','sources':{name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in source_names},'files':{name:{'bytes':(output/name).stat().st_size,'sha256':hashlib.sha256((output/name).read_bytes()).hexdigest()} for name in resource_names}}
(output/'PINNED.json').write_text(json.dumps(record,indent=2)+'\n')
