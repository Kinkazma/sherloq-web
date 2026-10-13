"""Rebuild the pinned production LUT from its exported source (Emscripten 6.0.11)."""
from pathlib import Path
import os,subprocess
here=Path(__file__).resolve().parent
compiler=os.environ.get('EMXX','em++')
subprocess.run([compiler,'table-simd4-exact-subnormal-tiled.cpp','-std=c++17','-O3','-ffp-contract=off','-fno-vectorize','-fno-slp-vectorize','-msimd128','-Wl,--threads=1','-I.','-ffile-prefix-map='+str(here)+'/=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=536870912','-sMEMORY_GROWTH_LINEAR_STEP=16777216','-sEXPORTED_FUNCTIONS=["_malloc","_free","_d2prl_evaluate_tile","_d2prl_bilinear_decode4"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]','-o','table-simd4-exact-subnormal.js'],cwd=here,check=True)
