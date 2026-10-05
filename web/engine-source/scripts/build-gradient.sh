#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EMSDK:?Set EMSDK to Emscripten 4.0.15}"
source "$EMSDK/emsdk_env.sh" >/dev/null
gradient_output="${GRADIENT_OUTPUT_DIR:-vendor/gradient}"
gradient_flags="${GRADIENT_OPTIMIZATIONS:-3}"
case "$gradient_flags" in [0-7]) ;; *) exit 2 ;; esac
mkdir -p "$gradient_output"
em++ native/gradient.cpp -DGRADIENT_OPTIMIZATIONS="$gradient_flags" -O3 -ffp-contract=off -fexceptions \
 -ffile-prefix-map="$PWD/"= -fdebug-prefix-map="$PWD/"= \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node \
 -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=67108864 \
 -sABORTING_MALLOC=0 -sFILESYSTEM=0 -sDISABLE_EXCEPTION_CATCHING=0 \
 -sEXPORTED_FUNCTIONS='["_malloc","_free","_gradient_derivatives","_gradient_lengths","_gradient_render","_gradient_lut"]' \
 -sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAP16","HEAPU32","HEAPF64"]' -o "$gradient_output/gradient.js"
cp "$EMSDK/upstream/emscripten/system/lib/libc/musl/COPYRIGHT" "$gradient_output/LICENSE"
python3 - "$gradient_output" "$gradient_flags" <<'PY'
from pathlib import Path
import hashlib,json,sys
output=Path(sys.argv[1]);flags=int(sys.argv[2])
files=['native/gradient.cpp','scripts/build-gradient.sh',str(output/'gradient.js'),str(output/'gradient.wasm'),'vendor/quality/musl-fma.c']
record=dict(schema=1,compiler='Emscripten 4.0.15',optimizations=flags,arithmetic='-O3 -ffp-contract=off; explicit musl std::fma for native float64 normalization',memory=dict(initialBytes=67108864,maximumBytes=67108864,growth=False),files={p:dict(bytes=Path(p).stat().st_size,sha256=hashlib.sha256(Path(p).read_bytes()).hexdigest()) for p in files})
(output/'PINNED.json').write_text(json.dumps(record,indent=2)+'\n')
PY
