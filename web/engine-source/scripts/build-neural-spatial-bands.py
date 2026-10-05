"""Fixed64MiB source-coordinate projection helper, independent of old runtimes."""
from pathlib import Path
import os,subprocess,json,hashlib
root=Path(__file__).resolve().parents[1];compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';version=subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0];assert '4.0.15' in version
out=root/'.build/neural-spatial-bands';out.mkdir(exist_ok=True);source=root/'native/neural-spatial-bands.cpp'
subprocess.run([str(compiler),str(source),'-O3','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sABORTING_MALLOC=0','-sALLOW_MEMORY_GROWTH=0','-sINITIAL_MEMORY=67108864','-sMAXIMUM_MEMORY=67108864','-sEXPORTED_FUNCTIONS=["_malloc","_free","_neural_spatial_rows"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]','-o',str(out/'spatial-bands.js')],check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();(out/'build.json').write_text(json.dumps(dict(schema=1,compiler=version,sourceSha256=sha(source),qualifiedReferenceSha256=sha(root/'experiments/d2prl/spatial.cpp'),memoryMaximumBytes=67108864,files={p.name:dict(bytes=p.stat().st_size,sha256=sha(p)) for p in [out/'spatial-bands.js',out/'spatial-bands.wasm']}),indent=2)+'\n')
