"""Build only in this worktree; shared OpenCV/SDK artifacts are read-only."""
from pathlib import Path
import argparse, hashlib, json, os, subprocess
root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--opencv-build', required=True, type=Path)
args = parser.parse_args()
shared = args.opencv_build.resolve()
compiler = Path(os.environ['EMSDK']) / 'upstream/emscripten/em++'
out = root / '.build/forgeryscope'; out.mkdir(parents=True, exist_ok=True)
source = root / 'native/forgeryscope-prepare.cpp'
subprocess.run([os.sys.executable,str(root/'scripts/build-forgeryscope-affine.py'),'--opencv-build',str(shared)],check=True)
objects = [out/'affine-native.o',shared/'dft-reference.o', shared/'cv/lib/libopencv_calib3d.a', shared/'cv/lib/libopencv_features2d.a', shared/'cv/lib/libopencv_flann.a', shared/'cv/lib/libopencv_imgproc.a', shared/'cv/lib/libopencv_core.a', shared/'cv/3rdparty/lib/libzlib.a']
version = subprocess.check_output([str(compiler),'--version'], text=True).splitlines()[0]
assert '4.0.15' in version
cmd = [str(compiler), str(source), *map(str, objects),
    *['-I'+str(shared/'opencv-4.11.0/modules'/module/'include') for module in ('core','imgproc','calib3d','features2d','flann')], '-I'+str(shared/'cv'),
    '-O3', '-ffp-contract=off', '-fexceptions', '-ffile-prefix-map='+str(root)+'/=',
    '-sDISABLE_EXCEPTION_CATCHING=0', '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sENVIRONMENT=web,worker,node',
    '-sFILESYSTEM=0', '-sALLOW_MEMORY_GROWTH=1', '-sIMPORTED_MEMORY=1', '-sINITIAL_MEMORY=16777216', '-sMAXIMUM_MEMORY=2147483648',
    '-sEXPORTED_FUNCTIONS=["_malloc","_free","_fg_prepare","_fg_yolo_prepare","_fg_aliked_select","_fg_aliked_candidates","_fg_affine"]', '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32","HEAPF64","HEAP32"]',
    '-o', str(out/'prepare.mjs')]
subprocess.run(cmd, check=True)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
(out/'prepare-build.json').write_text(json.dumps(dict(compiler=version,sourceSha256=sha(source),
    objects={p.name:sha(p) for p in objects},files={p.name:dict(bytes=p.stat().st_size,sha256=sha(p)) for p in [out/'prepare.mjs',out/'prepare.wasm']}),indent=2)+'\n')
