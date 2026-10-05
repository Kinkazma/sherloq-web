"""Build only the isolated diagnostic; no qualified vendor file is overwritten."""
from pathlib import Path
import subprocess,os,json,hashlib
root=Path(__file__).resolve().parents[1];compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';version=subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0];assert '4.0.15' in version
out=root/'.build/cmseg-jpeg-probe';out.mkdir(exist_ok=True);source=root/'experiments/segmentation/cmseg-jpeg-probe.cpp'
subprocess.run([str(compiler),str(source),'-O3','-ffp-contract=off','-msimd128','-ffile-prefix-map='+str(root)+'=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=node','-sFILESYSTEM=0','-sINITIAL_MEMORY=33554432','-sMAXIMUM_MEMORY=33554432','-sEXPORTED_FUNCTIONS=["_malloc","_free","_probe_norm","_probe_dot"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32","HEAP32"]','-o',str(out/'probe.js')],check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();(out/'build.json').write_text(json.dumps(dict(compiler=version,sourceSha256=sha(source),files={p.name:sha(p) for p in [out/'probe.js',out/'probe.wasm']}),indent=2)+'\n')
