"""Build the small additive scoped operator; never overwrite a pinned kernel."""
from pathlib import Path
import os,subprocess,hashlib,json
root=Path(__file__).resolve().parents[1]
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
version=subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
assert '4.0.15' in version
out=root/'vendor/segmentation/scientific-correlation';out.mkdir(exist_ok=True)
source=root/'experiments/segmentation/cmseg-scientific-correlation.cpp'
functions=['malloc','free','cmseg_scoped_normalize','cmseg_scoped_statistics','cmseg_scoped_topk','cmseg_scoped_statistics_dots','cmseg_scoped_topk_dots']
subprocess.run([str(compiler),str(source),'-O3','-msimd128','-ffp-contract=off','-ffile-prefix-map='+str(root)+'=',
 '-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sABORTING_MALLOC=0',
 '-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=67108864','-sMEMORY_GROWTH_LINEAR_STEP=16777216',
 '-sEXPORTED_FUNCTIONS='+json.dumps(['_'+f for f in functions]),'-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]','-o',str(out/'correlation.js')],check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
proof={'schema':1,'compiler':version,'sourceSha256':sha(source),'files':{p.name:{'bytes':p.stat().st_size,'sha256':sha(p)} for p in (out/'correlation.js',out/'correlation.wasm')},'scope':'Additive masked source/target correlations; original unscoped operators and model weights unchanged.'}
(out/'build.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps(proof),flush=True)
