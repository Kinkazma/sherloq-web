#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EMSDK:?Set EMSDK to Emscripten 4.0.15}"
source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1
# Read prebuilt OpenCV dependencies without writing into their shared checkout.
export OPENCV_BUILD_ROOT="${OPENCV_BUILD_ROOT:-$PWD/.build}"
mkdir -p .build/adjust vendor/adjust
python3 - <<'PY'
from pathlib import Path
s=Path('native/opencv.cpp').read_text();parts=[]
for first,last in [('static unsigned char trunc8(', 'static cv::Mat np8('),('static void hsvToBgr(', 'static cv::Mat floatHue('),('static cv::Mat lut(', 'static cv::Mat equalize('),('static cv::Mat hsv8Reference(', 'static cv::Mat color('),('static cv::Mat claheReference(', 'static cv::Mat sep32Fma(')]:
 parts.append(s[s.index(first):s.index(last,s.index(first))])
Path('.build/adjust/adjust-reference.h').write_text('\n'.join(parts))
PY
em++ native/adjust-bands.cpp "$OPENCV_BUILD_ROOT/cv/lib/libopencv_imgproc.a" "$OPENCV_BUILD_ROOT/cv/lib/libopencv_core.a" \
 -Inative -I.build/adjust -I"$OPENCV_BUILD_ROOT/opencv-4.11.0/modules/core/include" -I"$OPENCV_BUILD_ROOT/opencv-4.11.0/modules/imgproc/include" -I"$OPENCV_BUILD_ROOT/cv" \
 -O3 -ffp-contract=off -fexceptions -ffile-prefix-map="$PWD/"= -fdebug-prefix-map="$PWD/"= \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=0 \
 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=67108864 -sABORTING_MALLOC=0 -sFILESYSTEM=0 -sDISABLE_EXCEPTION_CATCHING=0 \
 -sEXPORTED_RUNTIME_METHODS='["HEAPU8"]' -sEXPORTED_FUNCTIONS='["_malloc","_free","_adjust_local_rows","_adjust_tile_histogram","_adjust_tables","_adjust_map_rows","_adjust_otsu"]' -o vendor/adjust/adjust.js
cp vendor/opencv/LICENSE vendor/adjust/LICENSE
cp vendor/quality/LICENSE vendor/adjust/LICENSE-MUSL.txt
python3 - <<'PY'
from pathlib import Path
import hashlib,json,os
dependency_root=Path(os.environ["OPENCV_BUILD_ROOT"])
def dependency(path):
 return dependency_root/path[7:] if path.startswith(".build/") and not path.startswith((".build/adjust/",".build/separation/")) else Path(path)
notices=[]
for file in ['modules/imgproc/src/clahe.cpp','modules/imgproc/src/thresh.cpp']:
 s=((dependency_root/'opencv-4.11.0')/file).read_text();notices.append(file+'\n'+s[:s.index('#include')].rstrip())
Path('vendor/adjust/NOTICE-OPENCV-LEGACY.txt').write_text('\n\n'.join(notices)+'\n')
files=['native/adjust-bands.cpp','native/opencv.cpp','native/gamma-lut.h','native/hsv-tables.h','scripts/build-adjust-bands.sh','vendor/adjust/adjust.js','vendor/adjust/adjust.wasm','vendor/adjust/NOTICE-OPENCV-LEGACY.txt']
inputs=['.build/adjust/adjust-reference.h','.build/cv/lib/libopencv_core.a','.build/cv/lib/libopencv_imgproc.a']
record=dict(schema=1,compiler='Emscripten4.0.15',reference='OpenCV4.11 core/imgproc, existing qualified adjustment/HSV/CLAHE arithmetic, original Otsu histogram order',memory=dict(initialBytes=67108864,maximumBytes=67108864,growth=False),files={p:dict(bytes=Path(p).stat().st_size,sha256=hashlib.sha256(Path(p).read_bytes()).hexdigest()) for p in files},buildInputs={p:hashlib.sha256(dependency(p).read_bytes()).hexdigest() for p in inputs})
Path('vendor/adjust/PINNED.json').write_text(json.dumps(record,indent=2)+'\n')
PY
