"""Dedicated complete Farneback plus bounded stereo search/render primitives."""
from pathlib import Path
import os,subprocess,json,hashlib,shutil
root=Path(__file__).resolve().parents[1];external=Path(os.environ['OPENCV_BUILD_ROOT']);compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';out=root/'vendor/stereo-stream';out.mkdir(exist_ok=True)
assert '4.0.15' in subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
files=[external/'farneback-reference.o',external/'cv/lib/libopencv_video.a',external/'cv/lib/libopencv_imgproc.a',external/'cv/lib/libopencv_core.a',external/'cv/3rdparty/lib/libzlib.a']
includes=[external/f'opencv-4.11.0/modules/{name}/include' for name in ['core','imgproc','video']]+[external/'cv']
exports=['malloc','free','stereo_stream_search','stereo_stream_sums','stereo_stream_create','stereo_stream_input','stereo_stream_flow','stereo_stream_output','stereo_stream_normalize','stereo_stream_floating','stereo_stream_release','cv_stereo_timings']
subprocess.run([str(compiler),str(root/'native/stereo-stream.cpp'),*map(str,files),*[arg for path in includes for arg in ['-I',str(path)]],'-O3','-fexceptions','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=8388608','-sMAXIMUM_MEMORY=2147483648','-sMEMORY_GROWTH_LINEAR_STEP=4194304','-sABORTING_MALLOC=0','-sFILESYSTEM=0','-sEXPORTED_FUNCTIONS='+json.dumps(['_'+x for x in exports]),'-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32","HEAPF64"]','-o',str(out/'stereo-stream.js')],check=True)
shutil.copyfile(root/'vendor/opencv/LICENSE',out/'LICENSE');(out/'PINNED.json').write_text(json.dumps(dict(opencv='4.11.0',emscripten='4.0.15',files={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in files}),indent=2)+'\n')
