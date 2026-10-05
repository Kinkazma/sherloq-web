from pathlib import Path
import argparse,subprocess,os,json,hashlib
p=argparse.ArgumentParser();p.add_argument('--jpeg-build',type=Path,required=True);p.add_argument('--jpeg-source',type=Path,required=True);p.add_argument('--emsdk',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[1];out=root/'.build/catnet';out.mkdir(parents=True,exist_ok=True)
cmd=[str(a.emsdk/'upstream/emscripten/emcc'),str(root/'native/catnet-jpeg.c'),str(a.jpeg_build/'libjpeg.a'),'-I'+str(a.jpeg_build),'-I'+str(a.jpeg_source),'-O3','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sIMPORTED_MEMORY=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=2147483648','-sFILESYSTEM=0','-sEXPORTED_FUNCTIONS=["_malloc","_free","_catnet_coeff","_catnet_decode","_catnet_companion","_catnet_coeff_open","_catnet_coeff_rows","_catnet_coeff_close"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAP16","HEAPF32"]','-o',str(out/'jpeg.mjs')]
subprocess.run(cmd,check=True,env={**os.environ,'EM_FROZEN_CACHE':'1'})
(out/'jpeg-build.json').write_text(json.dumps(dict(sourceSha256=hashlib.sha256((root/'native/catnet-jpeg.c').read_bytes()).hexdigest(),librarySha256=hashlib.sha256((a.jpeg_build/'libjpeg.a').read_bytes()).hexdigest()),indent=2)+'\n')
