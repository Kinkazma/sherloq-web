"""Build exact guarded SIMD native EM with the original reduction chains."""
from pathlib import Path
import argparse,os,subprocess,json,hashlib,shutil
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--source-root',type=Path,default=root);p.add_argument('--emsdk',type=Path,default=Path(os.environ.get('EMSDK','emsdk')));args=p.parse_args();sources=args.source_root.resolve()
source=sources/'vendor/resampling-em-source';output=root/'vendor/resampling-em-simd';output.mkdir(exist_ok=True)
for item in json.loads((source/'NUMERICAL-DATA.json').read_text())['files']:
 if hashlib.sha256((source/item['file']).read_bytes()).hexdigest()!=item['sha256']:raise RuntimeError('Pinned native EM arithmetic source differs: '+item['file'])
# These ordered reductions and guarded FMA helpers define the compatibility oracle.
for name,digest in {'native/resampling-em-stream.cpp': '1ed1e30b88e2d730474a618e98514ca06e45f1f61e408bef576170a5d50882a3', 'native/prnu-fma.cpp': '7b8a4e52d7c58ec1dbe63f9892d9ff4c29f1784d57e9e2a58ffcc8cb9f2f2fe2', 'native/comparison-fma.h': '97ecdad443909c5e3f9d99615e10ebc4b7a98cde4273d30dea48dd3083c25bdf'}.items():
 if hashlib.sha256((sources/name).read_bytes()).hexdigest()!=digest:raise RuntimeError("Pinned native EM source differs: "+name)
cc=args.emsdk/'upstream/emscripten/em++'
if '4.0.15' not in subprocess.check_output([str(cc),'--version'],text=True).splitlines()[0]:raise RuntimeError('Emscripten4.0.15 is required.')
exports=['malloc','free','em_stream_create','em_stream_batch','em_stream_finish','em_stream_weights','em_stream_iterations','em_stream_destroy','em_square','em_exp','cv_prnu_vector_test','cv_prnu_scalar_test']
subprocess.run([str(cc),str(root/'native/resampling-em-simd.cpp'),'-I'+str(sources/'native'),'-I'+str(source),'-msimd128','-O3','-fexceptions','-ffp-contract=off','-fno-builtin-pow','-ffile-prefix-map='+str(root)+'/=','-ffile-prefix-map='+str(sources)+'/=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=8388608','-sMAXIMUM_MEMORY=134217728','-sFILESYSTEM=0','-sDISABLE_EXCEPTION_CATCHING=0','-sABORTING_MALLOC=0','-sMEMORY_GROWTH_LINEAR_STEP=8388608','-sEXPORTED_FUNCTIONS='+json.dumps(['_'+n for n in exports]),'-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF64"]','-o',str(output/'resampling-em-simd.js')],check=True)

shutil.copyfile(source/'OPENBLAS-NOTICES.txt',output/'OPENBLAS-NOTICES.txt')
