"""Environment-only configuration; no installation path is embedded here."""
import os
SDK_ROOT = os.environ['EMSDK']
LLVM_ROOT = os.path.join(SDK_ROOT, 'upstream', 'bin')
BINARYEN_ROOT = os.path.join(SDK_ROOT, 'upstream')
EMSCRIPTEN_ROOT = os.path.join(SDK_ROOT, 'upstream', 'emscripten')
NODE_JS = os.environ['NATIVE_MAGICK_NODE']
PYTHON = os.environ['NATIVE_MAGICK_PYTHON']
