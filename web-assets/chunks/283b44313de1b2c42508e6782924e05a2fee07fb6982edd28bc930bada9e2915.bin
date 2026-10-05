"""Build the public PQ10 SDR-content encoder against pinned libavif/libaom.

Downloaded source archives are under .build/media-codecs (see PINNED.json).
The output contains standard colour maths only; no private HDR proxy sources.
"""
import os
from pathlib import Path
import subprocess
import sys

root=Path(__file__).resolve().parents[1]
work=root/'.build/media-codecs'
sdk=root.parent/'web-engine/.build/emsdk-4.0.15'
env=os.environ.copy()
env['EM_CONFIG']=str(sdk/'.emscripten')
env['PATH']=str(sdk/'upstream/emscripten')+':'+str(sdk/'node/22.16.0_64bit/bin')+':'+env['PATH']
kind=sys.argv[1] if len(sys.argv)>1 else 'st'
assert kind in ['st','mt']
mt=kind=='mt'
flags='-O3 -msimd128'+(' -pthread' if mt else '')
def run(args):
    print(' '.join(str(a) for a in args),flush=True)
    subprocess.run([str(a) for a in args],env=env,check=True)
aom=work/('aom-'+kind);aom.mkdir(exist_ok=True)
if not (aom/'libaom.a').exists() or '--rebuild' in sys.argv:
 run(['emcmake','cmake','-S',work/'aom-3.14.1','-B',aom,'-DCMAKE_BUILD_TYPE=Release','-DAOM_TARGET_CPU=generic',f'-DCONFIG_MULTITHREAD={int(mt)}','-DCONFIG_AV1_DECODER=0','-DCONFIG_AV1_HIGHBITDEPTH=1','-DCONFIG_RUNTIME_CPU_DETECT=0','-DENABLE_DOCS=0','-DENABLE_EXAMPLES=0','-DENABLE_TESTDATA=0','-DENABLE_TESTS=0','-DENABLE_TOOLS=0',f'-DCMAKE_C_FLAGS={flags}',f'-DCMAKE_CXX_FLAGS={flags}'])
 run(['cmake','--build',aom,'-j','8'])
avif=work/('libavif-'+kind);avif.mkdir(exist_ok=True)
if not (avif/'libavif.a').exists() or '--rebuild' in sys.argv:
 run(['emcmake','cmake','-S',work/'libavif-1.4.2','-B',avif,'-DCMAKE_BUILD_TYPE=Release','-DBUILD_SHARED_LIBS=OFF','-DAVIF_CODEC_AOM=SYSTEM','-DAVIF_CODEC_AOM_DECODE=OFF','-DAVIF_LIBYUV=OFF','-DAVIF_BUILD_APPS=OFF','-DAVIF_BUILD_TESTS=OFF',f'-DAOM_INCLUDE_DIR={work/"aom-3.14.1"}',f'-DAOM_LIBRARY={aom/"libaom.a"}',f'-DCMAKE_C_FLAGS={flags}',f'-DCMAKE_CXX_FLAGS={flags}'])
 run(['cmake','--build',avif,'-j','8'])
out=root/'vendor/media/avif';out.mkdir(parents=True,exist_ok=True)
run(['emcc',root/'native/avif-public-export.c',f'-I{work/"libavif-1.4.2/include"}',avif/'libavif.a',aom/'libaom.a',*flags.split(),'-sMODULARIZE=1','-sEXPORT_ES6=1','-sEXPORT_NAME=createPublicAvif','-sENVIRONMENT=web,worker','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=33554432','-sSTACK_SIZE=5242880','-sDEFAULT_PTHREAD_STACK_SIZE=2097152','-sMAXIMUM_MEMORY=4294967296','-sFILESYSTEM=0','--post-js',root/'native/avif-public-post.js','-sEXPORTED_FUNCTIONS=["_malloc","_free"]','-sEXPORTED_RUNTIME_METHODS=["UTF8ToString"]',*(["-sPTHREAD_POOL_SIZE=Module['workerCount'] || 1"] if mt else []),'-o',out/f'avif-{kind}.js'])
