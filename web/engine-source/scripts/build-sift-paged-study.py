"""Support-window SIFT study. Only owned copies of qualified OpenCV sources change."""
from pathlib import Path
import os,re,shlex,subprocess,json,hashlib,sys
root=Path(__file__).resolve().parents[1];build=Path(os.environ['OPENCV_BUILD_ROOT']);out=root/'.build/m3/sift-paged';out.mkdir(exist_ok=True);compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';source=build/'opencv-4.11.0/modules/features2d/src'
# Regenerate the earlier arithmetic study first if these owned files are absent.
s=(root/'.build/m3/sift.dispatch.cpp').read_text();h=(root/'.build/m3/sift.simd.hpp').read_text()
globals='''static bool m3SiftActive=false,m3SiftForce=false;
static int m3SiftX=0,m3SiftY=0,m3SiftWidth=0,m3SiftHeight=0,m3SiftCoreX=0,m3SiftCoreY=0,m3SiftCoreW=0,m3SiftCoreH=0;
static std::vector<int> m3SiftEscapes;
'''
s=s.replace('#include "sift.simd.hpp"',globals+'\n#include "sift.simd.hpp"');s+='\n'+(root/'experiments/m3/sift-paged-kernel.cpp').read_text()
# Preserve the original seed domain, including extrema that migrate to another
# core. Unsafe migrations are reported for global continuation, never discarded.
a=h.index('bool adjustLocalExtrema(');b=h.index('\nnamespace {',a);part=h[a:b];part=part.replace('    int i = 0;','    const int seedX=c,seedY=r,seedLayer=layer;\n    int i = 0;',1)
needle='''        int idx = octv*(nOctaveLayers+2) + layer;'''
guard='''        if(::m3SiftActive){
            const Mat& bounds=dog_pyr[octv*(nOctaveLayers+2)+layer];
            const bool unsafeX=(::m3SiftX>0&&c<128)||(::m3SiftX+bounds.cols<::m3SiftWidth&&c>=bounds.cols-128);
            const bool unsafeY=(::m3SiftY>0&&r<128)||(::m3SiftY+bounds.rows<::m3SiftHeight&&r>=bounds.rows-128);
            if(unsafeX||unsafeY||::m3SiftForce){::m3SiftEscapes.insert(::m3SiftEscapes.end(),{seedX+::m3SiftX,seedY+::m3SiftY,seedLayer,c+::m3SiftX,r+::m3SiftY,layer});return false;}
        }
'''
# Safety before every gradient access, including the converged final contrast.
part=part.replace(needle,guard+needle)
# The unbounded relocation must be reported before local-window border rejection.
old='''            c < SIFT_IMG_BORDER || c >= img.cols - SIFT_IMG_BORDER  ||
            r < SIFT_IMG_BORDER || r >= img.rows - SIFT_IMG_BORDER'''
new='''            c + (::m3SiftActive?::m3SiftX:0) < SIFT_IMG_BORDER || c + (::m3SiftActive?::m3SiftX:0) >= (::m3SiftActive?::m3SiftWidth:img.cols) - SIFT_IMG_BORDER  ||
            r + (::m3SiftActive?::m3SiftY:0) < SIFT_IMG_BORDER || r + (::m3SiftActive?::m3SiftY:0) >= (::m3SiftActive?::m3SiftHeight:img.rows) - SIFT_IMG_BORDER'''
assert old in part;part=part.replace(old,new).replace('(c + xc) * (1 << octv)','((c + (::m3SiftActive?::m3SiftX:0)) + xc) * (1 << octv)').replace('(r + xr) * (1 << octv)','((r + (::m3SiftActive?::m3SiftY:0)) + xr) * (1 << octv)');h=h[:a]+part+h[b:]
a=h.index('class findScaleSpaceExtremaT');b=h.index('\nvoid findScaleSpaceExtrema(',a);part=h[a:b].replace('const int begin = range.start;', 'const int begin = ::m3SiftActive?std::max(range.start,::m3SiftCoreY):range.start;').replace('const int end = range.end;', 'const int end = ::m3SiftActive?std::min(range.end,::m3SiftCoreY+::m3SiftCoreH):range.end;\n        const int endCol=::m3SiftActive?std::min(cols-SIFT_IMG_BORDER,::m3SiftCoreX+::m3SiftCoreW):cols-SIFT_IMG_BORDER;').replace('int c = SIFT_IMG_BORDER;','int c = ::m3SiftActive?std::max(SIFT_IMG_BORDER,::m3SiftCoreX):SIFT_IMG_BORDER;').replace('cols-SIFT_IMG_BORDER - vecsize','endCol - vecsize').replace('c < cols-SIFT_IMG_BORDER','c < endCol');h=h[:a]+part+h[b:]
(out/'sift.dispatch.cpp').write_text(s);(out/'sift.simd.hpp').write_text(h)
flags=(build/'cv/modules/features2d/CMakeFiles/opencv_features2d.dir/flags.make').read_text();options=[]
for key in ['CXX_DEFINES','CXX_INCLUDES','CXX_FLAGS']:options+=shlex.split(re.search('^'+key+r' = (.*)$',flags,re.M)[1])
options+=['-ffile-prefix-map='+str(root)+'/=']
options=['-ffp-contract=on' if x=='-ffp-contract=off' else x for x in options];llvm=out/'sift-paged.ll';obj=out/'sift-paged.o';subprocess.run([str(compiler),*options,'-I',str(source),'-S','-emit-llvm',str(out/'sift.dispatch.cpp'),'-o',str(llvm)],cwd=build/'cv/modules/features2d',check=True)
ir=llvm.read_text().replace('@llvm.fmuladd.','@llvm.fma.');seen=set();lines=[]
for line in ir.splitlines():
 match=re.match(r'declare .* (@llvm\.fma\.[^(]+)',line)
 if match:
  if match[1] in seen:continue
  seen.add(match[1])
 lines.append(line)
