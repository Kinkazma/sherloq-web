#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EMSDK:?Set EMSDK to Emscripten 4.0.15}"
source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1
# Read prebuilt OpenCV dependencies without writing into their shared checkout.
export OPENCV_BUILD_ROOT="${OPENCV_BUILD_ROOT:-$PWD/.build}"
# Reuse the pinned single-thread OpenCV and the existing explicit-FMA DFT object.
test -f "$OPENCV_BUILD_ROOT/dft-reference.o"
test -f "$OPENCV_BUILD_ROOT/cv/lib/libopencv_imgproc.a"
test -f "$OPENCV_BUILD_ROOT/cv/lib/libopencv_core.a"
mkdir -p vendor/contrast
em++ native/contrast-bands.cpp "$OPENCV_BUILD_ROOT/dft-reference.o" "$OPENCV_BUILD_ROOT/cv/lib/libopencv_imgproc.a" "$OPENCV_BUILD_ROOT/cv/lib/libopencv_core.a" \
 -I"$OPENCV_BUILD_ROOT/opencv-4.11.0/modules/core/include" -I"$OPENCV_BUILD_ROOT/opencv-4.11.0/modules/imgproc/include" -I"$OPENCV_BUILD_ROOT/cv" \
 -O3 -ffp-contract=off -fexceptions -ffile-prefix-map="$PWD/"= -fdebug-prefix-map="$PWD/"= \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=0 \
 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=67108864 -sABORTING_MALLOC=0 -sFILESYSTEM=0 -sDISABLE_EXCEPTION_CATCHING=0 \
 -sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAPF32"]' \
 -sEXPORTED_FUNCTIONS='["_malloc","_free","_contrast_rows","_contrast_cells"]' -o vendor/contrast/contrast.js
cp vendor/opencv/LICENSE vendor/contrast/LICENSE
cp vendor/quality/LICENSE vendor/contrast/LICENSE-MUSL.txt
python3 - <<'PY'
from pathlib import Path
import hashlib,json,os
dependency_root=Path(os.environ["OPENCV_BUILD_ROOT"])
def dependency(path):
 return dependency_root/path[7:] if path.startswith(".build/") and not path.startswith((".build/adjust/",".build/separation/")) else Path(path)
notices=[]
for file in ['modules/core/src/dxt.cpp','modules/imgproc/src/median_blur.dispatch.cpp']:
 text=((dependency_root/'opencv-4.11.0')/file).read_text();notices.append(file+'\n'+text[:text.index('#include')])
Path('vendor/contrast/NOTICE-OPENCV-LEGACY.txt').write_text('\n'.join(notices))
files=['vendor/contrast/NOTICE-OPENCV-LEGACY.txt','native/contrast-bands.cpp','native/contrast.h','native/contrast-window.h','scripts/build-contrast.sh','scripts/build-dft-reference.py','vendor/contrast/contrast.js','vendor/contrast/contrast.wasm']
record=dict(schema=1,compiler='Emscripten4.0.15',reference='OpenCV4.11 core/imgproc single-thread libraries; existing explicit-FMA DFT object',memory=dict(initialBytes=67108864,maximumBytes=67108864,growth=False),files={p:dict(bytes=Path(p).stat().st_size,sha256=hashlib.sha256(Path(p).read_bytes()).hexdigest()) for p in files},buildInputs={p:hashlib.sha256(dependency(p).read_bytes()).hexdigest() for p in ['.build/dft-reference.o','.build/cv/lib/libopencv_core.a','.build/cv/lib/libopencv_imgproc.a']})
Path('vendor/contrast/PINNED.json').write_text(json.dumps(record,indent=2)+'\n')
PY
