from pathlib import Path
import os,subprocess,hashlib,json,shutil
root=Path(__file__).resolve().parents[1];external=Path(os.environ['JPEG_BUILD_ROOT']);compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/emcc';out=root/'vendor/jpeg-gray';out.mkdir(exist_ok=True)
assert '4.0.15' in subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
lib=external/'jpeg/libjpeg.a'
subprocess.run([str(compiler),str(root/'native/jpeg-gray-rows.c'),str(lib),'-I',str(external/'libjpeg-turbo-3.0.3'),'-I',str(external/'jpeg'),'-O3','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=8388608','-sMAXIMUM_MEMORY=536870912','-sMEMORY_GROWTH_LINEAR_STEP=4194304','-sABORTING_MALLOC=0','-sFILESYSTEM=0','-sEXPORTED_FUNCTIONS=["_malloc","_free","_jpeg_rows_open","_jpeg_rows_read","_jpeg_rows_finish","_jpeg_rows_close","_jpeg_rows_error"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8"]','-o',str(out/'jpeg-gray.js')],check=True)
for name in ['LICENSE.md','README.ijg']:
 shutil.copyfile(external/'libjpeg-turbo-3.0.3'/name,out/name)
(out/'PINNED.json').write_text(json.dumps(dict(libjpeg='3.0.3',emscripten='4.0.15',librarySha256=hashlib.sha256(lib.read_bytes()).hexdigest()),indent=2)+'\n')
