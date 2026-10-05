"""Link against read-only OpenCV build; all generated outputs stay in this worktree."""
from pathlib import Path
import os,subprocess,json,hashlib
root=Path(__file__).resolve().parents[1]
build=Path(os.environ.get('OPENCV_BUILD_ROOT',root/'.build')).resolve()
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
assert '4.0.15' in subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
out=root/'.build/m3/sift-extract';out.mkdir(parents=True,exist_ok=True)
command=[str(compiler),str(root/'experiments/m3/sift-extract.cpp')]
if os.environ.get('SIFT_REFERENCE_OBJECT'):command.append(os.environ['SIFT_REFERENCE_OBJECT'])
for name in ['features2d','flann','imgproc','core']:
 command += [str(build/f'cv/lib/libopencv_{name}.a'),'-I',str(build/f'opencv-4.11.0/modules/{name}/include')]
command += [str(build/'cv/3rdparty/lib/libzlib.a'),'-I',str(build/'cv'),'-O3','-fexceptions','-ffp-contract=off',
 '-ffile-prefix-map='+str(root)+'/=','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node',
 '-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=33554432','-sMAXIMUM_MEMORY=1073741824','-sFILESYSTEM=0',
 '-sEXPORTED_FUNCTIONS=["_malloc","_free","_sift_extract","_sift_prepared","_sift_gray","_sift_points","_sift_descriptors","_sift_release"]',
 '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]','-o',str(out/'sift-extract.js')]
subprocess.run(command,check=True)
(out/'LICENSE').write_bytes((root/'vendor/opencv/LICENSE').read_bytes())
(out/'SIFT-LICENSE.txt').write_text((build/'opencv-4.11.0/modules/features2d/src/sift.dispatch.cpp').read_text().split('#include',1)[0])
(out/'MUSL-LICENSE.txt').write_bytes((root/'vendor/quality/LICENSE').read_bytes())
(out/'PINNED.json').write_text(json.dumps({'schema':1,'opencv':'4.11.0','emscripten':'4.0.15','qualification':'study only, not exposed as a public operation',
 'build':'scripts/build-sift-extract.py','files':{n:{'bytes':(out/n).stat().st_size,'sha256':hashlib.sha256((out/n).read_bytes()).hexdigest()} for n in ['sift-extract.js','sift-extract.wasm']}},indent=2)+'\n')
