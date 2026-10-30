#!/usr/bin/env python3
"""Rebuild the unchanged baseline420 entropy stage from exact coefficients."""
import argparse,hashlib,json,os,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--emsdk',type=Path,required=True);p.add_argument('--jpeg-build',type=Path,required=True);p.add_argument('--jpeg-source',type=Path,required=True);p.add_argument('--output',type=Path);a=p.parse_args()
out=a.output or root/'vendor/ela-gpu/entropy';out.mkdir(parents=True,exist_ok=True);cc=a.emsdk/'upstream/emscripten/emcc'
cmd=[str(cc),str(root/'native/ela-gpu/jpeg-coeff-stream.c'),str(a.jpeg_build/'libjpeg.a'),'-I'+str(a.jpeg_build),'-I'+str(a.jpeg_source),'-O3','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=','-ffile-prefix-map='+str(a.jpeg_build)+'/=','-ffile-prefix-map='+str(a.jpeg_source)+'/=','-sASYNCIFY=1','-sASYNCIFY_STACK_SIZE=262144','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1','-sIMPORTED_MEMORY=1','-sABORTING_MALLOC=0','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=67108864','-sEXPORTED_FUNCTIONS=["_malloc","_free","_jpeg_coeff_encode","_jpeg_coeff_close","_jpeg_coeff_error"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAP16","ccall"]','-o',str(out/'jpeg-coeff-stream.js')]
subprocess.run(cmd,check=True,env=os.environ.copy())
(out/'LICENSE.md').write_bytes((root/'vendor/ela-gpu/LICENSE.md').read_bytes())
sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
(out/'PINNED.json').write_text(json.dumps(dict(schema=1,libjpeg='3.0.3',compiler=subprocess.check_output([str(cc),'--version'],text=True).splitlines()[0],sourceSha256=sha(root/'native/ela-gpu/jpeg-coeff-stream.c'),linkedLibrarySha256=sha(a.jpeg_build/'libjpeg.a'),memory='imported caller-bounded16–64MiB; encoded JPEG external; quantized coefficient input<=24MiB',files={n:dict(bytes=(out/n).stat().st_size,sha256=sha(out/n))for n in ['jpeg-coeff-stream.js','jpeg-coeff-stream.wasm','LICENSE.md']}),indent=2)+'\n')