llvm.write_text('\n'.join(lines)+'\n');subprocess.run([str(compiler),'-O3','-c',str(llvm),'-o',str(obj)],check=True)
command=[str(compiler),str(obj),str(root/'native/sift-paged-post.cpp'),'-ffp-contract=off','-I',str(build/'cv')]
for name in ['features2d','flann','imgproc','core']:command+=['-I',str(build/f'opencv-4.11.0/modules/{name}/include')]
output=out/'runtime-staging' if '--runtime' in sys.argv else out;output.mkdir(exist_ok=True)
for name in ['features2d','flann','imgproc','core']:command+=[str(build/f'cv/lib/libopencv_{name}.a')]
functions=['m2_sift_forgeryscope_select','malloc','free','m3_sift_release','m3_sift_initial','m3_sift_upsample','m3_sift_kernel','m3_sift_kernel_data','m3_sift_build_supplied','m3_sift_initial_data','m3_sift_build','m3_sift_layer','m3_sift_detect','m3_sift_escapes','m3_sift_escape_count','m3_sift_points','m3_sift_select','m3_sift_describe','m3_sift_descriptors','m3_sift_reference','m3_sift_force_continuation','m3_sift_neighborhood','m3_sift_refine','m3_sift_finish_orientation','m3_sift_normalize','m3_sift_scale_four','m3_sift_scaled_gray','m3_sift_scaled_release','m3_sift_polygon']
command += [str(build/'cv/3rdparty/lib/libzlib.a'),'-O3','-fexceptions','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=33554432','-sMAXIMUM_MEMORY=2147483648','-sFILESYSTEM=0','-sABORTING_MALLOC=0','-sEXPORTED_FUNCTIONS='+json.dumps(['_'+f for f in functions]),'-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32","HEAP32"]','-o',str(output/'sift-paged.js')];subprocess.run(command,check=True)
print('Built owned SIFT support-window study; not runtime-qualified.')

if '--runtime' in sys.argv:
 files={name:dict(bytes=(output/name).stat().st_size,sha256=hashlib.sha256((output/name).read_bytes()).hexdigest()) for name in ['sift-paged.js','sift-paged.wasm']}
 (output/'PINNED.json').write_text(json.dumps(dict(opencv='4.11.0',emscripten='4.0.15',build='scripts/build-sift-paged-study.py --runtime',sources={name:hashlib.sha256((out/name).read_bytes()).hexdigest() for name in ['sift.dispatch.cpp','sift.simd.hpp']},files=files),indent=2)+'\n')
 for name,origin in [('LICENSE',root/'vendor/opencv/LICENSE'),('SIFT-LICENSE.txt',root/'vendor/sparse-extract/SIFT-LICENSE.txt'),('MUSL-LICENSE.txt',root/'vendor/sparse-extract/MUSL-LICENSE.txt')]: (output/name).write_bytes(origin.read_bytes())
 # Publish completed artifacts atomically: a running study must never fetch
 # the larger intermediate wasm before wasm-opt has finished.
 destination=root/'vendor/sift-paged';destination.mkdir(exist_ok=True)
 for file in output.iterdir():
  target=destination/file.name;temporary=destination/(file.name+'.tmp');temporary.write_bytes(file.read_bytes());os.replace(temporary,target)
 (root/'src/sift-paged-assets.js').write_text('export const SIFT_PAGED_WASM='+json.dumps(files['sift-paged.wasm'])+';\n')
