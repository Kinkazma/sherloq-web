"""Rebuild optional exact native AKAZE/SIFT SIMD CPU arithmetic from sources.
No trained data or reference-image results are embedded in this resource.
"""
from pathlib import Path
import os,subprocess,json,hashlib,shutil
root=Path(__file__).resolve().parents[1];reference=Path(os.environ.get('SPARSE_REFERENCE_ROOT',root)).resolve();sourcePath=lambda name:(root/name) if (root/name).is_file() else (reference/name);build=Path(os.environ['OPENCV_BUILD_ROOT']).resolve();cc=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
assert '4.0.15' in subprocess.check_output([str(cc),'--version'],text=True).splitlines()[0]
# The four qualified objects are the same prerequisite as build-sparse-extract.py.
shared=[build/'cloning-orb-reference.o',*[build/f'akaze-area-{n}.o' for n in ['AKAZEFeatures','nldiffusion_functions','fed']]]
for p in shared:
 if not p.is_file():raise RuntimeError('Missing qualified OpenCV prerequisite: '+p.name)
stage=root/'.build/sparse-extract-simd';(stage/'scripts').mkdir(parents=True,exist_ok=True)
# Reuse the existing public object recipes in an isolated generated-source tree.
# Prefix maps apply while compiling the generated C++, before IR materializes
# __FILE__ strings; diagnostic filenames remain generic in the final binary.
for n in ['cloning/akaze-angles.cpp','m3/sift-gaussian.cpp','m3/sift-exp.cpp']:
 target=stage/'experiments'/n;target.parent.mkdir(parents=True,exist_ok=True)
 if n=='m3/sift-gaussian.cpp':
  # Only this optional object uses the equivalent external four-pixel Gaussian.
  # The scalar reference resource and its historical object recipe stay intact.
  target.write_text('#include <opencv2/core.hpp>\nvoid siftNativeGaussian(cv::InputArray,cv::OutputArray,cv::Size,double,double);\n')
 else:shutil.copyfile(sourcePath('experiments/'+n),target)
for n in ['build-sift-arithmetic-study.py','build-m3-brisk.py']:
 text=sourcePath('scripts/'+n).read_text();needle='subprocess.run([str(compiler),*options,'
 replacement="subprocess.run([str(compiler),*options,'-ffile-prefix-map='+str(root)+'/=.build/sparse-extract-simd/','-ffile-prefix-map='+str(build)+'/=.build/',"
 if needle not in text:raise RuntimeError('Public object recipe changed: '+n)
 (stage/'scripts'/n).write_text(text.replace(needle,replacement))
 subprocess.run([os.environ.get('PYTHON','python3'),str(stage/'scripts'/n)],check=True)
objects=shared+[stage/'.build/m3/sift-native.o',stage/'.build/m3/brisk-native.o'];flags=['-O3','-ffp-contract=off','-fexceptions','-ffile-prefix-map='+str(root)+'/=','-ffile-prefix-map='+str(reference)+'/=','-ffile-prefix-map='+str(build)+'/=.build/']
for n in ['features2d','flann','imgproc','core']:flags+=['-I',str(build/f'opencv-4.11.0/modules/{n}/include')]
flags+=['-I',str(build/'cv')]
for source in ['native/sparse-extract.cpp','experiments/cloning/brisk-area.cpp','experiments/cloning/akaze-angles.cpp','experiments/cloning/akaze-area.cpp','experiments/m3/akaze-paged-filters.cpp','native/sparse-fma-shim.cpp','native/sift-gaussian-simd.cpp']:
 obj=stage/(Path(source).stem+'.o');simd=source.endswith(('akaze-paged-filters.cpp','sparse-fma-shim.cpp','sift-gaussian-simd.cpp'))
 subprocess.run([str(cc),*flags,*(['-msimd128','-mrelaxed-simd'] if simd else []),*(['-fno-vectorize','-fno-slp-vectorize'] if source.endswith('sift-gaussian-simd.cpp') else []),'-c',str(sourcePath(source)),'-o',str(obj)],check=True);objects.append(obj)
exports=['_malloc','_free','_sparse_extract','_sparse_points','_sparse_descriptors','_sparse_descriptor_size','_sparse_polygon','_sparse_release','_sparse_total_features','_sparse_fma_qualify','_sparse_fma_enabled']
out=root/'vendor/sparse-extract-simd';out.mkdir(exist_ok=True,parents=True);libs=[build/f'cv/lib/libopencv_{n}.a' for n in ['features2d','flann','imgproc','core']]+[build/'cv/3rdparty/lib/libzlib.a']
subprocess.run([str(cc),*map(str,objects),*map(str,libs),'-O3','-fexceptions','-sDISABLE_EXCEPTION_CATCHING=0','-msimd128','-mrelaxed-simd','-Wl,--wrap=fmaf','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=33554432','-sMAXIMUM_MEMORY=2147483648','-sFILESYSTEM=0','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]','-sEXPORTED_FUNCTIONS='+json.dumps(exports,separators=(',',':')),'-o',str(out/'sparse-extract.js')],check=True)
for p in (reference/'vendor/sparse-extract').iterdir():
 if p.is_file() and p.name not in ['sparse-extract.js','sparse-extract.wasm','PINNED.json']:shutil.copyfile(p,out/p.name)
sourceFiles=['native/sparse-fma-shim.cpp','native/sift-gaussian-simd.cpp','experiments/m3/sift-gaussian.cpp','scripts/build-sparse-extract-simd.py','native/sparse-extract.cpp','experiments/cloning/brisk-area.cpp','experiments/cloning/akaze-angles.cpp','experiments/cloning/akaze-area.cpp','experiments/m3/akaze-paged-filters.cpp','scripts/build-sift-arithmetic-study.py','scripts/build-m3-brisk.py']
files=sourceFiles+['vendor/sparse-extract-simd/'+p.name for p in out.iterdir() if p.is_file() and p.name!='PINNED.json']
identity={p:{'bytes':sourcePath(p).stat().st_size,'sha256':hashlib.sha256(sourcePath(p).read_bytes()).hexdigest()} for p in files}
(out/'PINNED.json').write_text(json.dumps({'schema':1,'opencv':'4.11.0','compiler':'Emscripten4.0.15','method':'Unchanged native CM2 arithmetic: independent AKAZE pixels and SIFT Gaussian x lanes with the scalar tap order and REFLECT101. Fused SIMD is qualified before use; original scalar CPU resource retained. This is a CPU SIMD resource, not a GPU descriptor claim.','initialHeapBytes':33554432,'maximumHeapBytes':2147483648,'build':'scripts/build-sparse-extract-simd.py','files':identity},indent=2)+'\n')
(root/'src/sparse-extract-simd-assets.js').write_text('export const SPARSE_EXTRACT_SIMD_WASM='+json.dumps(identity['vendor/sparse-extract-simd/sparse-extract.wasm'],separators=(',',':'))+';\n')
