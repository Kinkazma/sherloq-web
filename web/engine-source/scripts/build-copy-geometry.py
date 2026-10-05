"""Link pinned, read-only OpenCV; outputs only in this worktree."""
from pathlib import Path
import os,subprocess,json,hashlib
root=Path(__file__).resolve().parents[1]
build=Path(os.environ.get('OPENCV_BUILD_ROOT',root/'.build')).resolve()
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
assert '4.0.15' in subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
out=root/'vendor/copy-geometry';out.mkdir(parents=True,exist_ok=True)
command=[str(compiler),str(root/'native/copy-geometry.cpp')]
for name in ['calib3d','features2d','flann','imgproc','core']:
 command += [str(build/f'cv/lib/libopencv_{name}.a'),'-I',str(build/f'opencv-4.11.0/modules/{name}/include')]
command += [str(build/'cv/3rdparty/lib/libzlib.a'),'-I',str(build/'cv'),'-O3','-fexceptions','-ffp-contract=off',
 '-ffile-prefix-map='+str(root)+'/=','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node',
 '-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sIMPORTED_MEMORY=1','-sMAXIMUM_MEMORY=2147483648','-sFILESYSTEM=0',
 '-sEXPORTED_FUNCTIONS=["_malloc","_free","_copy_fit","_copy_overlap","_copy_draw_group","_copy_draw_polygon"]',
 '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF64","HEAPF32"]','-o',str(out/'copy-geometry.js')]
subprocess.run(command,check=True)
(out/'LICENSE').write_bytes((root/'vendor/opencv/LICENSE').read_bytes())
(out/'MUSL-LICENSE.txt').write_bytes((root/'vendor/quality/LICENSE').read_bytes())
(out/'PINNED.json').write_text(json.dumps({'schema':1,'opencv':'4.11.0','emscripten':'4.0.15','build':'scripts/build-copy-geometry.py','maximumMemoryBytes':2147483648,
 'files':{n:{'bytes':(out/n).stat().st_size,'sha256':hashlib.sha256((out/n).read_bytes()).hexdigest()} for n in ['copy-geometry.js','copy-geometry.wasm']}},indent=2)+'\n')
