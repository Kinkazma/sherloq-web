from pathlib import Path
import os,subprocess,json,hashlib,shutil
root=Path(__file__).resolve().parents[1];build=Path(os.environ['OPENCV_BUILD_ROOT']);compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';out=root/'vendor/research-prepare';out.mkdir(exist_ok=True)
cmd=[str(compiler),str(root/'native/research-prepare.cpp')]
for name in ['imgproc','core']:cmd.extend([str(build/f'cv/lib/libopencv_{name}.a'),'-I',str(build/f'opencv-4.11.0/modules/{name}/include')])
cmd.extend([str(build/'cv/3rdparty/lib/libzlib.a'),'-I',str(build/'cv'),'-O3','-fexceptions','-ffp-contract=off','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sIMPORTED_MEMORY=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=2147483648','-sFILESYSTEM=0','-sABORTING_MALLOC=0','-sEXPORTED_FUNCTIONS=["_malloc","_free","_research_prepare"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]','-o',str(out/'prepare.js')]);subprocess.run(cmd,check=True)
shutil.copyfile(root/'vendor/sparse-extract/LICENSE',out/'LICENSE');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();files={p.name:dict(bytes=p.stat().st_size,sha256=sha(p)) for p in out.iterdir() if p.name!='PINNED.json'}
(out/'PINNED.json').write_text(json.dumps(dict(schema=1,opencv='4.11.0',source=sha(root/'native/research-prepare.cpp'),files=files),indent=2)+'\n');(root/'src/research-prepare-assets.js').write_text('export const RESEARCH_PREPARE_WASM=Object.freeze('+json.dumps(files['prepare.wasm'])+');\n')
