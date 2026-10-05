"""Build the bounded correlation candidate separately from qualified runtimes."""
from pathlib import Path
import os, subprocess, json, hashlib
root=Path(__file__).resolve().parents[1]
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
version=subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
assert '4.0.15' in version
out=root/'.build/cmseg-correlation';out.mkdir(exist_ok=True)
source=root/'experiments/segmentation/cmseg-correlation.cpp'
exports=['malloc','free','cmseg_normalize','cmseg_statistics','cmseg_topk']
subprocess.run([str(compiler),str(source),'-O3','-msimd128','-ffp-contract=off',
 '-ffile-prefix-map='+str(root)+'/=','-sMODULARIZE=1','-sEXPORT_ES6=1',
 '-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1',
 '-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=67108864','-sMEMORY_GROWTH_LINEAR_STEP=16777216',
 '-sEXPORTED_FUNCTIONS='+json.dumps(['_'+n for n in exports]),
 '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]','-o',str(out/'correlation.js')],check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(out/'build.json').write_text(json.dumps(dict(schema=1,compiler=version,maximumMemoryBytes=64*1024**2,
 sources={str(p.relative_to(root)):sha(p) for p in [source,root/'experiments/d2prl/reference-exp.h']},
 files={p.name:dict(bytes=p.stat().st_size,sha256=sha(p)) for p in [out/'correlation.js',out/'correlation.wasm']}),indent=2)+'\n')
print('Built bounded CMSeg correlation candidate',flush=True)
