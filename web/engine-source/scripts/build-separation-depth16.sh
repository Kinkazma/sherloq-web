#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EMSDK:?Set EMSDK to Emscripten 4.0.15}"
: "${OPENCV_BUILD_ROOT:?Set OPENCV_BUILD_ROOT to the qualified OpenCV 4.11 build}"
export SEPARATION_SOURCE_ROOT="${SEPARATION_SOURCE_ROOT:-$PWD}"
source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1
mkdir -p .build/separation-depth16 vendor/separation
python3 - <<'BUILD'
from pathlib import Path
import os
source=Path(os.environ['SEPARATION_SOURCE_ROOT'])/'native/opencv.cpp'
s=source.read_text();a=s.index('static cv::Mat bilateralReference(');b=s.index('static cv::Mat noise(',a)
Path('.build/separation-depth16/separation-bilateral.h').write_text(s[a:b])
BUILD
em++ native/separation.cpp "$OPENCV_BUILD_ROOT/cv/lib/libopencv_photo.a" "$OPENCV_BUILD_ROOT/cv/lib/libopencv_imgproc.a" "$OPENCV_BUILD_ROOT/cv/lib/libopencv_core.a" \
 -I.build/separation-depth16 -I"$SEPARATION_SOURCE_ROOT/native" -I"$OPENCV_BUILD_ROOT/opencv-4.11.0/modules/core/include" -I"$OPENCV_BUILD_ROOT/opencv-4.11.0/modules/imgproc/include" -I"$OPENCV_BUILD_ROOT/opencv-4.11.0/modules/photo/include" -I"$OPENCV_BUILD_ROOT/opencv-4.11.0/modules/photo/src" -I"$OPENCV_BUILD_ROOT/cv" \
 -O3 -ffp-contract=off -fexceptions -ffile-prefix-map="$PWD/"= -fdebug-prefix-map="$PWD/"= -ffile-prefix-map="$SEPARATION_SOURCE_ROOT/"= -fdebug-prefix-map="$SEPARATION_SOURCE_ROOT/"= -ffile-prefix-map="$OPENCV_BUILD_ROOT/"=.build/ -fdebug-prefix-map="$OPENCV_BUILD_ROOT/"=.build/ \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=67108864 -sABORTING_MALLOC=0 -sFILESYSTEM=0 -sDISABLE_EXCEPTION_CATCHING=0 \
 -sEXPORTED_RUNTIME_METHODS='["HEAPU8"]' -sEXPORTED_FUNCTIONS='["_malloc","_free","_separation_rows","_separation_rows16","_separation_rows16_ex","_adjust_prefix16_rows","_separation_nlm_rows","_separation_observed_rows","_separation_nlm_points"]' -o vendor/separation/separation-depth16.js
python3 - <<'BUILD'
from pathlib import Path
import hashlib,json,os
files=['native/separation.cpp','native/separation-native16.h','scripts/build-separation-depth16.sh','vendor/separation/separation-depth16.js','vendor/separation/separation-depth16.wasm']
reference=Path(os.environ['SEPARATION_SOURCE_ROOT']);cv=Path(os.environ['OPENCV_BUILD_ROOT'])
dependencies={'native/opencv.cpp':reference/'native/opencv.cpp','native/stereo-fma.h':reference/'native/stereo-fma.h',**{'.build/cv/lib/'+name:cv/'cv/lib'/name for name in ['libopencv_photo.a','libopencv_core.a','libopencv_imgproc.a']}}
def row(p):return dict(bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest())
record=dict(schema=1,compiler='Emscripten 4.0.15',reference='Existing OpenCV 4.11 libraries and unchanged byte exports; typed median and native-coded bilateral extension',memory=dict(initialBytes=67108864,maximumBytes=67108864,growth=False),files={n:row(Path(n)) for n in files},buildInputs={n:row(path) for n,path in dependencies.items()})
Path('vendor/separation/PINNED-DEPTH16.json').write_text(json.dumps(record,indent=2)+'\n')
BUILD
