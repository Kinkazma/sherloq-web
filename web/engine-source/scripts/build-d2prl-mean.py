from pathlib import Path
import os,subprocess,json,hashlib
root=Path(__file__).resolve().parents[1];compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';version=subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0];assert '4.0.15' in version
out=root/'.build/d2prl-mean';out.mkdir(exist_ok=True);source=root/'experiments/d2prl/mean.cpp'
subprocess.run([str(compiler),str(source),'-O3','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=134217728','-sMEMORY_GROWTH_LINEAR_STEP=16777216','-sEXPORTED_FUNCTIONS=["_malloc","_free","_d2prl_mean_planes"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]','-o',str(out/'mean.js')],check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();(out/'build.json').write_text(json.dumps(dict(schema=1,compiler=version,sourceSha256=sha(source),referenceSumSha256=sha(root/'.build/torch28-reference/SumKernel.cpp'),files={p.name:dict(bytes=p.stat().st_size,sha256=sha(p)) for p in [out/'mean.js',out/'mean.wasm']}),indent=2)+'\n')
