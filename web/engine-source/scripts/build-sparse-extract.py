"""Reuse qualified read-only ORB/AKAZE objects and the isolated SIFT study object."""
from pathlib import Path
import os,subprocess,json,hashlib
root=Path(__file__).resolve().parents[1];build=Path(os.environ['OPENCV_BUILD_ROOT']).resolve();compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
assert '4.0.15' in subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
out=root/'vendor/sparse-extract';out.mkdir(parents=True,exist_ok=True)
objects=[build/'cloning-orb-reference.o',*[build/f'akaze-area-{n}.o' for n in ['AKAZEFeatures','nldiffusion_functions','fed']],root/'.build/m3/sift-native.o',root/'.build/m3/brisk-native.o']
command=[str(compiler),str(root/'native/sparse-extract.cpp'),str(root/'experiments/cloning/brisk-area.cpp'),*map(str,objects)]
command += [str(root/f'experiments/cloning/akaze-{name}.cpp') for name in ['angles','filters','separable','area']]
for name in ['features2d','flann','imgproc','core']:command += [str(build/f'cv/lib/libopencv_{name}.a'),'-I',str(build/f'opencv-4.11.0/modules/{name}/include')]
command += [str(build/'cv/3rdparty/lib/libzlib.a'),'-I',str(build/'cv'),'-O3','-fexceptions','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=',
 '-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=33554432','-sMAXIMUM_MEMORY=2147483648','-sFILESYSTEM=0',
 '-sEXPORTED_FUNCTIONS=["_malloc","_free","_sparse_extract","_sparse_points","_sparse_descriptors","_sparse_descriptor_size","_sparse_polygon","_sparse_release","_sparse_total_features"]',
 '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]','-o',str(out/'sparse-extract.js')]
subprocess.run(command,check=True)
for name in ['LICENSE','AKAZE-FILTERS-LICENSE.txt','AKAZE-AREA-LICENSE.txt','AKAZE-AUTHORS.txt','ORB-LICENSE.txt','MUSL-LICENSE.txt']:(out/name).write_bytes((root/'vendor/cloning'/name).read_bytes())
(out/'BRISK-LICENSE.txt').write_text((build/'opencv-4.11.0/modules/features2d/src/brisk.cpp').read_text().split('#include',1)[0])
(out/'BRISK-AREA-LICENSE.txt').write_text((root/'experiments/cloning/brisk-area.cpp').read_text().split('//M*/',1)[0]+'//M*/\n')
(out/'SIFT-LICENSE.txt').write_bytes((root/'.build/m3/sift-extract/SIFT-LICENSE.txt').read_bytes())
(out/'PINNED.json').write_text(json.dumps({'schema':1,'opencv':'4.11.0','emscripten':'4.0.15','build':'scripts/build-sparse-extract.py','qualification':'ORB/AKAZE kernel objects reused; CM2 integration under verification; SIFT residual metadata and BRISK differences unresolved',
 'objects':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in objects},'files':{n:{'bytes':(out/n).stat().st_size,'sha256':hashlib.sha256((out/n).read_bytes()).hexdigest()} for n in ['sparse-extract.js','sparse-extract.wasm']}},indent=2)+'\n')

identity=json.loads((out/'PINNED.json').read_text())['files']['sparse-extract.wasm']
(root/'src/sparse-extract-assets.js').write_text('export const SPARSE_EXTRACT_WASM='+json.dumps(identity,separators=(',',':'))+';\n')
