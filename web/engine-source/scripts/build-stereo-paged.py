"""Bounded-row OpenCV Farneback, preserving explicit native contractions."""
from pathlib import Path
import os,re,subprocess,json,shutil
root=Path(__file__).resolve().parents[1];external=Path(os.environ['OPENCV_BUILD_ROOT']);compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';out=root/'vendor/stereo-paged';out.mkdir(exist_ok=True);build=root/'.build/stereo-paged';build.mkdir(exist_ok=True)
includes=[external/f'opencv-4.11.0/modules/{name}/include' for name in ['core','imgproc']]+[external/'cv']
flags=['-std=c++17','-O3','-fexceptions','-ffile-prefix-map='+str(root)+'/=',*[arg for path in includes for arg in ['-I',str(path)]]]
llvm=build/'farneback.ll';obj=build/'farneback.o'
subprocess.run([str(compiler),*flags,'-ffp-contract=on','-S','-emit-llvm',str(root/'vendor/stereo-paged-source/farneback.cpp'),'-o',str(llvm)],check=True)
s=llvm.read_text().replace('@llvm.fmuladd.','@llvm.fma.')
for kind,c in [('f32','float'),('f64','double')]:
 name='sherloq_stereo_fma'+('64' if kind=='f64' else '')
 s=s.replace('@llvm.fma.'+kind,'@'+name)
 s=re.sub(r'declare '+c+' @'+name+r'\('+c+', '+c+', '+c+r'\) #\d+',f'declare {c} @{name}({c}, {c}, {c})',s)
llvm.write_text(s);subprocess.run([str(compiler),'-O3','-c',str(llvm),'-o',str(obj)],check=True)
files=[external/'cv/lib/libopencv_imgproc.a',external/'cv/lib/libopencv_core.a',external/'cv/3rdparty/lib/libzlib.a']
subprocess.run([str(compiler),str(root/'native/stereo-paged.cpp'),str(obj),*map(str,files),*flags,'-msimd128','-ffp-contract=off','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sASYNCIFY=1','-sASYNCIFY_STACK_SIZE=262144','-sSTACK_SIZE=1048576','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=8388608','-sMAXIMUM_MEMORY=1073741824','-sMEMORY_GROWTH_GEOMETRIC_STEP=0','-sMEMORY_GROWTH_LINEAR_STEP=1048576','-sABORTING_MALLOC=0','-sFILESYSTEM=0','-sEXPORTED_FUNCTIONS='+json.dumps(['_malloc','_free','_stereo_paged_flow']),'-sEXPORTED_RUNTIME_METHODS='+json.dumps(['ccall','UTF8ToString','HEAPU8','HEAPF32']),'-o',str(out/'stereo-paged.js')],check=True)
shutil.copyfile(root/'vendor/stereo-paged-source/LICENSE',out/'LICENSE')
