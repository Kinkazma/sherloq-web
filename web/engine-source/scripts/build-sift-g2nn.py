"""Build M3's independent bounded exact matcher; no shared build writes."""
from pathlib import Path
import os, subprocess, hashlib, json
root=Path(__file__).resolve().parents[1]
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
assert '4.0.15' in subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
out=root/'vendor/sift-g2nn';out.mkdir(exist_ok=True)
subprocess.run([str(compiler),str(root/'native/sift-g2nn.cpp'),'-O3','-ffp-contract=off',
 '-ffile-prefix-map='+str(root)+'/=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node',
 '-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=1048576','-sSTACK_SIZE=65536','-sMAXIMUM_MEMORY=1073741824',
 '-sMEMORY_GROWTH_LINEAR_STEP=1048576','-sFILESYSTEM=0',
 '-sEXPORTED_FUNCTIONS=["_malloc","_free","_sift_g2nn_top4","_sift_g2nn_precomputed","_sift_g2nn_accumulate"]',
 '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF64"]','-o',str(out/'sift-g2nn.js')],check=True)
(out/'PINNED.json').write_text(json.dumps({'schema':1,'emscripten':'4.0.15','build':'scripts/build-sift-g2nn.py',
 'sourceSha256':hashlib.sha256((root/'native/sift-g2nn.cpp').read_bytes()).hexdigest(),
 'files':{n:{'bytes':(out/n).stat().st_size,'sha256':hashlib.sha256((out/n).read_bytes()).hexdigest()} for n in ['sift-g2nn.js','sift-g2nn.wasm']}},indent=2)+'\n')
