"""Link native eligibility helpers against an explicit read-only OpenCV build."""
from pathlib import Path
import hashlib,json,os,subprocess,shutil
root=Path(__file__).resolve().parents[1];external=Path(os.environ['OPENCV_BUILD_ROOT']);sdk=Path(os.environ['EMSDK'])
out=root/'vendor/dense-regions';out.mkdir(exist_ok=True)
compiler=sdk/'upstream/emscripten/em++'
assert '4.0.15' in subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
command=[str(compiler),str(root/'native/dense-regions.cpp')]
libs=[external/'cv/lib'/f'libopencv_{name}.a' for name in ('imgproc','core')]+[external/'cv/3rdparty/lib/libzlib.a']
command += list(map(str,libs))
for name in ('imgproc','core'):command += ['-I',str(external/'opencv-4.11.0/modules'/name/'include')]
command += ['-I',str(external/'cv'),'-O3','-fexceptions','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=','-ffile-prefix-map='+str(external)+'/=opencv-build/','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=33554432','-sMAXIMUM_MEMORY=2147483648','-sABORTING_MALLOC=0','-sMEMORY_GROWTH_LINEAR_STEP=16777216','-sEXPORTED_FUNCTIONS=["_malloc","_free","_sherloq_dense_allowed","_sherloq_dense_detail","_sherloq_dense_remap","_sherloq_dense_guide_labels","_sherloq_dense_overlap","_sherloq_dense_draw_group"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAP32","HEAPF32","HEAPF64","UTF8ToString"]','-o',str(out/'dense-regions.js')]
subprocess.run(command,check=True)
shutil.copyfile(root/'vendor/opencv/LICENSE',out/'LICENSE-OPENCV.txt')
(out/'PINNED.json').write_text(json.dumps({'opencv':'4.11.0','emscripten':'4.0.15','libraries':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in libs}},indent=2)+'\n')
