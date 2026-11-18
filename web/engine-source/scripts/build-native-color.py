#!/usr/bin/env python3
"""Build pinned LittleCMS 2.19.1 using Emscripten 4.0.15."""
import argparse,concurrent.futures,hashlib,json,re,shutil,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--lcms-source',type=Path,required=True);p.add_argument('--emscripten-root',type=Path,required=True);p.add_argument('--build-dir',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--jobs',type=int,default=2);a=p.parse_args()
engine=Path(__file__).resolve().parents[1];src=a.lcms_source.resolve();em=a.emscripten_root.resolve();build=a.build_dir.resolve();out=a.output.resolve();build.mkdir(parents=True,exist_ok=True);out.mkdir(parents=True,exist_ok=True)
version=subprocess.check_output([str(em/'emcc'),'--version'],text=True).splitlines()[0]
if '4.0.15' not in version:raise SystemExit('Emscripten 4.0.15 required.')
# The official 2.19.1 hotfix deliberately keeps its ABI/header version 2.19.
if not re.search(r'#define\s+LCMS_VERSION\s+2190\b',(src/'include/lcms2.h').read_text()) or 'AC_INIT(lcms2,2.19)' not in (src/'configure.ac').read_text():raise SystemExit('Pinned LittleCMS 2.19.1 source archive required.')
sources=sorted((src/'src').glob('*.c'))+[engine/'native/color-managed-native.c'];flags=['-O3','-std=c11','-msimd128','-DCMS_NO_PTHREADS','-I'+str(src/'include'),'-I'+str(src/'src'),'-ffile-prefix-map='+str(src)+'/=lcms2/','-ffile-prefix-map='+str(engine)+'/=engine/','-ffile-prefix-map='+str(em)+'/=toolchain/']
identity=hashlib.sha256(json.dumps([version,flags]).encode())
for path in sorted([*src.glob('include/*.h'),*src.glob('src/*.h')]):identity.update(path.read_bytes())
configuration=identity.hexdigest()
def compile_one(path):
 name=hashlib.sha256(str(path).encode()).hexdigest()[:12]+'.o';obj=build/name;stamp=build/(name+'.sha256');key=hashlib.sha256((configuration+hashlib.sha256(path.read_bytes()).hexdigest()).encode()).hexdigest()
 if not obj.exists() or not stamp.exists() or stamp.read_text()!=key:subprocess.run([str(em/'emcc'),*flags,'-c',str(path),'-o',str(obj)],check=True);stamp.write_text(key)
 return obj
with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,a.jobs)) as pool:objects=list(pool.map(compile_one,sources))
exports=['malloc','free','color_native_error','color_native_version','color_native_create','color_native_convert','color_native_delete','color_native_srgb_profile','color_native_xyz_profile','color_native_profile_metadata','color_native_profile_trc','color_native_rgb_profile','color_native_nominal_profile','color_native_pipeline_metadata','color_native_pipeline_stage_size','color_native_pipeline_stage_copy']
subprocess.run([str(em/'emcc'),*flags,*map(str,objects),'-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sIMPORTED_MEMORY=1','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=4294967296','-sSTACK_SIZE=1048576','-sEXPORTED_FUNCTIONS='+json.dumps(['_'+x for x in exports]),'-sEXPORTED_RUNTIME_METHODS='+json.dumps(['UTF8ToString']),'-o',str(out/'color-managed-native.js')],check=True)
shutil.copy2(src/'LICENSE',out/'LICENSE');record={'schema':'sherloq.native-color/1','library':'LittleCMS2.19.1','source':'https://github.com/mm2/Little-CMS/releases/download/lcms2.19.1/lcms2-2.19.1.tar.gz','sourceSha256':'bfc54f7bab59fbc921012014a8032e4cba4abd46db47d46b76416a8c0b2815c8','toolchain':'Emscripten4.0.15','threads':1,'heapMaximumBytes':4294967296,'files':{name:{'bytes':(out/name).stat().st_size,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest()} for name in ['color-managed-native.js','color-managed-native.wasm','LICENSE']}}
(out/'PINNED.json').write_text(json.dumps(record,indent=2)+'\n');pin=engine/'src/color-managed-resource.js'
if pin.exists():
 text=pin.read_text();w=record['files']['color-managed-native.wasm'];pin.write_text(re.sub(r"bytes:\d+,sha256:'[a-f0-9]{64}'",f"bytes:{w['bytes']},sha256:'{w['sha256']}'",text,count=1))
print(json.dumps(record))
