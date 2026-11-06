#!/bin/sh
set -eu
task_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
task_emcc=${SHERLOQ_EMXX:-em++}
"$task_emcc" "$task_root/native/sherloq7c-target.cpp" -O3 -std=c++17 -ffp-contract=off -fexceptions -msimd128 \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 \
 -sINITIAL_MEMORY=16777216 -sMAXIMUM_MEMORY=2147483648 -sIMPORTED_MEMORY=1 -sFILESYSTEM=0 \
 -sEXPORTED_FUNCTIONS='["_malloc","_free","_target_create","_target_destroy","_target_preconditioner","_target_forcing","_target_precision","_target_certified_steps","_target_init","_target_values","_target_info","_target_try_initial","_target_gradient","_target_factor","_target_cg_begin","_target_cg_batch","_target_accept"]' \
 -sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAPU32","HEAPF64"]' \
 -o "$task_root/src/target-kernel.mjs"
