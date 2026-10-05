#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EMSDK:?Set EMSDK to Emscripten 4.0.15}"
source "$EMSDK/emsdk_env.sh" >/dev/null
mkdir -p .build/zero
python3 - <<'PYGEN'
from pathlib import Path
import hashlib
assert hashlib.sha256(Path('vendor/zero/zero.c').read_bytes()).hexdigest()=='f4fa0091e17cb292414b2bb451e3720c24f4d5227d918ff3730fea4de48f3d36', 'Unpinned ZERO source'
s=Path('vendor/zero/zero.c').read_text().replace('#include "zero.h"','#include "zero.h"\n#include "zero-cosines.h"')
s=s.replace('void compute_grid_votes_per_pixel(', 'void zero_reference_votes(',1)
s=s.replace('cos((2.0 * k + 1.0) * l * M_PI / 16.0)','zero_cosines[k][l]')
Path('.build/zero/reference.c').write_text(s)
PYGEN
emcc .build/zero/reference.c -I vendor/zero -I native -O3 -ffp-contract=on -S -emit-llvm -o .build/zero/reference.ll
python3 - <<'PY'
from pathlib import Path
p=Path('.build/zero/reference.ll');s=p.read_text();n=s.count('@llvm.fmuladd.');assert n>0;p.write_text(s.replace('@llvm.fmuladd.','@llvm.fma.'));print(n,'ZERO contraction references made explicit')
PY
emcc native/zero-fast.c -I vendor/zero -I native -O3 -ffp-contract=off -c -o .build/zero/fast.o
emcc .build/zero/reference.ll .build/zero/fast.o -O3 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=16777216 -sMAXIMUM_MEMORY=2147483648 -sFILESYSTEM=0 -sEXPORTED_FUNCTIONS='["_malloc","_free","_zero","_zero_set_reference","_zero_fallback_count","_rgb2luminance","_zero_rgb_luminance","_compute_grid_votes_per_pixel","_detect_global_grids","_detect_forgeries","_log_nfa"]' -sEXPORTED_RUNTIME_METHODS='["HEAPU8"]' -o vendor/zero/zero.js
