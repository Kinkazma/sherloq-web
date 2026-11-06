#!/bin/sh
set -eu
task_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
task_emcc=${SHERLOQ_EMXX:-em++}
"$task_emcc" "$task_root/target-memory-edgecert-general.cpp" -O3 -std=c++17 -ffp-contract=off -msimd128 \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 \
 -sINITIAL_MEMORY=16777216 -sMAXIMUM_MEMORY=4294967296 -sIMPORTED_MEMORY=1 -sFILESYSTEM=0 \
 -sMEMORY_GROWTH_GEOMETRIC_STEP=0 \
 -sEXPORTED_FUNCTIONS='["_tm_create","_tm_destroy","_tm_prepare","_tm_begin","_tm_solve","_tm_seed","_tm_seed_band","_tm_array","_tm_value","_tm_info","_tm_pack_begin","_tm_pack_step","_tm_pack_info","_tm_project_prepare","_tm_project_band","_tm_project_relayout","_tm_project_trial_band","_tm_project_begin","_tm_project_step","_tm_project_check","_tm_project_value","_tm_project_info"]' \
 -sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAPU16","HEAPF64","HEAPF32"]' \
 -o "$task_root/target-memory-edgecert-general-kernel.mjs"

task_emcc_path=$(command -v "$task_emcc")
task_wasm_dis=${SHERLOQ_WASM_DIS:-"$(dirname -- "$task_emcc_path")/../bin/wasm-dis"}
python3 "$task_root/target-memory-edgecert-general-proof.py" --wasm-dis "$task_wasm_dis"
