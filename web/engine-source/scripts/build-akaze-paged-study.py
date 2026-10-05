"""Build an owned AKAZE finite-support study; never touches the shared build."""
from pathlib import Path
import os,re,shlex,subprocess,json,sys,hashlib
root=Path(__file__).resolve().parents[1];build=Path(os.environ['OPENCV_BUILD_ROOT']);out=root/'.build/m3/akaze-paged';out.mkdir(parents=True,exist_ok=True);compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';source=build/'opencv-4.11.0/modules/features2d/src/kaze'
(out/'AKAZEFeatures.h').write_text((source/'AKAZEFeatures.h').read_text().replace('private:', 'public:'))
body='#include <numeric>\n'+(build/'akaze-area-AKAZEFeatures.cpp').read_text()
body=body.replace('using namespace std;', 'using namespace std;\nstatic int m3AkazeOriginX=0,m3AkazeOriginY=0;',1)
# Keep global float arithmetic; translate only after native integer rounding.
for axis in ['x','y']:
 old=f'int {axis}0 = cvRound(kpt.pt.{axis} / e.octave_ratio);';assert body.count(old)==1
 body=body.replace(old,old[:-1]+f' - m3AkazeOrigin{axis.upper()};')
start=body.index('void MLDB_Full_Descriptor_Invoker::MLDB_Fill_Values(');end=body.index('void MLDB_Full_Descriptor_Invoker::MLDB_Binary_Comparisons(',start)
fragment=body[start:end]
for axis in ['x','y']:
 old=f'int {axis}1 = cvRound(sample_{axis});';assert fragment.count(old)==1
 fragment=fragment.replace(old,old[:-1]+f' - m3AkazeOrigin{axis.upper()};')
body=body[:start]+fragment+body[end:]
(out/'AKAZEFeatures.cpp').write_text(body+'\n'+(root/'experiments/m3/akaze-paged-kernel.cpp').read_text())
flags=(build/'cv/modules/features2d/CMakeFiles/opencv_features2d.dir/flags.make').read_text();options=[]
for key in ['CXX_DEFINES','CXX_INCLUDES','CXX_FLAGS']:options+=shlex.split(re.search('^'+key+r' = (.*)$',flags,re.M)[1])
options=['-ffp-contract=on' if x=='-ffp-contract=off' else x for x in options];llvm=out/'akaze-paged.ll';obj=out/'akaze-paged.o'
subprocess.run([str(compiler),*options,'-I',str(source),'-S','-emit-llvm',str(out/'AKAZEFeatures.cpp'),'-o',str(llvm)],cwd=build/'cv/modules/features2d',check=True)
ir=llvm.read_text().replace('@llvm.fmuladd.','@llvm.fma.');seen=set();lines=[]
for line in ir.splitlines():
 match=re.match(r'declare .* (@llvm\.fma\.[^(]+)',line)
 if match:
  if match[1] in seen:continue
  seen.add(match[1])
 lines.append(line)
llvm.write_text('\n'.join(lines)+'\n');subprocess.run([str(compiler),'-O3','-c',str(llvm),'-o',str(obj)],check=True)
cmd=[str(compiler),str(obj),str(build/'akaze-area-nldiffusion_functions.o'),str(build/'akaze-area-fed.o'),*[str(root/('experiments/m3/akaze-paged-filters.cpp' if n=='filters' and '--fast-fma' in sys.argv else f'experiments/cloning/akaze-{n}.cpp')) for n in ['angles','filters','separable'] if not (n=='separable' and '--fast-fma' in sys.argv)],str(root/'experiments/m3/akaze-paged-area.cpp'),'-I',str(build/'cv')]
for name in ['features2d','flann','imgproc','core']:cmd += [str(build/f'cv/lib/libopencv_{name}.a'),'-I',str(build/f'opencv-4.11.0/modules/{name}/include')]
exports=['malloc','free','m3_akaze_release','m3_akaze_init','m3_akaze_config','m3_akaze_plane','m3_akaze_prepare','m3_akaze_histogram','m3_akaze_contrast','m3_akaze_evolve','m3_akaze_resize','m3_akaze_resize_rows','m3_akaze_reference','m3_akaze_reference_plane','m3_akaze_points','m3_akaze_reference_detect','m3_akaze_reference_points','m3_akaze_reference_mask','m3_akaze_same','m3_akaze_cross','m3_akaze_refine','m3_akaze_describe','m3_akaze_descriptors','m3_akaze_reference_describe','m3_akaze_reference_descriptors','m3_akaze_gradients','m3_akaze_polygon','m3_akaze_select','m3_akaze_selected_total']
output=root/'vendor/akaze-paged' if '--runtime' in sys.argv else out;output.mkdir(exist_ok=True)
if '--fast-fma' in sys.argv:
 cmd += [str(root/'experiments/m3/akaze-paged-fma.cpp'),'-DNDEBUG','-msimd128','-mrelaxed-simd','-Wl,--wrap=fmaf']
cmd += [str(build/'cv/3rdparty/lib/libzlib.a'),'-O3','-ffp-contract=off','-fexceptions','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=33554432','-sMAXIMUM_MEMORY=2147483648','-sFILESYSTEM=0','-sABORTING_MALLOC=0','-sEXPORTED_FUNCTIONS='+json.dumps(['_'+f for f in exports]),'-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32","HEAP32"]','-o',str(output/('reference.js' if '--reference' in sys.argv else 'akaze-paged.js'))];subprocess.run(cmd,check=True)
print('Built AKAZE runtime kernel.' if '--runtime' in sys.argv else 'Built AKAZE study only; no runtime changes.')

if '--runtime' in sys.argv:
 files={name:dict(bytes=(output/name).stat().st_size,sha256=hashlib.sha256((output/name).read_bytes()).hexdigest()) for name in ['akaze-paged.js','akaze-paged.wasm','reference.js','reference.wasm'] if (output/name).exists()}
 (output/'PINNED.json').write_text(json.dumps(dict(opencv='4.11.0',emscripten='4.0.15',build='scripts/build-akaze-paged-study.py --runtime --fast-fma; --runtime --reference',source=hashlib.sha256((out/'AKAZEFeatures.cpp').read_bytes()).hexdigest(),supportSources={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [root/'experiments/m3/akaze-paged-filters.cpp',root/'experiments/m3/akaze-paged-fma.cpp',root/'experiments/m3/akaze-paged-area.cpp',root/'experiments/cloning/akaze-angles.cpp',root/'experiments/cloning/akaze-filters.cpp',root/'experiments/cloning/akaze-separable.cpp']},files=files),indent=2)+'\n')
 for name,origin in [('LICENSE',root/'vendor/opencv/LICENSE'),('MUSL-LICENSE.txt',root/'vendor/sparse-extract/MUSL-LICENSE.txt')]: (output/name).write_bytes(origin.read_bytes())
 (root/'src/akaze-paged-assets.js').write_text('export const AKAZE_PAGED_WASM='+json.dumps(files['akaze-paged.wasm'])+';\nexport const AKAZE_PAGED_REFERENCE_WASM='+json.dumps(files.get('reference.wasm'))+';\n')
