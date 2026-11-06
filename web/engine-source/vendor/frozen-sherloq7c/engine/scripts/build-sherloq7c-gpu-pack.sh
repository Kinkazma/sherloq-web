#!/bin/sh
set -eu
task_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
task_emcc=${SHERLOQ_EMXX:-em++}
"$task_emcc" "$task_root/native/sherloq7c-gpu-pack.cpp" -O3 -std=c++17 -ffp-contract=off -fexceptions -msimd128 \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 \
 -sINITIAL_MEMORY=16777216 -sMAXIMUM_MEMORY=2147483648 -sIMPORTED_MEMORY=1 -sFILESYSTEM=0 \
 -sMEMORY_GROWTH_GEOMETRIC_STEP=0 \
 -sEXPORTED_FUNCTIONS='["_malloc","_free","_gpu_pack_create","_gpu_pack_step","_gpu_pack_info","_gpu_pack_destroy"]' \
 -sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAPF64"]' \
 -o "$task_root/src/gpu-pack-kernel.mjs"
