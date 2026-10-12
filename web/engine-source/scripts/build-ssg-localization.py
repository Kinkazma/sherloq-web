"""Build the independently written SSG localization math; no restricted model."""
from pathlib import Path
import argparse,hashlib,json,os,subprocess
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'vendor/ssg-full'
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--emsdk',type=Path,required=True);a=p.parse_args()
exports=['malloc','free','ssg_full_blur','ssg_full_roi','ssg_full_localize','ssg_full_ssim','ssg_full_salience','ssg_full_set_team','ssg_full_shutdown','ssg_full_morph','ssg_full_phrases']
cmd=[str(a.emsdk/'upstream/emscripten/em++'),str(OUT/'localization.cpp'),'-I'+str(ROOT/'vendor/pocketfft'),'-O3','-std=c++17','-ffp-contract=off','-fexceptions','-sDISABLE_EXCEPTION_CATCHING=0','-DPOCKETFFT_NO_MULTITHREADING','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=node,web,worker','-sFILESYSTEM=0','-sIMPORTED_MEMORY=1','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=33554432','-sMAXIMUM_MEMORY=2147483648','-sABORTING_MALLOC=0','-sSTACK_SIZE=1048576','-sEXPORTED_FUNCTIONS='+json.dumps(['_'+x for x in exports]),'-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF64","HEAPU32"]','-o',str(OUT/'localization.mjs')]
subprocess.run(cmd,check=True,env=dict(os.environ,EM_CONFIG=str(a.emsdk/'.emscripten')))
p=OUT/'localization.mjs';s=p.read_text();m='var getHeapMax=()=>2147483648;';assert s.count(m)==1;p.write_text(s.replace(m,'var getHeapMax=()=>Module["maximumHeapBytes"]??2147483648;'))
threaded=cmd.copy();threaded[threaded.index('-o')+1]=str(OUT/'localization-shared.mjs');threaded+=['-pthread','-sPTHREAD_POOL_SIZE=Module["workerCount"]||1','-sPTHREAD_POOL_SIZE_STRICT=2'];subprocess.run(threaded,check=True,env=dict(os.environ,EM_CONFIG=str(a.emsdk/'.emscripten')))
p=OUT/'localization-shared.mjs';s=p.read_text();assert s.count(m)==1;p.write_text(s.replace(m,'var getHeapMax=()=>Module["maximumHeapBytes"]??2147483648;'))
record=dict(schema=1,compiler='Emscripten4.0.15',definition='independent SSG full localization; no MATLAB runtime or literal script parity claim',command=cmd,files={p.name:dict(bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in [OUT/'localization.cpp',OUT/'localization-parallel.h',OUT/'nearest.h',ROOT/'vendor/pocketfft/pocketfft_hdronly.h',OUT/'localization.mjs',OUT/'localization.wasm',OUT/'localization-shared.mjs',OUT/'localization-shared.wasm']})
(OUT/'localization-build.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record['files']))
