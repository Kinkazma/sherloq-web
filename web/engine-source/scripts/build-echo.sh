#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EMSDK:?Set EMSDK to Emscripten 4.0.15}"
source "$EMSDK/emsdk_env.sh" >/dev/null
echo_output="${ECHO_OUTPUT_DIR:-vendor/echo}"
echo_flags="${ECHO_OPTIMIZATIONS:-5}"
case "$echo_flags" in [0-7]) ;; *) exit 2 ;; esac
mkdir -p "$echo_output"
em++ native/echo.cpp -DECHO_OPTIMIZATIONS="$echo_flags" -O3 -ffp-contract=off -fexceptions \
 -ffile-prefix-map="$PWD/"= -fdebug-prefix-map="$PWD/"= \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node \
 -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=67108864 \
 -sABORTING_MALLOC=0 -sFILESYSTEM=0 -sDISABLE_EXCEPTION_CATCHING=0 \
 -sEXPORTED_FUNCTIONS='["_malloc","_free","_echo_derivatives","_echo_render"]' \
 -sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAPF32","HEAPF64"]' -o "$echo_output/echo.js"
cp "$EMSDK/upstream/emscripten/system/lib/libc/musl/COPYRIGHT" "$echo_output/LICENSE"
python3 - "$echo_output" "$echo_flags" <<'PY'
from pathlib import Path
import hashlib,json,sys
output=Path(sys.argv[1]);flags=int(sys.argv[2])
files=['native/echo.cpp','scripts/build-echo.sh',str(output/'echo.js'),str(output/'echo.wasm'),'vendor/quality/musl-fma.c']
record=dict(schema=1,compiler='Emscripten 4.0.15',optimizations=flags,arithmetic='-O3 -ffp-contract=off; explicit native float32/float64 fma order',memory=dict(initialBytes=67108864,maximumBytes=67108864,growth=False),files={p:dict(bytes=Path(p).stat().st_size,sha256=hashlib.sha256(Path(p).read_bytes()).hexdigest()) for p in files})
(output/'PINNED.json').write_text(json.dumps(record,indent=2)+'\n')
PY
