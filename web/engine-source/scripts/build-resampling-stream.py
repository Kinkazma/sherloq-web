from pathlib import Path
import os,subprocess,hashlib,json,shutil
root=Path(__file__).resolve().parents[1];vendor=root/'vendor/numpy-fft'
for entry in json.loads((vendor/'PINNED.json').read_text())['files']:assert hashlib.sha256((vendor/entry['file']).read_bytes()).hexdigest()==entry['sha256']
source=(vendor/'_pocketfft.c').read_text();source=source[:source.index('static PyObject *')];start=source.index('#define NPY_NO_DEPRECATED_API');end=source.index('#include <math.h>');source=source[:start]+'#include <assert.h>\n'+source[end:];(root/'.build/resampling-pocketfft.c').write_text(source)
out=root/'vendor/resampling-stream';out.mkdir(exist_ok=True);compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/emcc';assert '4.0.15' in subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
subprocess.run([str(compiler),str(root/'native/resampling-stream.c'),'-O3','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sINITIAL_MEMORY=8388608','-sMAXIMUM_MEMORY=134217728','-sSTACK_SIZE=65536','-sALLOW_MEMORY_GROWTH=1','-sMEMORY_GROWTH_LINEAR_STEP=4194304','-sABORTING_MALLOC=0','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF64"]','-sEXPORTED_FUNCTIONS=["_malloc","_free","_resampling_stream_axis","_resampling_pyrup"]','-o',str(out/'resampling-stream.js')],check=True)
for name in ['LICENSE-NUMPY.txt','LICENSE-OPENCV.txt','LICENSE-MUSL.txt','LICENSE-POCKETFFT.md','LICENSES_bundled.txt']:shutil.copyfile(root/'vendor/resampling'/name,out/name)
(out/'PINNED.json').write_text(json.dumps(dict(numpy='1.26.4',opencv='4.11.0',emscripten='4.0.15',source=json.loads((vendor/'PINNED.json').read_text())),indent=2)+'\n')
