#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EMSDK:?Set EMSDK to an Emscripten 4.0.15 SDK directory}"
source "$EMSDK/emsdk_env.sh" >/dev/null
mkdir -p .build vendor/libjpeg
if [ ! -f .build/libjpeg-turbo-3.0.3.tar.gz ]; then
 curl -fsSL https://github.com/libjpeg-turbo/libjpeg-turbo/archive/refs/tags/3.0.3.tar.gz -o .build/libjpeg-turbo-3.0.3.tar.gz
fi
printf '%s  %s\n' 'a649205a90e39a548863a3614a9576a3fb4465f8e8e66d54999f127957c25b21' '.build/libjpeg-turbo-3.0.3.tar.gz' > .build/expected-source.sha256
shasum -a 256 -c .build/expected-source.sha256
tar -xzf .build/libjpeg-turbo-3.0.3.tar.gz -C .build
emcmake cmake -S .build/libjpeg-turbo-3.0.3 -B .build/jpeg -DENABLE_SHARED=OFF -DENABLE_STATIC=ON -DWITH_TURBOJPEG=OFF -DWITH_SIMD=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build .build/jpeg --target jpeg-static -j 2
emcc native/jpeg.c .build/jpeg/libjpeg.a -I .build/libjpeg-turbo-3.0.3 -I .build/jpeg -O3 -ffp-contract=off -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=16777216 -sMAXIMUM_MEMORY=536870912 -sFILESYSTEM=0 -sEXPORTED_FUNCTIONS='["_malloc","_free","_jpeg_decode","_jpeg_rows_open","_jpeg_rows_read","_jpeg_rows_finish","_jpeg_rows_close","_jpeg_rows_error","_jpeg_recompress","_jpeg_recompress_444","_jpeg_recompress_gray","_jpeg_dct_histograms","_jpeg_gaussian_histogram"]' -sEXPORTED_RUNTIME_METHODS='["HEAPU8"]' -o vendor/libjpeg/jpeg.js
cp .build/libjpeg-turbo-3.0.3/{LICENSE.md,README.ijg} vendor/libjpeg/
shasum -a 256 .build/libjpeg-turbo-3.0.3.tar.gz vendor/libjpeg/jpeg.{js,wasm}
