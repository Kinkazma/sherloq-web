#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EMSDK:?Set EMSDK to Emscripten 4.0.15}"
source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1
em++ --version | head -n1 | grep -q '4.0.15' || { echo 'Expected Emscripten 4.0.15' >&2; exit 1; }
mkdir -p vendor/quality
em++ native/quality-normalize.cpp -O3 -ffp-contract=off -ffile-prefix-map="$PWD/"= -fdebug-prefix-map="$PWD/"= \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sFILESYSTEM=0 \
 -sINITIAL_MEMORY=131072 -sSTACK_SIZE=16384 -sALLOW_MEMORY_GROWTH=0 \
 -sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAPF64"]' \
 -sEXPORTED_FUNCTIONS='["_malloc","_free","_quality_normalize"]' \
 -o vendor/quality/quality.js
cp "$EMSDK/upstream/emscripten/system/lib/libc/musl/COPYRIGHT" vendor/quality/LICENSE
cp "$EMSDK/upstream/emscripten/system/lib/libc/musl/src/math/fma.c" vendor/quality/musl-fma.c
