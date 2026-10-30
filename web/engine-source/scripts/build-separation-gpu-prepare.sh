#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EMSDK:?Set EMSDK to Emscripten4.0.15}"
: "${OPENCV_BUILD_ROOT:?Set OPENCV_BUILD_ROOT to the qualified OpenCV4.11 build}"
source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1
mkdir -p vendor/separation-gpu-prepare
em++ native/separation-gpu-prepare.cpp "$OPENCV_BUILD_ROOT/cv/lib/libopencv_imgproc.a" "$OPENCV_BUILD_ROOT/cv/lib/libopencv_core.a" \
 -I"$OPENCV_BUILD_ROOT/opencv-4.11.0/modules/core/include" -I"$OPENCV_BUILD_ROOT/opencv-4.11.0/modules/imgproc/include" -I"$OPENCV_BUILD_ROOT/opencv-4.11.0/modules/photo/src" -I"$OPENCV_BUILD_ROOT/cv" \
 -O3 -ffp-contract=off -fexceptions -ffile-prefix-map="$PWD/"= -fdebug-prefix-map="$PWD/"= -ffile-prefix-map="$OPENCV_BUILD_ROOT/"=.build/ -fdebug-prefix-map="$OPENCV_BUILD_ROOT/"=.build/ \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=67108864 -sABORTING_MALLOC=0 -sFILESYSTEM=0 -sDISABLE_EXCEPTION_CATCHING=0 \
 -sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAPU32","HEAPF32","HEAPF64"]' -sEXPORTED_FUNCTIONS='["_malloc","_free","_separation_gpu_pack","_separation_gpu_unpack","_separation_gpu_gaussian","_separation_gpu_bilateral","_separation_gpu_nlm_weights","_separation_gpu_correct_bilateral"]' -o vendor/separation-gpu-prepare/prepare.js
reference="${SEPARATION_REFERENCE_ROOT:-$PWD/vendor/separation}"
for file in LICENSE LICENSE-MUSL.txt NOTICE-OPENCV-LEGACY.txt; do cp "$reference/$file" "vendor/separation-gpu-prepare/$file"; done
python3 - <<'PY'
from pathlib import Path
import json,hashlib
files=['native/separation-gpu-prepare.cpp','scripts/build-separation-gpu-prepare.sh']+['vendor/separation-gpu-prepare/'+n for n in ['prepare.js','prepare.wasm','LICENSE','LICENSE-MUSL.txt','NOTICE-OPENCV-LEGACY.txt']]
Path('vendor/separation-gpu-prepare/PINNED.json').write_text(json.dumps({'schema':1,'compiler':'Emscripten4.0.15','reference':'Pinned OpenCV4.11 colour conversions, Gaussian kernel and quantized NLM weights; no learned or oracle input/output tables. Native ordered f32 bilateral precision repairs.','memory':{'initialBytes':67108864,'growth':False},'files':{n:{'bytes':Path(n).stat().st_size,'sha256':hashlib.sha256(Path(n).read_bytes()).hexdigest()} for n in files}},indent=2)+'\n')
PY
