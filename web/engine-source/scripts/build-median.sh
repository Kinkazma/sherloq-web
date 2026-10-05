#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EMSDK:?Set EMSDK to Emscripten 4.0.15}"
source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1
# Reuse the pinned OpenCV core/imgproc build; build-opencv.sh creates it.
# A separate small heap avoids retaining another full-image codec per worker.
test -f .build/cv/lib/libopencv_core.a
test -f .build/cv/lib/libopencv_imgproc.a
mkdir -p vendor/median
em++ native/median-features.cpp .build/cv/lib/libopencv_imgproc.a .build/cv/lib/libopencv_core.a \
 -I.build/opencv-4.11.0/modules/core/include -I.build/opencv-4.11.0/modules/imgproc/include -I.build/cv \
 -O3 -ffp-contract=off -fexceptions -ffile-prefix-map="$PWD/"= -fdebug-prefix-map="$PWD/"= \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 \
 -sINITIAL_MEMORY=16777216 -sMAXIMUM_MEMORY=16777216 -sSTACK_SIZE=1048576 \
 -sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAPF64"]' \
 -sEXPORTED_FUNCTIONS='["_malloc","_free","_median_features"]' \
 -o vendor/median/median.js
cp vendor/opencv/LICENSE vendor/median/LICENSE
