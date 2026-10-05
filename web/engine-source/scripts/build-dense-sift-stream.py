"""Link the pinned VLFeat objects built by build-dense-math.py, with bounded APIs."""
from pathlib import Path
import os,json,subprocess,sys,shutil
root=Path(__file__).resolve().parents[1];build=root/'.build/dense';out=root/'vendor/dense-sift-stream';out.mkdir(exist_ok=True)
objects=[build/f'{i}.o' for i in [0,1,2,3,4,5,6,9]]
if not all(p.exists() for p in objects):subprocess.run([sys.executable,str(root/'scripts/build-dense-math.py')],check=True)
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
functions=['malloc','free','sherloq_sift_inputs','sherloq_sift_pack_range','sift_stream_columns','sift_stream_factors','sift_stream_bounds']
subprocess.run([str(compiler),str(root/'native/dense-sift-stream.cpp'),*[str(p) for p in objects],'-std=c++17','-O3','-ffp-contract=off','-fexceptions','-ffile-prefix-map='+str(root)+'/=',
 '-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sINITIAL_MEMORY=8388608','-sMAXIMUM_MEMORY=134217728','-sSTACK_SIZE=1048576','-sALLOW_MEMORY_GROWTH=1','-sABORTING_MALLOC=0','-sDISABLE_EXCEPTION_CATCHING=0',
 '-sEXPORTED_FUNCTIONS='+json.dumps(['_'+s for s in functions]),'-sEXPORTED_RUNTIME_METHODS='+json.dumps(['HEAPU8','HEAPF32']),'-o',str(out/'dense-sift-stream.js')],check=True)
for name in ['GPLv3.txt','LICENSE-VLFEAT.txt']:shutil.copyfile(root/'vendor/dense'/name,out/name)
