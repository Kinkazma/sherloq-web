"""Isolated module, read-only pinned SDK/libjpeg inputs; no shared rebuild."""
from pathlib import Path
import hashlib, json, os, subprocess
root=Path(__file__).resolve().parents[1];out=root/'vendor/jpeg-dct-paged';out.mkdir(parents=True,exist_ok=True)
build=Path(os.environ['JPEG_BUILD_ROOT']);cc=Path(os.environ['EMSDK'])/'upstream/emscripten/emcc'
env={**os.environ,'EM_FROZEN_CACHE':'1','EMCC_CORES':'1'}
version=subprocess.check_output([str(cc),'--version'],env=env,text=True).splitlines()[0];assert '4.0.15' in version
subprocess.run([str(cc),str(root/'native/jpeg-dct-paged.c'),str(build/'jpeg/libjpeg.a'),'-I'+str(build/'libjpeg-turbo-3.0.3'),'-I'+str(build/'jpeg'),'-O3','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=','-sASYNCIFY=1','-sASYNCIFY_STACK_SIZE=262144','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1','-sIMPORTED_MEMORY=1','-sABORTING_MALLOC=0','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=67108864','-sEXPORTED_FUNCTIONS=["_malloc","_free","_dct_paged_run","_dct_paged_close","_dct_paged_error","_jpeg_decode_paged"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","ccall"]','-o',str(out/'jpeg-dct-paged.js')],env=env,check=True)
for name in ['LICENSE.md','README.ijg']:(out/name).write_bytes((build/'libjpeg-turbo-3.0.3'/name).read_bytes())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(out/'PINNED.json').write_text(json.dumps(dict(libjpeg='3.0.3',compiler=version,sourceSha256=sha(root/'native/jpeg-dct-paged.c'),linkedLibrarySha256=sha(build/'jpeg/libjpeg.a'),memory='Imported64MiB maximum;8MiB libjpeg virtual-array cache; original encoded input read in64KiB windows and global coefficients in external backing stores.',files={name:sha(out/name) for name in ['jpeg-dct-paged.js','jpeg-dct-paged.wasm','LICENSE.md','README.ijg']}),indent=2)+'\n')
