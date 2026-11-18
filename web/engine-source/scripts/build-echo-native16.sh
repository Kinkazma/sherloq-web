#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EMSDK:?Reuse the existing Emscripten4.0.15 SDK}"
source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1
# Same canonical optimization mask/flags/heap. New payload name protects old tabs.
echo_flags=5
echo_output="${ECHO_NATIVE16_OUTPUT_DIR:-vendor/echo}"
mkdir -p "$echo_output"
em++ native/echo-native16.cpp -DECHO_OPTIMIZATIONS="$echo_flags" -O3 -ffp-contract=off -fexceptions \
 -ffile-prefix-map="$PWD/"= -fdebug-prefix-map="$PWD/"= \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node \
 -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=67108864 \
 -sABORTING_MALLOC=0 -sFILESYSTEM=0 -sDISABLE_EXCEPTION_CATCHING=0 \
 -sEXPORTED_FUNCTIONS='["_malloc","_free","_echo_derivatives","_echo_render","_echo_derivatives16","_echo_render16"]' \
 -sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAPU16","HEAPF32","HEAPF64"]' -o "$echo_output/echo-native16.js"
python3 - "$echo_output" <<'PY'
from pathlib import Path
import hashlib,json,sys
output=Path(sys.argv[1])
files=[('native/echo.cpp',Path('native/echo.cpp')),('native/echo-native16.cpp',Path('native/echo-native16.cpp')),('scripts/build-echo-native16.sh',Path('scripts/build-echo-native16.sh')),('vendor/echo/echo-native16.js',output/'echo-native16.js'),('vendor/echo/echo-native16.wasm',output/'echo-native16.wasm')]
record={'schema':'sherloq.echo-typed-native/1','compiler':'Emscripten 4.0.15','optimizations':5,'arithmetic':'-O3 -ffp-contract=off; existing8 order unchanged; exact Int32 small native16 derivatives; existing ordered float32/FMA for large kernels','memory':{'initialBytes':67108864,'maximumBytes':67108864,'growth':False},'entryPoints':{'depth8':['echo_derivatives','echo_render'],'depth16':['echo_derivatives16','echo_render16']},'types':{'sampleBytes':{'8':1,'16':2},'rawBytesPerChannel':4,'rawPixelBytes':12,'outputPixelBytes':3,'native16Small':{'radius':[1,4],'rawKind':'int32','normalization':'global per-channel Float64, then RGB8 nearest-even/contrast/gray'},'native16Large':{'radius':[5,15],'rawKind':'float32','normalization':'existing global Float32/FMA; image-population branch below8 preserved'}},'files':{name:{'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}for name,path in files}}
(output/'PINNED-native16.json').write_text(json.dumps(record,indent=2)+'\n')
PY
