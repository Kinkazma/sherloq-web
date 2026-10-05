#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EMSDK:?Set EMSDK to Emscripten 4.0.15}"
source "$EMSDK/emsdk_env.sh" >/dev/null
emcc native/jpeg.c .build/jpeg/libjpeg.a -I .build/libjpeg-turbo-3.0.3 -I .build/jpeg -O3 -ffp-contract=off -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=16777216 -sMAXIMUM_MEMORY=536870912 -sFILESYSTEM=0 -sEXPORTED_FUNCTIONS='["_malloc","_free","_jpeg_decode","_jpeg_recompress","_jpeg_recompress_444","_jpeg_recompress_gray","_jpeg_dct_histograms","_jpeg_gaussian_histogram"]' -sEXPORTED_RUNTIME_METHODS='["HEAPU8"]' -o vendor/libjpeg/jpeg.js
