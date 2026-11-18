#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EMSDK:?Set EMSDK to Emscripten 4.0.15}"
: "${OPENCV_BUILD_ROOT:?Set OPENCV_BUILD_ROOT to the qualified OpenCV 4.11 build}"
source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1
mkdir -p vendor/separation-gpu-prepare
em++ native/separation-gpu-prepare.cpp "$OPENCV_BUILD_ROOT/cv/lib/libopencv_imgproc.a" "$OPENCV_BUILD_ROOT/cv/lib/libopencv_core.a" \
 -I"$OPENCV_BUILD_ROOT/opencv-4.11.0/modules/core/include" -I"$OPENCV_BUILD_ROOT/opencv-4.11.0/modules/imgproc/include" -I"$OPENCV_BUILD_ROOT/opencv-4.11.0/modules/photo/src" -I"$OPENCV_BUILD_ROOT/cv" \
 -O3 -ffp-contract=off -fexceptions -ffile-prefix-map="$PWD/"= -fdebug-prefix-map="$PWD/"= -ffile-prefix-map="$OPENCV_BUILD_ROOT/"=.build/ -fdebug-prefix-map="$OPENCV_BUILD_ROOT/"=.build/ \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=67108864 -sABORTING_MALLOC=0 -sFILESYSTEM=0 -sDISABLE_EXCEPTION_CATCHING=0 \
 -sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAPU32","HEAPF32","HEAPF64"]' -sEXPORTED_FUNCTIONS='["_malloc","_free","_separation_gpu_pack","_separation_gpu_unpack","_separation_gpu_gaussian","_separation_gpu_bilateral","_separation_gpu_bilateral16","_separation_gpu_nlm_weights","_separation_gpu_correct_bilateral","_separation_gpu_correct_bilateral16"]' -o vendor/separation-gpu-prepare/prepare-depth16.js
python3 - <<'BUILD'
from pathlib import Path
import hashlib,json
files=['native/separation-gpu-prepare.cpp','native/separation-native16.h','scripts/build-separation-gpu-prepare-depth16.sh','vendor/separation-gpu-prepare/prepare-depth16.js','vendor/separation-gpu-prepare/prepare-depth16.wasm']
record=dict(schema=1,compiler='Emscripten 4.0.15',reference='Unchanged native preparation exports plus native16 bilateral table and marked-centre repairs sharing the CPU typed arithmetic',memory=dict(initialBytes=67108864,maximumBytes=67108864,growth=False),files={n:dict(bytes=Path(n).stat().st_size,sha256=hashlib.sha256(Path(n).read_bytes()).hexdigest()) for n in files})
Path('vendor/separation-gpu-prepare/PINNED-DEPTH16.json').write_text(json.dumps(record,indent=2)+'\n')
BUILD
