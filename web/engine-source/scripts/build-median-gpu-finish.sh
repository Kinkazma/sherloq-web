#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EMSDK:?Set EMSDK to Emscripten4.0.15}"
: "${OPENCV_BUILD_ROOT:?Set OPENCV_BUILD_ROOT to pinned OpenCV4.11 build}"
source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1
mkdir -p vendor/median-gpu-finish
em++ native/median-gpu-finish.cpp "$OPENCV_BUILD_ROOT/cv/lib/libopencv_core.a" \
 -I"$OPENCV_BUILD_ROOT/opencv-4.11.0/modules/core/include" -I"$OPENCV_BUILD_ROOT/cv" \
 -O3 -ffp-contract=off -fexceptions -ffile-prefix-map="$PWD/"= -fdebug-prefix-map="$PWD/"= -ffile-prefix-map="$OPENCV_BUILD_ROOT/"=.build/ -fdebug-prefix-map="$OPENCV_BUILD_ROOT/"=.build/ \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=16777216 -sMAXIMUM_MEMORY=16777216 -sSTACK_SIZE=1048576 -sABORTING_MALLOC=0 -sFILESYSTEM=0 -sDISABLE_EXCEPTION_CATCHING=0 \
 -sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAPU32","HEAPF64"]' -sEXPORTED_FUNCTIONS='["_malloc","_free","_median_gpu_finish"]' -o vendor/median-gpu-finish/finish.js
reference="${MEDIAN_REFERENCE_ROOT:-$PWD/vendor/separation}"
for file in LICENSE LICENSE-MUSL.txt NOTICE-OPENCV-LEGACY.txt;do cp "$reference/$file" "vendor/median-gpu-finish/$file";done
python3 - <<'PIN'
from pathlib import Path
import hashlib,json
files=['native/median-gpu-finish.cpp','scripts/build-median-gpu-finish.sh']+['vendor/median-gpu-finish/'+x for x in ['finish.js','finish.wasm','LICENSE','LICENSE-MUSL.txt','NOTICE-OPENCV-LEGACY.txt']]
Path('vendor/median-gpu-finish/PINNED.json').write_text(json.dumps({'schema':1,'compiler':'Emscripten4.0.15','method':'Original median-filter feature equations; OpenCV4.11 binary64 divide/mean; GPU maps supplied exact binary64. Classifier unchanged.','memory':{'bytes':16777216,'growth':False},'files':{p:{'bytes':Path(p).stat().st_size,'sha256':hashlib.sha256(Path(p).read_bytes()).hexdigest()} for p in files}},indent=2)+'\n')
PIN
