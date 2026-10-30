"""Native descriptor with qualified FMA and four independent Gaussian pixels."""
from pathlib import Path
import os, subprocess, hashlib, json
root=Path(__file__).resolve().parents[1]
build=Path(os.environ.get('OPENCV_BUILD_ROOT',root/'.build'))
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
env={**os.environ,'EM_FROZEN_CACHE':'1','EMCC_CORES':'1'}
for key in ['CPATH','C_INCLUDE_PATH','CPLUS_INCLUDE_PATH','OBJC_INCLUDE_PATH']:
    env.pop(key,None)
version=subprocess.check_output([str(compiler),'--version'],env=env,text=True).splitlines()[0]
assert '4.0.15' in version
out=root/'vendor/ela-describe-fast';out.mkdir(parents=True,exist_ok=True)
sources=[root/'native/ela-describe.cpp',root/'native/sift-gaussian-simd.cpp',root/'native/sparse-fma-shim.cpp']
source=sources[0].read_text();anchor='void nativeGaussian(const cv::Mat& src,cv::Mat& dst){'
assert source.count(anchor)==1
source=source.replace(anchor,'extern \"C\" int sparse_fma_enabled();\nvoid siftNativeGaussian(cv::InputArray,cv::OutputArray,cv::Size,double,double);\n'+anchor+'if(sparse_fma_enabled()==1){siftNativeGaussian(src,dst,cv::Size(),1.5,1.5);return;}')
generated=root/'.build/ela-describe-fast/ela-describe.cpp';generated.parent.mkdir(parents=True,exist_ok=True);generated.write_text(source)
compiledSources=[generated,*sources[1:]]
objects=[build/'dft-reference.o',build/'cv/lib/libopencv_imgproc.a',build/'cv/lib/libopencv_core.a']
subprocess.run([str(compiler),*map(str,compiledSources),*map(str,objects),
 '-I'+str(build/'opencv-4.11.0/modules/core/include'),'-I'+str(build/'opencv-4.11.0/modules/imgproc/include'),'-I'+str(build/'cv'),'-I'+str(root/'native'),
 '-O3','-ffp-contract=off','-fno-fast-math','-fno-vectorize','-fno-slp-vectorize','-fexceptions','-msimd128','-mrelaxed-simd','-Wl,--wrap=fmaf',
 '-ffile-prefix-map='+str(root)+'/=','-ffile-prefix-map='+str(build)+'/=',
 '-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0',
 '-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=67108864','-sMEMORY_GROWTH_LINEAR_STEP=16777216',
 '-sEXPORTED_FUNCTIONS=["_malloc","_free","_ela_describe_row","_ela_describe_unlogged","_ela_describe_window","_sparse_fma_qualify","_sparse_fma_enabled"]',
 '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAP32","HEAPF32"]','-o',str(out/'describe-simd.js')],env=env,check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(out/'PINNED.json').write_text(json.dumps(dict(schema=1,compiler=version,opencv='4.11.0',sources={str(p.relative_to(root)):sha(p) for p in sources},generatedSourceSha256=sha(generated),sqrtTablesSha256=sha(root/'native/sqrt-tables.h'),objects={p.name:sha(p) for p in objects},qualification='Required on each actual module; scalar fmaf fallback remains enabled if hardware relaxed_madd differs.',files={p.name:dict(bytes=p.stat().st_size,sha256=sha(p)) for p in [out/'describe-simd.js',out/'describe-simd.wasm']}),indent=2)+'\n')
