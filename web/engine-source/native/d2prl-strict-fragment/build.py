"""Build code-only strict-fragment transport; learned weights are unchanged."""
from pathlib import Path
import os
import subprocess

here = Path(__file__).resolve().parent
target = here.parents[1] / 'vendor' / 'd2prl-strict-fragment'
target.mkdir(parents=True, exist_ok=True)
include = os.environ.get('D2PRL_NATIVE_INCLUDE', str(here.parent / 'd2prl-half-round-table'))
subprocess.run([
    os.environ.get('EMXX', 'em++'), 'evaluator.cpp', '-std=c++17', '-O3',
    '-ffp-contract=off', '-fno-vectorize', '-fno-slp-vectorize', '-msimd128',
    '-Wl,--threads=1', '-I' + include, '-ffile-prefix-map=' + str(here) + '/=',
    '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sENVIRONMENT=web,worker,node',
    '-sFILESYSTEM=0', '-sALLOW_MEMORY_GROWTH=1', '-sINITIAL_MEMORY=16777216',
    '-sMAXIMUM_MEMORY=536870912', '-sMEMORY_GROWTH_LINEAR_STEP=16777216',
    '-sEXPORTED_FUNCTIONS=["_malloc","_free","_d2prl_evaluate_tile","_d2prl_strict_supports","_d2prl_strict_packed_tile","_d2prl_strict_hybrid_tile","_d2prl_strict_resident_tile"]',
    '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32","HEAP32","HEAPU16"]',
    '-o', str(target / 'evaluator.js'),
], cwd=here, check=True)
