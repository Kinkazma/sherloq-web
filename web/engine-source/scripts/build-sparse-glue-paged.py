from pathlib import Path
import os,subprocess,json,hashlib
root=Path(__file__).resolve().parents[1];out=root/'vendor/sparse-glue-paged';out.mkdir(exist_ok=True);compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
subprocess.run([str(compiler),str(root/'native/sparse-glue-paged.cpp'),'-O3','-msimd128','-ffp-contract=off','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sIMPORTED_MEMORY=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=2147483648','-sFILESYSTEM=0','-sABORTING_MALLOC=0','-sEXPORTED_FUNCTIONS=["_malloc","_free","_glue_attention","_glue_logits","_glue_stats","_glue_confidence"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAP32","HEAPF32"]','-o',str(out/'attention.js')],check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();files={name:dict(bytes=(out/name).stat().st_size,sha256=sha(out/name)) for name in ['attention.js','attention.wasm']};(out/'PINNED.json').write_text(json.dumps(dict(source=sha(root/'native/sparse-glue-paged.cpp'),files=files),indent=2)+'\n');(out/'MUSL-LICENSE.txt').write_bytes((root/'vendor/sparse-extract/MUSL-LICENSE.txt').read_bytes())
models={}
for kind in ['xfeat','aliked','sift']:
 p=root/'.build/m3/learned'/f'{kind}-sparse-glue-paged.json'
 if p.exists():models[kind]=json.loads(p.read_text())
(root/'src/sparse-glue-paged-assets.js').write_text('export const SPARSE_GLUE_PAGED_WASM='+json.dumps(files['attention.wasm'])+';\nexport const SPARSE_GLUE_PAGED_MODELS='+json.dumps(models)+';\n')
