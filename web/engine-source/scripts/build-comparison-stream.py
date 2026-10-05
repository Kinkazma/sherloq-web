"""Build dedicated global comparison stages with streamed inputs and outputs."""
from pathlib import Path
import os,subprocess,json,hashlib,shutil
root=Path(__file__).resolve().parents[1];external=Path(os.environ['OPENCV_BUILD_ROOT']);compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';out=root/'vendor/comparison-stream';out.mkdir(exist_ok=True)
assert '4.0.15' in subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
subprocess.run(['python3',str(root/'scripts/build-comparison-helpers.py')],check=True)
source=(root/'native/opencv.cpp').read_text();(root/'.build/comparison-primitives.h').write_text(source[:source.index('#include "frequency.h"')])
files=[external/'butteraugli-reference.o',external/'cv/lib/libopencv_imgproc.a',external/'cv/lib/libopencv_core.a',external/'cv/3rdparty/lib/libzlib.a']
includes=[external/f'opencv-4.11.0/modules/{name}/include' for name in ['core','imgproc','imgcodecs','photo','video']]+[external/'opencv_contrib-4.11.0/modules/img_hash/include',external/'cv',root/'native']
subprocess.run([str(compiler),str(root/'native/comparison-stream.cpp'),*map(str,files),*[arg for path in includes for arg in ['-I',str(path)]],'-O3','-fexceptions','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=8388608','-sMAXIMUM_MEMORY=2147483648','-sMEMORY_GROWTH_LINEAR_STEP=4194304','-sABORTING_MALLOC=0','-sFILESYSTEM=0','-sEXPORTED_FUNCTIONS=["_malloc","_free","_comparison_stream_create","_comparison_stream_input","_comparison_stream_run","_comparison_stream_score","_comparison_stream_output","_comparison_stream_bytes","_comparison_stream_release"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF64"]','-o',str(out/'comparison-stream.js')],check=True)
shutil.copyfile(root/'vendor/opencv/LICENSE',out/'LICENSE');(out/'PINNED.json').write_text(json.dumps(dict(opencv='4.11.0',emscripten='4.0.15',files={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in files}),indent=2)+'\n')
