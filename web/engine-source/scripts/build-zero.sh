#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EMSDK:?Set EMSDK to Emscripten4.0.15}"
python3 scripts/build-zero-kernels.py --targets zero
