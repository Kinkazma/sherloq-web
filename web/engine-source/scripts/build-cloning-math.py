"""Build bounded copy/move primitives without relinking other product kernels."""
from pathlib import Path
import hashlib, json, os, subprocess, sys
root=Path(__file__).resolve().parents[1]
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
assert '4.0.15' in subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
source=root/'.build/opencv-4.11.0/modules/features2d/src/orb.cpp'
assert hashlib.sha256(source.read_bytes()).hexdigest()=='3874450ed3f9a779f2cf1a20daf544332898d5bcabed30a38071741a6ae5d203'
# Reproduce the exact ORB polynomial/FMA object qualified by the offline study.
subprocess.run([sys.executable,str(root/'scripts/build-akaze-study.py')],check=True)
output=root/'vendor/cloning';output.mkdir(exist_ok=True)
command=[str(compiler),str(root/'native/cloning.cpp'),str(root/'.build/cloning-orb-reference.o')]
command += [str(root/f'.build/akaze-area-{name}.o') for name in ['AKAZEFeatures','nldiffusion_functions','fed']]
command += [str(root/f'experiments/cloning/akaze-{name}.cpp') for name in ['angles','filters','separable','area']]
for name in ['features2d','flann','imgproc','core']:
    command += [str(root/f'.build/cv/lib/libopencv_{name}.a'),'-I',str(root/f'.build/opencv-4.11.0/modules/{name}/include')]
command += [str(root/'.build/cv/3rdparty/lib/libzlib.a'),'-I',str(root/'.build/cv'),'-I',str(root/'.build'),'-O3','-fexceptions','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=33554432','-sMEMORY_GROWTH_LINEAR_STEP=16777216','-sMAXIMUM_MEMORY=1073741824','-sFILESYSTEM=0','-sEXPORTED_FUNCTIONS=["_malloc","_free","_cloning_detect","_cloning_detect_akaze","_cloning_result","_cloning_descriptors","_cloning_release","_cloning_select","_cloning_match","_cloning_match_sized","_cloning_norm","_cloning_draw_points","_cloning_draw_matches","_cloning_count"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPU32","HEAPF64","HEAPF32"]','-o',str(output/'cloning.js')]
subprocess.run(command,check=True)
(output/'LICENSE').write_bytes((root/'vendor/opencv/LICENSE').read_bytes())
(output/'LLVM-LICENSE.txt').write_bytes((root/'vendor/llvm-sort15/LICENSE.TXT').read_bytes())
(output/'ORB-LICENSE.txt').write_text(source.read_text().split('#include',1)[0])
(output/'AKAZE-FILTERS-LICENSE.txt').write_text((root/'experiments/cloning/akaze-filters.cpp').read_text().split('//M*/',1)[0]+'//M*/\n')
(output/'AKAZE-AREA-LICENSE.txt').write_text((root/'experiments/cloning/akaze-area.cpp').read_text().split('//M*/',1)[0]+'//M*/\n')
(output/'AKAZE-AUTHORS.txt').write_text('\n'.join((root/f'.build/opencv-4.11.0/modules/features2d/src/kaze/{name}.cpp').read_text().split('#include',1)[0] for name in ['AKAZEFeatures','nldiffusion_functions','fed']))

(output/'MUSL-LICENSE.txt').write_bytes((root/'vendor/quality/LICENSE').read_bytes())
pins={'schema':1,'opencv':'4.11.0','emscripten':'4.0.15','llvmSort':'llvmorg-15.0.7','orbSourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'nativeContract':'core/cloning.py explicit ORB and AKAZE, source frozen in the reference fixture manifests','arithmetic':'Native fast-angle polynomial; ORB LLVM fmuladd-to-fma replacement has102 symbol references including its declaration; pinned equal-distance sorting; scalar fused boundary norm','build':'scripts/build-cloning-math.py','files':{}}
pins['akazeStudy']=json.loads((root/'.build/akaze-area-build.json').read_text())
pins['akazeAvailability']='Availability and qualified scope are declared by the API contract and engine registry; a successful build alone is not a qualification'
pins['akazeArithmetic']='97 explicit FMA call sites (100 symbol references including3 declarations); OpenCV polynomial angles; float32 Gaussian/Scharr/multiscale derivatives/INTER_AREA with native accumulation order; descriptor stride61'
for name in ['cloning.js','cloning.wasm','LICENSE','LLVM-LICENSE.txt','ORB-LICENSE.txt','MUSL-LICENSE.txt','AKAZE-FILTERS-LICENSE.txt','AKAZE-AREA-LICENSE.txt','AKAZE-AUTHORS.txt']:
    data=(output/name).read_bytes();pins['files'][name]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
(output/'PINNED.json').write_text(json.dumps(pins,indent=2)+'\n')
