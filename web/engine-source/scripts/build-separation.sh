#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EMSDK:?Set EMSDK to Emscripten 4.0.15}"
source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1
# Read prebuilt OpenCV dependencies without writing into their shared checkout.
export OPENCV_BUILD_ROOT="${OPENCV_BUILD_ROOT:-$PWD/.build}"
mkdir -p .build/separation vendor/separation
# Extract the already qualified native arithmetic, never a platform-brand branch.
python3 - <<'PY'
from pathlib import Path
s=Path('native/opencv.cpp').read_text();start=s.index('static cv::Mat bilateralReference(');end=s.index('static cv::Mat noise(',start)
Path('.build/separation/separation-bilateral.h').write_text(s[start:end])
PY
em++ native/separation.cpp "$OPENCV_BUILD_ROOT/cv/lib/libopencv_photo.a" "$OPENCV_BUILD_ROOT/cv/lib/libopencv_imgproc.a" "$OPENCV_BUILD_ROOT/cv/lib/libopencv_core.a" \
 -I.build/separation -I"$OPENCV_BUILD_ROOT/opencv-4.11.0/modules/core/include" -I"$OPENCV_BUILD_ROOT/opencv-4.11.0/modules/imgproc/include" -I"$OPENCV_BUILD_ROOT/opencv-4.11.0/modules/photo/include" -I"$OPENCV_BUILD_ROOT/cv" \
 -O3 -ffp-contract=off -fexceptions -ffile-prefix-map="$PWD/"= -fdebug-prefix-map="$PWD/"= \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=0 \
 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=67108864 -sABORTING_MALLOC=0 -sFILESYSTEM=0 -sDISABLE_EXCEPTION_CATCHING=0 \
 -sEXPORTED_RUNTIME_METHODS='["HEAPU8"]' -sEXPORTED_FUNCTIONS='["_malloc","_free","_separation_rows"]' -o vendor/separation/separation.js
cp vendor/opencv/LICENSE vendor/separation/LICENSE
cp vendor/quality/LICENSE vendor/separation/LICENSE-MUSL.txt
python3 - <<'PY'
from pathlib import Path
import hashlib,json,os
dependency_root=Path(os.environ["OPENCV_BUILD_ROOT"])
def dependency(path):
 return dependency_root/path[7:] if path.startswith(".build/") and not path.startswith((".build/adjust/",".build/separation/")) else Path(path)
notices=[]
for file in ['modules/photo/src/denoising.cpp','modules/photo/src/fast_nlmeans_denoising_invoker.hpp','modules/imgproc/src/median_blur.dispatch.cpp']:
 text=((dependency_root/'opencv-4.11.0')/file).read_text();end=text.find('#include');end=end if end>=0 else text.find('#ifndef');notices.append(file+'\n'+text[:end].rstrip())
Path('vendor/separation/NOTICE-OPENCV-LEGACY.txt').write_text('\n\n'.join(notices)+'\n')
files=['native/separation.cpp','native/opencv.cpp','scripts/build-separation.sh','vendor/separation/separation.js','vendor/separation/separation.wasm','vendor/separation/NOTICE-OPENCV-LEGACY.txt']
inputs=['.build/separation/separation-bilateral.h','.build/cv/lib/libopencv_photo.a','.build/cv/lib/libopencv_core.a','.build/cv/lib/libopencv_imgproc.a']
record=dict(schema=1,compiler='Emscripten4.0.15',reference='OpenCV4.11 core/imgproc/photo single-thread libraries and existing qualified bilateral arithmetic',memory=dict(initialBytes=67108864,maximumBytes=67108864,growth=False),files={p:dict(bytes=Path(p).stat().st_size,sha256=hashlib.sha256(Path(p).read_bytes()).hexdigest()) for p in files},buildInputs={p:hashlib.sha256(dependency(p).read_bytes()).hexdigest() for p in inputs})
Path('vendor/separation/PINNED.json').write_text(json.dumps(record,indent=2)+'\n')
PY
