#!/bin/sh
set -eu
task_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
task_emcc=${SHERLOQ_EMXX:-em++}
"$task_emcc" "$task_root/native/sherloq7c-graph.cpp" -O3 -std=c++17 -ffp-contract=off -fexceptions -msimd128 \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 \
 -sINITIAL_MEMORY=16777216 -sMAXIMUM_MEMORY=2147483648 -sIMPORTED_MEMORY=1 -sFILESYSTEM=0 \
 -sEXPORTED_FUNCTIONS='["_malloc","_free","_graph_create","_graph_destroy","_graph_step","_graph_info","_graph_array"]' \
 -sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAPU16","HEAPU32","HEAPF64"]' \
 -o "$task_root/src/graph-kernel.mjs"
