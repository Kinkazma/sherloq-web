"""Additive bounded native-channel JPEG codec; shared inputs remain read-only."""
from pathlib import Path
import hashlib,json,os,subprocess
root=Path(__file__).resolve().parents[1]
sdk=Path(os.environ['EMSDK']).resolve();build=Path(os.environ['JPEG_BUILD_ROOT']).resolve()
out=root/'sherloq-browser/assets/vendor/local-jpeg-color';out.mkdir(parents=True,exist_ok=True)
cc=sdk/'upstream/emscripten/emcc';env={**os.environ,'EM_FROZEN_CACHE':'1','EMCC_CORES':'1','BINARYEN_CORES':'1'}
version=subprocess.check_output([str(cc),'--version'],env=env,text=True).splitlines()[0]
assert '4.0.15' in version,'Use the qualified Emscripten version'
source=root/'native/local-jpeg-color.c';lib=build/'jpeg/libjpeg.a'
exports=['_native_color_'+name for name in ['decode','close','error','channels','adobe_inverted','progressive']]
subprocess.run([str(cc),str(source),str(lib),'-I'+str(build/'libjpeg-turbo-3.0.3'),'-I'+str(build/'jpeg'),'-O3','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=','-ffile-prefix-map='+str(build)+'/=dependencies/','-ffile-prefix-map='+str(sdk)+'/=toolchain/','-sASYNCIFY=1','-sASYNCIFY_STACK_SIZE=262144','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1','-sIMPORTED_MEMORY=1','-sABORTING_MALLOC=0','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=67108864','-sEXPORTED_FUNCTIONS='+json.dumps(exports),'-sEXPORTED_RUNTIME_METHODS=["HEAPU8","ccall"]','-o',str(out/'jpeg-color.js')],env=env,check=True)
for name in ['LICENSE.md','README.ijg']:(out/name).write_bytes((build/'libjpeg-turbo-3.0.3'/name).read_bytes())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
pins={name:{'sha256':sha(out/name),'bytes':(out/name).stat().st_size}for name in ['jpeg-color.js','jpeg-color.wasm','LICENSE.md','README.ijg']}
record={'compiler':version,'libjpeg':'3.0.3','librarySha256':sha(lib),'sourceSha256':sha(source),'memory':'Caller-admitted imported64MiB maximum;8MiB native coefficient cache; progressive backing through existing temporary stores;≤1MiB decoded bands;64KiB input; no full decoded WASM frame','files':pins}
(out/'PINNED.json').write_text(json.dumps(record,indent=2)+'\n')
pin=pins['jpeg-color.wasm'];(root/'sherloq-browser/assets/native-jpeg-color-resource.js').write_text('export const NATIVE_JPEG_COLOR_RESOURCE=Object.freeze('+json.dumps({'url':'./vendor/local-jpeg-color/jpeg-color.wasm',**pin})+');\n')
print(json.dumps({'wasm':pin,'files':len(pins)}))
