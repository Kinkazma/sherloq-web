"""Build the shared HDR reader against pinned libavif/dav1d, never opaque binaries.

EMSDK must identify Emscripten4.0.15. MEDIA_CODEC_SOURCES provides libavif1.4.2.
DAV1D_SOURCES optionally supplies verified dav1d1.5.4, otherwise its official
archive is downloaded and checked. CODEC_BUILD_JOBS defaults to2 (maximum4). Use --100mp for the checked guard.
ST and MT export the same hdr_avif_* entry points from native/avif-hdr-decode.c.
"""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,sys,tarfile,urllib.request
ROOT=Path(__file__).resolve().parents[1]
DAV1D_VERSION='1.5.4'
DAV1D_URL='https://downloads.videolan.org/pub/videolan/dav1d/1.5.4/dav1d-1.5.4.tar.xz'
DAV1D_SHA='686616b7c69eb88d44459391ab25cac13b6647a3b288835c5784e71c1514a5c5'
LIBAVIF_SHA='2b645287340ba5a631d268b551dc2d72bd73ac33335962dd36dcdb6d8366921d'
SDK=Path(os.environ['EMSDK']).resolve();SOURCES=Path(os.environ['MEDIA_CODEC_SOURCES']).resolve()
WORK=Path(os.environ.get('DAV1D_CODEC_BUILD',ROOT/'.build/avif-hdr-dav1d')).resolve();WORK.mkdir(parents=True,exist_ok=True)
VARIANT=sys.argv[1] if len(sys.argv)>1 else 'st';assert VARIANT in ('st','mt');MT=VARIANT=='mt';CHECKED='--100mp' in sys.argv[2:]
if CHECKED:
 patched=WORK/'sources-100mp'
 if not (patched/'dav1d-1.5.4/src/mem.h').is_file():subprocess.run([sys.executable,ROOT/'scripts/patch-avif-dav1d-100mp.py'],env=os.environ,check=True)
 os.environ.setdefault('DAV1D_SOURCES',str(patched/'dav1d-1.5.4'));os.environ.setdefault('LIBAVIF_SOURCES',str(patched/'libavif-1.4.2'))
 os.environ.setdefault('DAV1D_BUILD_SUFFIX','-100mp')
JOBS=str(max(1,min(4,int(os.environ.get('CODEC_BUILD_JOBS','2')))))
TOOLS=Path(os.environ.get('DAV1D_BUILD_TOOLS',WORK/'tools-venv/bin'))
ENV={**os.environ,'EM_CONFIG':str(SDK/'.emscripten'),'EMCC_CORES':JOBS,'CMAKE_BUILD_PARALLEL_LEVEL':JOBS}
ENV['PATH']=str(TOOLS)+os.pathsep+str(SDK/'upstream/emscripten')+os.pathsep+ENV['PATH']
CC=SDK/'upstream/emscripten/emcc';EMCMAKE=SDK/'upstream/emscripten/emcmake'
def run(args):
 if os.environ.get('DAV1D_LINK_ONLY')=='1' and str(args[0]) in ('meson','cmake',str(EMCMAKE)):return
 subprocess.run([str(a) for a in args],env=ENV,check=True)
assert '4.0.15' in subprocess.check_output([str(CC),'--version'],env=ENV,text=True)
for tool in ('meson','ninja','cmake'):assert shutil.which(tool,path=ENV['PATH']),f'Missing build tool: {tool}'
ARCHIVE=WORK/'dav1d-1.5.4.tar.xz'
if not ARCHIVE.exists():ARCHIVE.write_bytes(urllib.request.urlopen(DAV1D_URL).read())
assert hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()==DAV1D_SHA,'Pinned dav1d archive differs'
DAV1D=Path(os.environ.get('DAV1D_SOURCES',WORK/'dav1d-1.5.4'))
if not DAV1D.exists():
 with tarfile.open(ARCHIVE) as archive:archive.extractall(WORK,filter='data')
