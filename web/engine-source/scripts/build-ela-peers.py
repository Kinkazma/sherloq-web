"""Standalone SciPy1.17.1 cKDTree study, no native/NumPy runtime dependency."""
from pathlib import Path
import os,subprocess
root=Path(__file__).resolve().parents[1];out=root/'vendor/ela-peers';out.mkdir(parents=True,exist_ok=True)
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';src=root/'vendor/scipy-spatial'
env={**os.environ,'EM_FROZEN_CACHE':'1','EMCC_CORES':'1'}
version=subprocess.check_output([str(compiler),'--version'],env=env,text=True).splitlines()[0];assert '4.0.15' in version
subprocess.run([str(compiler),str(root/'native/ela-peers.cpp'),str(src/'build.cxx'),str(src/'query.cxx'),'-I'+str(src),'-I'+str(root/'native/scipy-compat'),'-O3','-ffp-contract=off','-fexceptions','-ffile-prefix-map='+str(root)+'/=','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=67108864','-sEXPORTED_FUNCTIONS=["_malloc","_free","_ela_peers_create","_ela_peers_query","_ela_peers_release"]','-sEXPORTED_RUNTIME_METHODS=["HEAPF64","HEAP32"]','-o',str(out/'peers.js')],env=env,check=True)

import hashlib,json
files=[out/'peers.js',out/'peers.wasm']
(out/'PINNED.json').write_text(json.dumps(dict(scipy='1.17.1',compiler=version,leafsize=16,balanced=True,compact=True,sources={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [root/'native/ela-peers.cpp',root/'native/scipy-compat/numpy/npy_common.h',src/'SOURCES.json']},files={p.name:dict(bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in files}),indent=2)+'\n')
