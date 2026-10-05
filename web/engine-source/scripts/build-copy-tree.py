from pathlib import Path
import os,subprocess,json,hashlib
root=Path(__file__).resolve().parents[1];out=root/'vendor/copy-tree';compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
subprocess.run([str(compiler),str(root/'native/copy-tree.cpp'),'-O3','-ffp-contract=off','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=8388608','-sMAXIMUM_MEMORY=67108864','-sSTACK_SIZE=1048576','-sFILESYSTEM=0','-sEXPORTED_FUNCTIONS=["_malloc","_free","_copy_tree_order"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPU32"]','-o',str(out/'copy-tree.js')],check=True)
(out/'PINNED.json').write_text(json.dumps({'scipy':'1.17.1','emscripten':'4.0.15','files':{n:{'bytes':(out/n).stat().st_size,'sha256':hashlib.sha256((out/n).read_bytes()).hexdigest()} for n in ['copy-tree.js','copy-tree.wasm']}},indent=2)+'\n')
