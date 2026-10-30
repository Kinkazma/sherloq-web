"""Build the unchanged binary64 SSG nearest tree for the word stage."""
from pathlib import Path
import hashlib,json,os,subprocess
root=Path(__file__).resolve().parents[1]
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
env={**os.environ,'EM_FROZEN_CACHE':'1','EMCC_CORES':'1'}
for key in ['CPATH','C_INCLUDE_PATH','CPLUS_INCLUDE_PATH','OBJC_INCLUDE_PATH']:env.pop(key,None)
version=subprocess.check_output([str(compiler),'--version'],env=env,text=True).splitlines()[0]
assert '4.0.15' in version
out=root/'vendor/ssg-word-nearest';out.mkdir(parents=True,exist_ok=True)
subprocess.run([str(compiler),str(root/'native/ssg-word-nearest.cpp'),'-O3','-ffp-contract=off','-fno-fast-math','-fno-vectorize','-fno-slp-vectorize','-fexceptions','-ffile-prefix-map='+str(root)+'/=','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sIMPORTED_MEMORY=1','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=268435456','-sEXPORTED_FUNCTIONS=["_malloc","_free","_ssg_word_tree_create","_ssg_word_tree_query","_ssg_word_tree_release"]','-sEXPORTED_RUNTIME_METHODS=["HEAPF64","HEAPU32"]','-o',str(out/'nearest.mjs')],env=env,check=True)
files=[out/'nearest.mjs',out/'nearest.wasm'];sources=[root/'native/ssg-word-nearest.cpp',out/'nearest.h']
(out/'PINNED.json').write_text(json.dumps({'compiler':version,'algorithm':'unchanged FullNearest binary64 split/tie/query rules, exact source-group order','sources':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources},'files':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files}},indent=2)+'\n')
