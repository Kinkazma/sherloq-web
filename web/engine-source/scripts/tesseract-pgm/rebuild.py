"""Build the additional PGM-only runtime from the pinned complete source tree.

No network/installation/publishing. Inputs must be supplied in dedicated folders.
The unchanged complete CPU cores are never opened or overwritten by this script.
"""
from pathlib import Path
import argparse,hashlib,json,os,shutil,subprocess
parser=argparse.ArgumentParser();parser.add_argument('--core-source',type=Path,required=True);parser.add_argument('--emscripten',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--jobs',type=int,default=1);args=parser.parse_args()
here=Path(__file__).resolve().parent;core=args.core_source.resolve();em=args.emscripten.resolve();output=args.output.resolve();pin=json.loads((here/'PINNED.json').read_text())
if not 1<=args.jobs<=64:raise ValueError('jobs must be1..64')
for item in pin['files']:
 path=here/item['path']
 if hashlib.sha256(path.read_bytes()).hexdigest()!=item['sha256']:raise ValueError('Source overlay identity differs: '+item['path'])
for rel in ['third_party/leptonica','third_party/openlibm','third_party/tesseract','javascript/src/wrapper.cpp','javascript/glue.js','javascript/anterior.js']:
 if not(core/rel).exists():raise ValueError('Pinned complete source component missing: '+rel)
upstream=json.loads((here/'UPSTREAM-SOURCES.json').read_text())
for item in upstream['files']:
 path=core/item['path']
 if not path.is_file() or path.stat().st_size!=item['bytes'] or hashlib.sha256(path.read_bytes()).hexdigest()!=item['sha256']:raise ValueError('Pinned upstream input differs: '+item['path'])
if output.exists():raise FileExistsError('Choose a new output directory')
output.mkdir(parents=True);dep=output/'dependencies';llvm=em.parent/'bin';env={**os.environ,'PATH':str(llvm)+os.pathsep+str(em)+os.pathsep+os.environ.get('PATH','')};toolchain=em/'cmake/Modules/Platform/Emscripten.cmake'
def run(command):subprocess.run([str(x)for x in command],cwd=core,env=env,check=True)
# Apply only the four pinned source overlays inside the dedicated supplied tree.
tess=core/'third_party/tesseract'
for item in pin['files']:
 rel=Path(item['path']).relative_to('native');target=tess/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(here/item['path'],target)
cmake=tess/'CMakeLists.txt';cmake.write_text(cmake.read_text().replace('../../../javascript/',str(core/'javascript')+'/'))
common=['-DCMAKE_TOOLCHAIN_FILE='+str(toolchain),'-DCMAKE_POLICY_VERSION_MINIMUM=3.5','-DCMAKE_BUILD_TYPE=Release','-DBUILD_SHARED_LIBS=OFF','-DCMAKE_INSTALL_PREFIX='+str(dep)]
lept=core/'third_party/leptonica';leptbuild=output/'leptonica';disabled=['GIF','JPEG','PNG','TIFF','ZLIB','PkgConfig']
run(['cmake','-S',lept,'-B',leptbuild,*common,'-DBUILD_PROG=OFF','-DLIBWEBP_SUPPORT=OFF','-DOPENJPEG_SUPPORT=OFF','-DCMAKE_C_FLAGS=-O3 -ffp-contract=off -fno-fast-math',*['-DCMAKE_DISABLE_FIND_PACKAGE_'+x+'=TRUE'for x in disabled]])
run(['cmake','--build',leptbuild,'--parallel',args.jobs]);run(['cmake','--install',leptbuild])
run(['make','-C',core/'third_party/openlibm','ARCH=wasm32','CC='+str(llvm/'clang'),'AR='+str(llvm/'llvm-ar'),'prefix='+str(dep),'install-static','-j'+str(args.jobs)])
tessbuild=output/'tesseract';run(['cmake','-S',tess,'-B',tessbuild,*common,'-DCMAKE_PREFIX_PATH='+str(dep),'-DLeptonica_DIR='+str(leptbuild),'-DCMAKE_CXX_FLAGS=-O3 -ffp-contract=off -fno-fast-math -ffile-prefix-map='+str(core)+'=.', '-DWASM_BUILD=ON','-DFAST_FLOAT=ON','-DHAVE_SSE4_1=ON','-DHAVE_AVX=OFF','-DHAVE_AVX2=OFF','-DOPENMP_BUILD=OFF','-DBUILD_TRAINING_TOOLS=OFF','-DGRAPHICS_DISABLED=ON','-DDISABLED_LEGACY_ENGINE=ON','-DPACKAGE_VERSION='+pin['nativeVersion']])
run(['cmake','--build',tessbuild,'--target','tesseract-core-simd-lstm','--parallel',args.jobs])
js=(tessbuild/'bin/tesseract-core-simd-lstm.js').read_bytes()+b'\nexport default TesseractCore;\n';wasm=(tessbuild/'bin/tesseract-core-simd-lstm.wasm').read_bytes();artifacts=[]
for name,data in [('tesseract-pgm-lstm-gpu.mjs',js),('tesseract-pgm-lstm-gpu.wasm',wasm)]:
 (output/name).write_bytes(data);artifacts.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
(output/'artifacts.json').write_text(json.dumps({'sourceContract':pin,'artifacts':artifacts,'note':'Rebuilt output must pass the Native/API/Worker parity gates before replacing its resource identities.'},indent=2)+'\n')