AVIF=Path(os.environ.get('LIBAVIF_SOURCES',SOURCES/'libavif-1.4.2'));assert (AVIF/'src/codec_dav1d.c').is_file()
FLAGS=['-O3','-flto','-msimd128','-mbulk-memory']+(['-pthread'] if MT else [])
suffix=os.environ.get('DAV1D_BUILD_SUFFIX','');PREFIX=WORK/('prefix-'+VARIANT+suffix);BUILD=WORK/('dav1d-'+VARIANT+suffix);AVIF_BUILD=WORK/('avif-'+VARIANT+suffix)
CROSS=WORK/('cross-'+VARIANT+'.ini')
CROSS.write_text("[binaries]\nc = 'emcc'\ncpp = 'em++'\nar = 'emar'\nnm = 'emnm'\nranlib = 'emranlib'\nstrip = 'emstrip'\nexe_wrapper = 'node'\n[built-in options]\nc_args = "+repr(FLAGS)+"\nc_link_args = "+repr(FLAGS)+"\ndefault_library = 'static'\n[properties]\nneeds_exe_wrapper = true\nskip_sanity_check = true\n[host_machine]\nsystem = 'emscripten'\ncpu_family = 'wasm32'\ncpu = 'wasm32'\nendian = 'little'\n")
if not (BUILD/'build.ninja').exists():run(['meson','setup',BUILD,DAV1D,'--cross-file',CROSS,'--prefix',PREFIX,'--libdir','lib','--default-library=static','--buildtype=release','-Db_lto=true','-Denable_asm=false','-Denable_tools=false','-Denable_examples=false','-Denable_tests=false','-Denable_docs=false','-Dlogging=false','-Dbitdepths=8,16'])
run(['meson','compile','-C',BUILD,'-j',JOBS]);run(['meson','install','-C',BUILD])
run([EMCMAKE,'cmake','-S',AVIF,'-B',AVIF_BUILD,'-DCMAKE_BUILD_TYPE=Release','-DBUILD_SHARED_LIBS=OFF','-DAVIF_CODEC_DAV1D=SYSTEM','-DAVIF_CODEC_AOM=OFF','-DAVIF_CODEC_LIBGAV1=OFF','-DAVIF_CODEC_SVT=OFF','-DAVIF_CODEC_RAV1E=OFF','-DAVIF_LIBYUV=OFF','-DAVIF_BUILD_APPS=OFF','-DAVIF_BUILD_TESTS=OFF',f'-DDAV1D_INCLUDE_DIR={PREFIX/"include"}',f'-DDAV1D_LIBRARY={PREFIX/"lib/libdav1d.a"}',f'-DCMAKE_C_FLAGS={" ".join(FLAGS)}',f'-DCMAKE_CXX_FLAGS={" ".join(FLAGS)}'])
run(['cmake','--build',AVIF_BUILD,'-j',JOBS])
OUT=ROOT/'vendor/avif-hdr-dav1d';OUT.mkdir(parents=True,exist_ok=True)
ENTRY=Path(os.environ.get('HDR_ENTRY',ROOT/'native/avif-hdr-decode.c'));entry_bytes=ENTRY.read_bytes();SNAPSHOT=WORK/('entry-'+VARIANT+'.c');SNAPSHOT.write_bytes(entry_bytes)
run([CC,SNAPSHOT,f'-I{AVIF/"include"}',AVIF_BUILD/'libavif.a',PREFIX/'lib/libdav1d.a',*FLAGS,'-sMODULARIZE=1','-sEXPORT_ES6=1','-sEXPORT_NAME=createAvifHdr','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sABORTING_MALLOC=0','-sIMPORTED_MEMORY=1','-sINITIAL_MEMORY=33554432','-sMAXIMUM_MEMORY=4294967296','-sSTACK_SIZE=2097152','-sFILESYSTEM=0','-sEXPORTED_FUNCTIONS=["_malloc","_free"]','-sEXPORTED_RUNTIME_METHODS='+json.dumps(['UTF8ToString','PThread'] if MT else ['UTF8ToString']),*(['-sDEFAULT_PTHREAD_STACK_SIZE=1048576',"-sPTHREAD_POOL_SIZE=Module['workerCount'] || 1"] if MT else []),'-ffile-prefix-map='+str(ROOT)+'/=','-ffile-prefix-map='+str(SOURCES)+'/=','-ffile-prefix-map='+str(WORK)+'/=','-o',OUT/('avif-hdr-dav1d-'+VARIANT+'.mjs')])
for source,target in [(DAV1D/'COPYING','DAV1D-COPYING'),(AVIF/'LICENSE','LIBAVIF-LICENSE')]:shutil.copyfile(source,OUT/target)
files={p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(OUT.glob('avif-hdr-dav1d-'+VARIANT+'*'))}
(OUT/('BUILD-'+VARIANT+'.json')).write_text(json.dumps({'schema':'sherloq.avif-hdr-dav1d-build/1','variant':VARIANT,'toolchain':'Emscripten4.0.15','compilerFlags':FLAGS,'libavif':{'version':'1.4.2','archiveSha256':LIBAVIF_SHA},'dav1d':{'version':DAV1D_VERSION,'archive':DAV1D_URL,'archiveSha256':DAV1D_SHA,'license':'BSD-2-Clause'},'entrySourceSha256':hashlib.sha256(entry_bytes).hexdigest(),'importedMemoryMaximumBytes':4294967296,'pthreadStackBytes':1048576 if MT else 0,'threadCount':'caller-admitted workerCount' if MT else 1,'maximum32BitFramePixels':100000000 if suffix=='-100mp' else 8192**2,'sourcePatch':{'file':'patches/checked-32bit-100mp.patch','sha256':hashlib.sha256((OUT/'patches/checked-32bit-100mp.patch').read_bytes()).hexdigest()} if suffix=='-100mp' else None,'files':files},indent=2)+'\n')

pins={}
for variant in ('st','mt'):
 path=OUT/('avif-hdr-dav1d-'+variant+'.wasm')
 if path.exists():pins[variant]={'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
lines=['// Generated from pinned upstream sources by scripts/build-avif-hdr-dav1d.py.','export const AVIF_HDR_DAV1D_RESOURCES=Object.freeze({']
for mode,pin in pins.items():lines.append(f" {mode}:Object.freeze({{url:new URL('../vendor/avif-hdr-dav1d/avif-hdr-dav1d-{mode}.wasm',import.meta.url).href,bytes:{pin['bytes']},sha256:'{pin['sha256']}'}}),")
lines+=['});',''];(ROOT/'src/avif-hdr-dav1d-resources.js').write_text('\n'.join(lines))
