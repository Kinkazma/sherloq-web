"""Small composition kernel; existing OpenCV/SDK inputs are strictly read-only."""
from pathlib import Path
import os, subprocess, hashlib, json
root=Path(__file__).resolve().parents[1]
build=Path(os.environ.get('OPENCV_BUILD_ROOT',root/'.build'))
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
env={**os.environ,'EM_FROZEN_CACHE':'1','EMCC_CORES':'1'}
version=subprocess.check_output([str(compiler),'--version'],env=env,text=True).splitlines()[0]
assert '4.0.15' in version
out=root/'vendor/composition';out.mkdir(exist_ok=True)
source=root/'native/composition.cpp'
objects=[build/'dft-reference.o',build/'cv/lib/libopencv_imgproc.a',build/'cv/lib/libopencv_core.a']
subprocess.run([str(compiler),str(source),*map(str,objects),'-I'+str(build/'opencv-4.11.0/modules/core/include'),'-I'+str(build/'opencv-4.11.0/modules/imgproc/include'),'-I'+str(build/'cv'),'-O3','-ffp-contract=off','-fexceptions','-ffile-prefix-map='+str(root)+'/=','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=67108864','-sMEMORY_GROWTH_LINEAR_STEP=16777216','-sEXPORTED_FUNCTIONS=["_malloc","_free","_composition_fill","_composition_iou"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAP32","HEAPF32"]','-o',str(out/'composition.js')],env=env,check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(out/'PINNED.json').write_text(json.dumps(dict(schema=1,compiler=version,opencv='4.11.0',sourceSha256=sha(source),objects={p.name:sha(p) for p in objects},files={p.name:dict(bytes=p.stat().st_size,sha256=sha(p)) for p in [out/'composition.js',out/'composition.wasm']}),indent=2)+'\n')
