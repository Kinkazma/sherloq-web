"""Build pinned NumPy FFT and native-order binary64 image arithmetic."""
from pathlib import Path
import hashlib,json,os,subprocess
ROOT=Path(__file__).resolve().parents[1];vendor=ROOT/'vendor/numpy-fft'
for entry in json.loads((vendor/'PINNED.json').read_text())['files']:
 assert hashlib.sha256((vendor/entry['file']).read_bytes()).hexdigest()==entry['sha256']
source=(vendor/'_pocketfft.c').read_text();source=source[:source.index('static PyObject *')]
start=source.index('#define NPY_NO_DEPRECATED_API');end=source.index('#include <math.h>')
source=source[:start]+'#include <assert.h>\n'+source[end:]
(ROOT/'.build').mkdir(exist_ok=True);(ROOT/'.build/resampling-pocketfft.c').write_text(source)
out=ROOT/'vendor/resampling';out.mkdir(exist_ok=True);compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/emcc'
assert '4.0.15' in subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
subprocess.run([str(compiler),str(ROOT/'native/resampling-math.c'),'-O3','-ffp-contract=off','-ffile-prefix-map='+str(ROOT)+'/=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sINITIAL_MEMORY=33554432','-sMAXIMUM_MEMORY=536870912','-sSTACK_SIZE=65536','-sALLOW_MEMORY_GROWTH=1','-sMEMORY_GROWTH_LINEAR_STEP=16777216','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF64"]','-sEXPORTED_FUNCTIONS=["_malloc","_free","_resampling_fft2","_resampling_pyrup"]','-o',str(out/'resampling.js')],check=True)
(out/'LICENSE-NUMPY.txt').write_bytes((vendor/'LICENSE.txt').read_bytes())
(out/'LICENSE-OPENCV.txt').write_bytes((ROOT/'vendor/opencv/LICENSE').read_bytes())
(out/'LICENSE-MUSL.txt').write_bytes((ROOT/'vendor/quality/LICENSE').read_bytes())
(out/'LICENSE-POCKETFFT.md').write_bytes((vendor/'LICENSE-POCKETFFT.md').read_bytes())
(out/'LICENSES_bundled.txt').write_bytes((vendor/'LICENSES_bundled.txt').read_bytes())
