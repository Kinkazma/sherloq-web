#!/usr/bin/env python3
"""Build the pinned native RAW decoder. Requires Emscripten 4.0.15 and LibRaw sources."""
import argparse, concurrent.futures, hashlib, json, os, re, shutil, subprocess
from pathlib import Path

p=argparse.ArgumentParser();p.add_argument('--libraw-source',type=Path,required=True);p.add_argument('--emscripten-root',type=Path,required=True);p.add_argument('--build-dir',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--jobs',type=int,default=2);a=p.parse_args()
engine=Path(__file__).resolve().parents[1];src=a.libraw_source.resolve();build=a.build_dir.resolve();out=a.output.resolve();em=a.emscripten_root.resolve();build.mkdir(parents=True,exist_ok=True);out.mkdir(parents=True,exist_ok=True)
version=subprocess.check_output([str(em/'em++'),'--version'],text=True).splitlines()[0]
if '4.0.15' not in version:raise SystemExit('Emscripten 4.0.15 is required for the pinned codec.')
header=(src/'libraw/libraw_version.h').read_text()
if not all(re.search(r'#define\s+LIBRAW_'+part+r'_VERSION\s+'+str(value)+r'\b',header) for part,value in [('MAJOR',0),('MINOR',22),('PATCH',2)]):raise SystemExit('LibRaw 0.22.2 source is required.')
make=(src/'Makefile.am').read_text().split('lib_libraw_a_SOURCES = ',1)[1].split('\n\n',1)[0];sources=[src/name for name in re.findall(r'src/[\w/]+\.cpp',make)]
sources.append(engine/'native/libraw-native.cpp');flags=['-O3','-std=c++17','-fexceptions','-msimd128','-DLIBRAW_NOTHREADS','-DLIBRAW_NO_IOSTREAMS_DATASTREAM','-DUSE_JPEG','-DUSE_ZLIB','-DNO_LCMS','-sUSE_ZLIB=1','-sUSE_LIBJPEG=1','-I'+str(src)]
# Compile cache identity covers options and headers, not just source mtimes.
identity=hashlib.sha256(json.dumps([version,flags]).encode())
for path in sorted([*src.glob('libraw/*.h'),*src.glob('internal/*.h')]):identity.update(path.read_bytes())
configuration=identity.hexdigest()
def compile_one(path):
 name=hashlib.sha256(str(path).encode()).hexdigest()[:12]+'.o';obj=build/name
 stamp=build/(name+'.sha256');key=hashlib.sha256((configuration+hashlib.sha256(path.read_bytes()).hexdigest()).encode()).hexdigest()
 if not obj.exists() or not stamp.exists() or stamp.read_text()!=key:
  subprocess.run([str(em/'em++'),*flags,'-c',str(path),'-o',str(obj)],check=True);stamp.write_text(key)
 return obj
with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,a.jobs)) as pool:objects=list(pool.map(compile_one,sources))
exports=['malloc','free','raw_native_close','raw_native_error','raw_native_error_message','raw_native_version','raw_native_open','raw_native_open_sensor','raw_native_metadata','raw_native_sensor_metadata','raw_native_sensor_metadata_size','raw_native_unpack','raw_native_apply_vendor_crop','raw_native_sensor_channels','raw_native_sensor_float','raw_native_sensor_rows','raw_native_process','raw_native_width','raw_native_height','raw_native_warnings','raw_native_profile_data','raw_native_profile_size','raw_native_rows','raw_native_unpack_thumbnail','raw_native_thumbnail_width','raw_native_thumbnail_height','raw_native_thumbnail_format','raw_native_thumbnail_size','raw_native_thumbnail_data']
subprocess.run([str(em/'em++'),*flags,*map(str,objects),'-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sIMPORTED_MEMORY=1','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=4294967296','-sSTACK_SIZE=1048576','-sDISABLE_EXCEPTION_CATCHING=0','-sEXPORTED_FUNCTIONS='+json.dumps(['_'+x for x in exports]),'-sEXPORTED_RUNTIME_METHODS='+json.dumps(['UTF8ToString']),'-o',str(out/'libraw-native.js')],check=True)
for name in ['COPYRIGHT','LICENSE.LGPL','LICENSE.CDDL']:shutil.copy2(src/name,out/name)
ports=em/'cache/ports'
shutil.copy2(ports/'libjpeg/jpeg-9f/README',out/'LICENSE.IJG-README');shutil.copy2(ports/'zlib/zlib-1.3.1/LICENSE',out/'LICENSE.zlib')
record={'schema':'sherloq.native-libraw/1','libraw':{'version':'0.22.2','source':'https://www.libraw.org/data/LibRaw-0.22.2.tar.gz','sourceSha256':'de86b035655accff8d4010f1a221fdf50d353cb7b1422ba26f14a0db92612cfa'},'toolchain':'Emscripten4.0.15','ports':{'jpeg':{'version':'IJG9f','source':'https://storage.googleapis.com/webassembly/emscripten-ports/jpegsrc.v9f.tar.gz','sha512':'7f733d79cf176c690dcf127352f9aa7ec48000455944f286faae606cdeada6f6865b4a3f9f01bda8947b5b1089bb3e52d2b56879b6e871279ec5cbd1829304dc'},'zlib':{'version':'1.3.1','source':'https://github.com/madler/zlib/archive/refs/tags/v1.3.1.tar.gz','sha512':'8c9642495bafd6fad4ab9fb67f09b268c69ff9af0f4f20cf15dfc18852ff1f312bd8ca41de761b3f8d8e90e77d79f2ccacd3d4c5b19e475ecf09d021fdfe9088'}},'output':'Native developed linear RGB16; additive sensor-only unpack preserves unsigned/float32 samples before development, without RGB8 intermediary','threads':1,'heapMaximumBytes':4294967296,'externalColorManagement':'Output space is explicitly labelled; ICC/display conversion belongs to the shared color manager.','files':{name:{'bytes':(out/name).stat().st_size,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest()} for name in ['libraw-native.js','libraw-native.wasm','COPYRIGHT','LICENSE.LGPL','LICENSE.CDDL','LICENSE.IJG-README','LICENSE.zlib']}}
(out/'PINNED.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record))
pin=engine/'src/raw-native-resource.js'
if pin.exists():
 text=pin.read_text();wasm=record['files']['libraw-native.wasm'];text=re.sub(r"bytes:\d+,sha256:'[a-f0-9]{64}'",f"bytes:{wasm['bytes']},sha256:'{wasm['sha256']}'",text,count=1);pin.write_text(text)
