#!/bin/sh
# Rebuild the generic double/int32 OSQP projection kernel, from vendored source.
# Required: CMake >=3.18 and Emscripten4.0.15 in SHERLOQ_EMSCRIPTEN.
# Layout relative to project root:
# vendor/osqp-1.0.0, vendor/qdldl-v0.1.8, src/wasm/osqp_bridge.c,
# scripts/build-sherloq7c-osqp.sh. No download is required or permitted here.
set -eu
SHERLOQ_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
: "${SHERLOQ_EMSCRIPTEN:?Set SHERLOQ_EMSCRIPTEN to the Emscripten directory containing emcc and emcmake}"
SHERLOQ_BUILD=${SHERLOQ_OSQP_BUILD:-"$SHERLOQ_ROOT/.build/sherloq7c-osqp"}
"$SHERLOQ_EMSCRIPTEN/emcmake" cmake \
  -S "$SHERLOQ_ROOT/vendor/osqp-1.0.0" -B "$SHERLOQ_BUILD" \
  -DCMAKE_BUILD_TYPE=Release \
  -DFETCHCONTENT_SOURCE_DIR_QDLDL="$SHERLOQ_ROOT/vendor/qdldl-v0.1.8" \
  -DFETCHCONTENT_FULLY_DISCONNECTED=ON \
  -DOSQP_ALGEBRA_BACKEND=builtin -DOSQP_USE_FLOAT=OFF -DOSQP_USE_LONG=OFF \
  -DOSQP_BUILD_STATIC_LIB=ON -DOSQP_BUILD_SHARED_LIB=OFF \
  -DOSQP_BUILD_DEMO_EXE=OFF -DOSQP_BUILD_UNITTESTS=OFF -DOSQP_CODEGEN=OFF \
  -DOSQP_ENABLE_PRINTING=OFF -DOSQP_ENABLE_PROFILING=OFF \
  -DOSQP_ENABLE_INTERRUPT=OFF -DOSQP_ENABLE_DERIVATIVES=ON
cmake --build "$SHERLOQ_BUILD" --target osqpstatic --parallel "${SHERLOQ_BUILD_JOBS:-2}"
mkdir -p "$SHERLOQ_ROOT/src/wasm"
"$SHERLOQ_EMSCRIPTEN/emcc" "$SHERLOQ_ROOT/src/wasm/osqp_bridge.c" "$SHERLOQ_BUILD/out/libosqpstatic.a" \
  -I"$SHERLOQ_ROOT/vendor/osqp-1.0.0/include/public" -I"$SHERLOQ_BUILD/include/public" \
  -I"$SHERLOQ_BUILD/include/private" -I"$SHERLOQ_BUILD" \
  -O3 -fno-fast-math -Wl,--wrap=malloc,--wrap=calloc,--wrap=realloc \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 -sIMPORTED_MEMORY=1 \
  -sINITIAL_MEMORY=2097152 -sMAXIMUM_MEMORY=2147483648 -sSTACK_SIZE=262144 \
  -sABORTING_MALLOC=0 -sFILESYSTEM=0 -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAP32,HEAPF64 \
  -sEXPORTED_FUNCTIONS=_sh_osqp_malloc,_free,_sh_osqp_last_error,_sh_osqp_allocator_oom,_sh_osqp_memory_error_code,_sh_osqp_create,_sh_osqp_update_q,_sh_osqp_warm_start,_sh_osqp_solve,_sh_osqp_x,_sh_osqp_y,_sh_osqp_iterations,_sh_osqp_primal_residual,_sh_osqp_dual_residual,_sh_osqp_destroy \
  -o "$SHERLOQ_ROOT/src/wasm/osqp.mjs"
