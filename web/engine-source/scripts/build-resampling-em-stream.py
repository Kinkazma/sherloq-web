"""Build the bounded global EM worker using pinned binary64 compatibility data."""
from pathlib import Path
import os,subprocess,json,hashlib,shutil
root=Path(__file__).resolve().parents[1];src=root/'vendor/resampling-em-source';out=root/'vendor/resampling-em';out.mkdir(exist_ok=True)
for item in json.loads((src/'NUMERICAL-DATA.json').read_text())['files']:assert hashlib.sha256((src/item['file']).read_bytes()).hexdigest()==item['sha256']
cc=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';assert '4.0.15' in subprocess.check_output([str(cc),'--version'],text=True).splitlines()[0]
exports=['malloc','free','em_stream_create','em_stream_batch','em_stream_finish','em_stream_weights','em_stream_iterations','em_stream_destroy','em_square','em_exp']
subprocess.run([str(cc),str(root/'native/resampling-em-stream.cpp'),'-O3','-fexceptions','-ffp-contract=off','-fno-builtin-pow','-ffile-prefix-map='+str(root)+'/=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=8388608','-sMAXIMUM_MEMORY=134217728','-sFILESYSTEM=0','-sDISABLE_EXCEPTION_CATCHING=0','-sABORTING_MALLOC=0','-sMEMORY_GROWTH_LINEAR_STEP=8388608','-sEXPORTED_FUNCTIONS='+json.dumps(['_'+n for n in exports]),'-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF64"]','-o',str(out/'resampling-em.js')],check=True)
shutil.copyfile(src/'OPENBLAS-NOTICES.txt',out/'OPENBLAS-NOTICES.txt')
