"""Read shared libjpeg SDK/build only; emit this worktree's isolated module."""
from pathlib import Path
import hashlib,json,os,subprocess
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'vendor/jpeg-stream';OUT.mkdir(parents=True,exist_ok=True)
BUILD=Path(os.environ['JPEG_BUILD_ROOT']);CC=Path(os.environ['EMSDK'])/'upstream/emscripten/emcc';env={**os.environ,'EM_FROZEN_CACHE':'1','EMCC_CORES':'1'}
version=subprocess.check_output([str(CC),'--version'],env=env,text=True).splitlines()[0];assert '4.0.15' in version
subprocess.run([str(CC),str(ROOT/'native/jpeg-stream.c'),str(BUILD/'jpeg/libjpeg.a'),'-I'+str(BUILD/'libjpeg-turbo-3.0.3'),'-I'+str(BUILD/'jpeg'),'-O3','-ffp-contract=off','-ffile-prefix-map='+str(ROOT)+'/=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1','-sIMPORTED_MEMORY=1','-sABORTING_MALLOC=0','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=134217728','-sEXPORTED_FUNCTIONS=["_malloc","_free","_stream_open","_stream_write","_stream_begin_read","_stream_read_loss","_stream_close","_stream_error"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8"]','-o',str(OUT/'jpeg-stream.js')],env=env,check=True)
for name in ['LICENSE.md','README.ijg']:(OUT/name).write_bytes((BUILD/'libjpeg-turbo-3.0.3'/name).read_bytes())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(OUT/'PINNED.json').write_text(json.dumps(dict(libjpeg='3.0.3',compiler=version,sourceSha256=sha(ROOT/'native/jpeg-stream.c'),linkedLibrarySha256=sha(BUILD/'jpeg/libjpeg.a'),memory='imported, caller bounded32–128MiB',files={name:sha(OUT/name) for name in ['jpeg-stream.js','jpeg-stream.wasm','LICENSE.md','README.ijg']}),indent=2)+'\n')
