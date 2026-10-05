"""Offline, bounded evaluator candidate. Generated binaries stay private in .build."""
from pathlib import Path
import os, subprocess, json, hashlib
root=Path(__file__).resolve().parents[1]
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
version=subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
assert '4.0.15' in version
out=root/'.build/d2prl-evaluator';out.mkdir(exist_ok=True)
source=root/'experiments/d2prl/evaluator.cpp'
cmd=[str(compiler),str(source),'-O3','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=',
 '-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0',
 '-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=536870912',
 '-sMEMORY_GROWTH_LINEAR_STEP=16777216','-sEXPORTED_FUNCTIONS=["_d2prl_evaluate_range","_d2prl_softmax_probe","_d2prl_softmax_planes","_d2prl_exp_values","_malloc","_free"]',
 '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]','-o',str(out/'evaluator.js')]
subprocess.run(cmd,check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(out/'build.json').write_text(json.dumps(dict(schema=1,compiler=version,sourceSha256=sha(source),referenceExpSha256=sha(source.parent/'reference-exp.h'),files={p.name:dict(bytes=p.stat().st_size,sha256=sha(p)) for p in [out/'evaluator.js',out/'evaluator.wasm']}),indent=2)+'\n')
