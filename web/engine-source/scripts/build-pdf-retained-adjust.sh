#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EMSDK:?Set EMSDK to Emscripten 4.0.15}"
source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1
export PDF_EFFECT_SOURCE_ROOT="${PDF_EFFECT_SOURCE_ROOT:-$PWD}"
export OPENCV_BUILD_ROOT="${OPENCV_BUILD_ROOT:-$PWD/.build}"
mkdir -p .build/pdf-retained-adjust vendor/pdf-retained-adjust
python3 - <<'PY'
from pathlib import Path
import os
s=(Path(os.environ['PDF_EFFECT_SOURCE_ROOT'])/'native/opencv.cpp').read_text();parts=[]
for first,last in [('static unsigned char trunc8(', 'static cv::Mat np8('),('static void hsvToBgr(', 'static cv::Mat floatHue('),('static cv::Mat lut(', 'static cv::Mat equalize('),('static cv::Mat hsv8Reference(', 'static cv::Mat color('),('static cv::Mat claheReference(', 'static cv::Mat sep32Fma(')]:
 parts.append(s[s.index(first):s.index(last,s.index(first))])
Path('.build/pdf-retained-adjust/adjust-reference.h').write_text('\n'.join(parts))
PY
em++ "$PDF_EFFECT_SOURCE_ROOT/native/adjust-bands.cpp" native/pdf-retained-adjust.cpp "$OPENCV_BUILD_ROOT/cv/lib/libopencv_imgproc.a" "$OPENCV_BUILD_ROOT/cv/lib/libopencv_core.a" \
 -I"$PDF_EFFECT_SOURCE_ROOT/native" -I.build/pdf-retained-adjust -I"$OPENCV_BUILD_ROOT/opencv-4.11.0/modules/core/include" -I"$OPENCV_BUILD_ROOT/opencv-4.11.0/modules/imgproc/include" -I"$OPENCV_BUILD_ROOT/cv" \
 -O3 -ffp-contract=off -fexceptions -ffile-prefix-map="$PWD/"= -fdebug-prefix-map="$PWD/"= -ffile-prefix-map="$PDF_EFFECT_SOURCE_ROOT/"= -fdebug-prefix-map="$PDF_EFFECT_SOURCE_ROOT/"= \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=0 \
 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=67108864 -sABORTING_MALLOC=0 -sFILESYSTEM=0 -sDISABLE_EXCEPTION_CATCHING=0 \
 -sEXPORTED_RUNTIME_METHODS='["HEAPU8"]' -sEXPORTED_FUNCTIONS='["_malloc","_free","_adjust_local_rows","_adjust_tile_histogram","_adjust_tables","_adjust_map_rows","_adjust_otsu","_pdf_adjust_blur_rows","_pdf_adjust_fine_prefix"]' -o vendor/pdf-retained-adjust/adjust.js
cp "$PDF_EFFECT_SOURCE_ROOT/vendor/adjust/LICENSE" vendor/pdf-retained-adjust/LICENSE
cp "$PDF_EFFECT_SOURCE_ROOT/vendor/adjust/LICENSE-MUSL.txt" vendor/pdf-retained-adjust/LICENSE-MUSL.txt
cp "$PDF_EFFECT_SOURCE_ROOT/vendor/adjust/NOTICE-OPENCV-LEGACY.txt" vendor/pdf-retained-adjust/NOTICE-OPENCV-LEGACY.txt
python3 - <<'PY'
from pathlib import Path
import os,hashlib,json
root=Path(os.environ['PDF_EFFECT_SOURCE_ROOT']);dep=Path(os.environ['OPENCV_BUILD_ROOT'])
def pin(path):
 p=Path(path);return dict(bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest())
inputs={n:pin(root/n)for n in ['native/adjust-bands.cpp','native/opencv.cpp','native/gamma-lut.h','native/hsv-tables.h']}
inputs.update({'.build/'+n:pin(dep/n)for n in ['cv/lib/libopencv_core.a','cv/lib/libopencv_imgproc.a']})
inputs['generated/adjust-reference.h']=pin('.build/pdf-retained-adjust/adjust-reference.h')
files={n:pin(n)for n in ['native/pdf-retained-adjust.cpp','scripts/build-pdf-retained-adjust.sh','vendor/pdf-retained-adjust/adjust.js','vendor/pdf-retained-adjust/adjust.wasm','vendor/pdf-retained-adjust/LICENSE','vendor/pdf-retained-adjust/LICENSE-MUSL.txt','vendor/pdf-retained-adjust/NOTICE-OPENCV-LEGACY.txt']}
Path('vendor/pdf-retained-adjust/PINNED.json').write_text(json.dumps(dict(schema=1,compiler='Emscripten4.0.15',reference='Unchanged qualified OpenCV4.11 adjustment primitives; canonical-coordinate HSV phase dispatch and retained native Gaussian neighborhood.',memory=dict(initialBytes=67108864,maximumBytes=67108864,growth=False),files=files,buildInputs=inputs),indent=2)+'\n')
PY
