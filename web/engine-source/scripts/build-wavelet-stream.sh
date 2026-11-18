#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EMSDK:?Set EMSDK to Emscripten 4.0.15}"
wavelet_cache=${EM_CACHE:-"$PWD/.build/em-cache-m4"}
source "$EMSDK/emsdk_env.sh" >/dev/null
export EM_CACHE="$wavelet_cache"
mkdir -p vendor/wavelet-stream
src=${PYWT_C_SOURCE:-.build/wavelet-stream/pywt-1.5.0/pywt/_extensions/c}
if test -z "${PYWT_C_SOURCE:-}"; then
 archive=${PYWT_ARCHIVE:-.build/pywt-1.5.0.tar.gz}
 test "$(shasum -a256 "$archive" | cut -d' ' -f1)" = 5aedfa9bd629f104a04fda88b92582bda38ab22282ce5048b5760b5d18e83fc9
 if ! test -f "$src/wt.h"; then
  mkdir -p .build/wavelet-stream
  tar -xzf "$archive" -C .build/wavelet-stream
 fi
fi
objects=${PYWT_OBJECTS_DIR:-.build/wavelet-stream/objects}
if test -z "${PYWT_OBJECTS_DIR:-}"; then
 mkdir -p "$objects"
 for name in common convolution wavelets wt; do
  emcc "$src/$name.c" -c -O3 -ffp-contract=off -ffile-prefix-map="$PWD/"= -o "$objects/$name.o"
 done
fi
for name in common convolution wavelets wt; do test -f "$objects/$name.o"; done
em++ native/wavelet-stream.cpp "$objects/common.o" "$objects/convolution.o" "$objects/wavelets.o" "$objects/wt.o" -I "$src" -O3 -fexceptions -ffp-contract=off \
 -ffile-prefix-map="$PWD/"= -sDISABLE_EXCEPTION_CATCHING=0 \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 \
 -sINITIAL_MEMORY=8388608 -sMAXIMUM_MEMORY=134217728 -sMEMORY_GROWTH_LINEAR_STEP=4194304 -sABORTING_MALLOC=0 -sFILESYSTEM=0 \
 -sEXPORTED_FUNCTIONS='["_malloc","_free","_wavelet_stream_info","_wavelet_stream_down","_wavelet_stream_up","_wavelet_stream_up_threshold","_wavelet_stream_final_pixels","_wavelet_stream_threshold","_wavelet_noise","_wavelet_stream_normalize","_wavelet_stream_affine","_wavelet_stream_detail","_wavelet_data","_wavelet_size","_wavelet_release"]' \
 -sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAPF64"]' -o vendor/wavelet-stream/wavelet-stream.js
cp "$src/../../../LICENSE" vendor/wavelet-stream/LICENSE
