from pathlib import Path
import os,subprocess,json,shutil
root=Path(__file__).resolve().parents[1];out=root/'vendor/comparison-sewar-paged';out.mkdir(exist_ok=True);compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
external=Path(os.environ['OPENCV_BUILD_ROOT'])
includes=[external/'opencv-4.11.0/modules/core/include',external/'cv']
subprocess.run([str(compiler),str(root/'native/comparison-sewar-paged.cpp'),str(external/'cv/lib/libopencv_core.a'),str(external/'cv/3rdparty/lib/libzlib.a'),*[arg for p in includes for arg in ['-I',str(p)]],'-std=c++17','-O3','-ffp-contract=off','-msimd128','-fexceptions','-ffile-prefix-map='+str(root)+'/=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sASYNCIFY=1','-sASYNCIFY_STACK_SIZE=262144','-sSTACK_SIZE=1048576','-sINITIAL_MEMORY=8388608','-sMAXIMUM_MEMORY=536870912','-sALLOW_MEMORY_GROWTH=1','-sMEMORY_GROWTH_GEOMETRIC_STEP=0','-sMEMORY_GROWTH_LINEAR_STEP=1048576','-sABORTING_MALLOC=0','-sDISABLE_EXCEPTION_CATCHING=0','-sEXPORTED_FUNCTIONS='+json.dumps(['_malloc','_free','_comparison_sewar_paged','_comparison_sewar_values']),'-sEXPORTED_RUNTIME_METHODS='+json.dumps(['ccall','UTF8ToString','HEAPU8','HEAPF64']),'-o',str(out/'comparison-sewar-paged.js')],check=True)
shutil.copyfile(root/'vendor/opencv/LICENSE',out/'LICENSE-OPENCV.txt');shutil.copyfile(root/'vendor/numpy-sort/LICENSE',out/'LICENSE-NUMPY.txt')

for name in ['SEWAR-LICENSE.txt','SCIPY-LICENSE.txt']:
 shutil.copyfile(root/'vendor/comparison'/name,out/name)
