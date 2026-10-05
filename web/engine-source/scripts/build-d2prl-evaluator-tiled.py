"""Separate worker binary; scalar reference binary is not overwritten."""
from pathlib import Path
import os,subprocess,json,hashlib
root=Path(__file__).resolve().parents[1];compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
version=subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0];assert '4.0.15' in version
out=root/'.build/d2prl-evaluator-tiled';out.mkdir(exist_ok=True);source=root/'experiments/d2prl/evaluator-tiled.cpp'
cmd=[str(compiler),str(source),'-O3','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=',
 '-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0',
 '-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=536870912',
 '-sMEMORY_GROWTH_LINEAR_STEP=16777216','-sEXPORTED_FUNCTIONS=["_malloc","_free","_d2prl_evaluate_tile"]',
 '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]','-o',str(out/'evaluator-tiled.js')]
subprocess.run(cmd,check=True);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(out/'build.json').write_text(json.dumps(dict(schema=1,compiler=version,sources={p.name:sha(p) for p in [source,source.parent/'evaluator.cpp',source.parent/'reference-exp.h']},files={p.name:dict(bytes=p.stat().st_size,sha256=sha(p)) for p in [out/'evaluator-tiled.js',out/'evaluator-tiled.wasm']}),indent=2)+'\n')
