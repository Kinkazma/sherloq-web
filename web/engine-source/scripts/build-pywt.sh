#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EMSDK:?Set EMSDK to Emscripten 4.0.15}"
source "$EMSDK/emsdk_env.sh" >/dev/null
mkdir -p .build/pywt-objects vendor/pywt
archive=.build/pywt-1.5.0.tar.gz
if [ ! -f "$archive" ]; then curl -fsSL https://github.com/PyWavelets/pywt/archive/refs/tags/v1.5.0.tar.gz -o "$archive"; fi
printf '%s  %s\n' '5aedfa9bd629f104a04fda88b92582bda38ab22282ce5048b5760b5d18e83fc9' "$archive" > .build/pywt-source.sha256
shasum -a 256 -c .build/pywt-source.sha256
if [ ! -d .build/pywt-1.5.0/pywt ]; then tar -xzf "$archive" -C .build; fi
src=.build/pywt-1.5.0/pywt/_extensions/c
for name in common convolution wavelets wt; do
 emcc "$src/$name.c" -c -O3 -ffp-contract=off -ffile-prefix-map="$PWD/"= -fdebug-prefix-map="$PWD/"= -o ".build/pywt-objects/$name.o"
done
em++ native/wavelets.cpp .build/pywt-objects/*.o -I "$src" -O3 -fexceptions -ffp-contract=off \
 -ffile-prefix-map="$PWD/"= -fdebug-prefix-map="$PWD/"= -sDISABLE_EXCEPTION_CATCHING=0 \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 \
 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=2147483648 -sFILESYSTEM=0 \
 -sEXPORTED_FUNCTIONS='["_malloc","_free","_wavelet_run","_wavelet_detail","_wavelet_noise","_wavelet_prepare","_wavelet_reconstruct","_wavelet_data","_wavelet_size","_wavelet_release"]' \
 -sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAPF64"]' -o vendor/pywt/pywt.js
cp .build/pywt-1.5.0/LICENSE vendor/pywt/LICENSE
