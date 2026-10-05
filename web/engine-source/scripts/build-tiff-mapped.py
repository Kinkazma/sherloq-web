"""Read an existing OpenCV4.11 SDK/build; change only TIFF memory-map callbacks."""
import hashlib,json,os,shlex,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];BUILD=Path(os.environ['OPENCV_BUILD_ROOT']);OUT=ROOT/'vendor/tiff-mapped';OUT.mkdir(parents=True,exist_ok=True);WORK=ROOT/'.build/m5/tiff-mapped';WORK.mkdir(parents=True,exist_ok=True)
CC=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';env={**os.environ,'EM_FROZEN_CACHE':'1','EMCC_CORES':'1'}
version=subprocess.check_output([str(CC),'--version'],env=env,text=True).splitlines()[0];assert '4.0.15' in version
original=(BUILD/'opencv-4.11.0/modules/imgcodecs/src/grfmt_tiff.cpp').read_bytes();source=original.decode();assert hashlib.sha256(original).hexdigest()=='bf3f1b71aebfa75795e4a534e0d78a30179365f08ff3e8467a3eb473322255e2'
needle='''        *size = buf.cols*buf.rows*buf.elemSize();
        return 0;
    }

    static toff_t size'''
assert source.count(needle)==1
source=source.replace(needle,'''        *size = buf.cols*buf.rows*buf.elemSize();
        return 1; // Encoded staging remains alive for the full decoder call.
    }
    static void unmap(thandle_t, void*, toff_t) {} // Caller owns the staging.

    static toff_t size''')
needle='&TiffDecoderBufHelper::map, /*unmap=*/0';assert source.count(needle)==1;source=source.replace(needle,'&TiffDecoderBufHelper::map, &TiffDecoderBufHelper::unmap')
patched=WORK/'grfmt_tiff.cpp';patched.write_text(source)
includes=shlex.split((BUILD/'cv/modules/imgcodecs/CMakeFiles/opencv_imgcodecs.dir/includes_CXX.rsp').read_text())
subprocess.run([str(CC),str(patched),'-c','-o',str(WORK/'grfmt_tiff.o'),*includes,'-I'+str(BUILD/'opencv-4.11.0/modules/imgcodecs/src'),'-D__OPENCV_BUILD=1','-O3','-std=c++11','-DNDEBUG','-fexceptions','-ffp-contract=off','-ffile-prefix-map='+str(BUILD)+'/=','-ffile-prefix-map='+str(ROOT)+'/='],env=env,check=True)
libs=[BUILD/'cv/lib'/('libopencv_'+name+'.a') for name in ['imgcodecs','imgproc','core']]+sorted((BUILD/'cv/3rdparty/lib').glob('*.a'))
subprocess.run([str(CC),str(ROOT/'native/tiff-mapped.cpp'),str(WORK/'grfmt_tiff.o'),*map(str,libs),*['-I'+str(BUILD/'opencv-4.11.0/modules'/name/'include')for name in ['core','imgcodecs']],'-I'+str(BUILD/'cv'),'-O3','-fexceptions','-ffp-contract=off','-ffile-prefix-map='+str(ROOT)+'/=','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sIMPORTED_MEMORY=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=1610612736','-sABORTING_MALLOC=0','-sFILESYSTEM=0','-sEXPORTED_FUNCTIONS=["_malloc","_free","_tiff_decode","_tiff_error","_tiff_width","_tiff_height","_tiff_size","_tiff_data","_tiff_release"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8"]','-o',str(OUT/'tiff-mapped.js')],env=env,check=True)
for name in ['LICENSE','TIFF-LICENSE.txt','PNG-LICENSE.txt','zlib.h','JPEG-LICENSE.md','CAROTENE-LICENSE.txt']:(OUT/name).write_bytes((ROOT/'vendor/opencv'/name).read_bytes())
sha=lambda b:hashlib.sha256(b).hexdigest()
(OUT/'PINNED.json').write_text(json.dumps(dict(opencv='4.11.0',libtiff='4.6.0',compiler=version,originalTiffDecoderSha256=sha(original),mappedTiffDecoderSha256=sha(source.encode()),wrapperSha256=sha((ROOT/'native/tiff-mapped.cpp').read_bytes()),patch='Memory map callback returns success and caller-owned unmap callback does nothing. Pixel extraction and libtiff code unchanged.',libraries={str(p.relative_to(BUILD)):sha(p.read_bytes())for p in libs},files={p.name:sha(p.read_bytes())for p in sorted(OUT.iterdir())if p.name!='PINNED.json'}),indent=2)+'\n')
print('TIFF mapped adapter built with',version)
