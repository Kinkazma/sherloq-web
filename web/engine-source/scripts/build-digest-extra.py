"""Isolated digest parity study; SDK/OpenCV inputs remain read-only."""
from pathlib import Path
import os,subprocess,re,shlex,json,hashlib
root=Path(__file__).resolve().parents[1];build=Path(os.environ['OPENCV_BUILD_ROOT']);compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';out=root/'.build/digest-extra';out.mkdir(parents=True,exist_ok=True)
runtime=root/'vendor/digest-extra';runtime.mkdir(parents=True,exist_ok=True)
env={**os.environ,'EM_FROZEN_CACHE':'1','EMCC_CORES':'1'}
version=subprocess.check_output([str(compiler),'--version'],env=env,text=True).splitlines()[0];assert '4.0.15' in version
flags=(build/'cv/modules/imgproc/CMakeFiles/opencv_imgproc.dir/flags.make').read_text();args=[]
for key in ['CXX_DEFINES','CXX_INCLUDES','CXX_FLAGS']:args+=shlex.split(re.search('^'+key+r' = (.*)$',flags,re.M)[1])
args=['@'+str(build/'cv/modules/imgproc'/x[1:]) if x.startswith('@') else '-ffp-contract=on' if x=='-ffp-contract=off' else x for x in args]
llvm=out/'moments.ll';subprocess.run([str(compiler),*args,'-S','-emit-llvm',str(build/'opencv-4.11.0/modules/imgproc/src/moments.cpp'),'-o',str(llvm)],env=env,check=True)
text=llvm.read_text();count=text.count('@llvm.fmuladd.');assert count>0;llvm.write_text(text.replace('@llvm.fmuladd.','@llvm.fma.'))
subprocess.run([str(compiler),'-O3','-c',str(llvm),'-o',str(out/'moments.o')],env=env,check=True)
subprocess.run([str(compiler),str(root/'native/digest-extra.cpp'),str(out/'moments.o'),str(build/'dft-reference.o'),str(build/'cv/lib/libopencv_imgproc.a'),str(build/'cv/lib/libopencv_core.a'),'-I'+str(build/'opencv-4.11.0/modules/core/include'),'-I'+str(build/'opencv-4.11.0/modules/imgproc/include'),'-I'+str(build/'cv'),'-O3','-ffile-prefix-map='+str(root)+'/=','-ffile-prefix-map='+str(build)+'/=/opencv-build/','-ffp-contract=off','-fexceptions','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=134217728','-sEXPORTED_FUNCTIONS=["_malloc","_free","_digest_extra","_digest_data","_digest_size","_digest_release"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8"]','-o',str(runtime/'digest.js')],check=True,env={**os.environ,'EM_FROZEN_CACHE':'1','EMCC_CORES':'1'})

sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(runtime/'PINNED.json').write_text(json.dumps(dict(compiler=version,opencv='4.11.0',workspaceBytes=134217728,sources={p.name:sha(p) for p in [root/'native/digest-extra.cpp',root/'native/sqrt-tables.h',build/'opencv-4.11.0/modules/imgproc/src/moments.cpp',build/'opencv-4.11.0/modules/imgproc/src/resize.cpp',build/'opencv-4.11.0/3rdparty/carotene/src/colorconvert.cpp',build/'opencv_contrib-4.11.0/modules/img_hash/src/color_moment_hash.cpp',build/'opencv_contrib-4.11.0/modules/img_hash/src/marr_hildreth_hash.cpp']},objects={p.name:sha(p) for p in [out/'moments.o',build/'dft-reference.o',build/'cv/lib/libopencv_imgproc.a',build/'cv/lib/libopencv_core.a']},files={p.name:dict(bytes=p.stat().st_size,sha256=sha(p))for p in [runtime/'digest.js',runtime/'digest.wasm']}),indent=2)+'\n')
