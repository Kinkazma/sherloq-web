"""Private additive RGB16 codecs. Shared SDK and native libraries are read-only."""
from pathlib import Path
import hashlib,json,os,subprocess
ROOT=Path(__file__).resolve().parents[1]
BUILD=Path(os.environ['OPENCV_BUILD_ROOT']);CC=Path(os.environ['EMSDK'])/'upstream/emscripten/emcc'
env={**os.environ,'EM_FROZEN_CACHE':'1','EMCC_CORES':'1'}
# Remap each local compilation prefix, including the separately built libtiff object.
prefix_maps=['-ffile-prefix-map='+str(BUILD.resolve())+'/=dependencies/', '-ffile-prefix-map='+str(ROOT.resolve())+'/=', '-ffile-prefix-map='+str(Path(os.environ['EMSDK']).resolve())+'/=toolchain/']
version=subprocess.check_output([str(CC),'--version'],env=env,text=True).splitlines()[0]
assert '4.0.15' in version
def build(name,libs,includes,exports,maximum):
 out=ROOT/'vendor'/name;out.mkdir(exist_ok=True)
 subprocess.run([str(CC),str(ROOT/'native'/(name+'.c')),*map(str,libs),*includes,'-O3','-fexceptions',*prefix_maps,'-sASYNCIFY=1','-sASYNCIFY_STACK_SIZE=262144','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1','-sIMPORTED_MEMORY=1','-sABORTING_MALLOC=0','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY='+str(maximum),'-sEXPORTED_FUNCTIONS='+json.dumps(exports),'-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPU16","ccall"]','-o',str(out/(name+'.js'))],env=env,check=True)
 sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
 (out/'PINNED.json').write_text(json.dumps({'compiler':version,'source':sha(ROOT/'native'/(name+'.c')),'libraries':{p.name:sha(p) for p in libs},'files':{p.name:sha(p) for p in out.iterdir() if p.name!='PINNED.json'},'scope':'Additive native unsigned RGB16 decoder; historical RGB8 codec unchanged.'},indent=2))
includes=['@'+str(BUILD/'cv/3rdparty/libtiff/CMakeFiles/libtiff.dir/includes_C.rsp')]
work=ROOT/'.build/native16';work.mkdir(parents=True,exist_ok=True)
original=(BUILD/'opencv-4.11.0/3rdparty/libtiff/tif_read.c').read_text();old='if (tif->tif_rawdatasize != tilesize)';assert original.count(old)==1
patched=original.replace(old,'if (tif->tif_rawcc != tilesize)').replace('(uint64_t)tif->tif_rawdatasize);','(uint64_t)tif->tif_rawcc);',1)
(work/'tif_read.c').write_text(patched)
subprocess.run([str(CC),str(work/'tif_read.c'),*includes,'-D_FILE_OFFSET_BITS=64','-O3',*prefix_maps,'-fexceptions','-c','-o',str(work/'tif_read.o')],env=env,check=True)
build('tiff16-stream',[work/'tif_read.o',BUILD/'cv/3rdparty/lib/liblibtiff.a',BUILD/'cv/3rdparty/lib/liblibjpeg-turbo.a',BUILD/'cv/3rdparty/lib/libzlib.a'],includes,['_tiff16_'+x for x in ['open','block','width','height','block_width','block_height','out_width','out_height','orientation','data','error','close']],268435456)
build('png16-stream',[BUILD/'cv/3rdparty/lib/liblibpng.a',BUILD/'cv/3rdparty/lib/libzlib.a'],['-I'+str(BUILD/'opencv-4.11.0/3rdparty/libpng'),'-I'+str(BUILD/'opencv-4.11.0/3rdparty/zlib'),'-I'+str(BUILD/'cv/3rdparty/zlib')],['_malloc','_free']+['_png_stream_'+x for x in ['open','rows','end','width','height','passes','error','close']],67108864)
