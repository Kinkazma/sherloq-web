"""Compile standalone AKAZE stage probes; does not write runtime assets."""
from pathlib import Path
import os,subprocess
root=Path(__file__).resolve().parents[1]
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
assert '4.0.15' in subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
command=[str(compiler)]+[str(root/f'experiments/cloning/akaze-{name}.cpp') for name in ['primitives','filters','separable','area']]
for name in ['features2d','flann','imgproc','core']:
 command += [str(root/f'.build/cv/lib/libopencv_{name}.a'),'-I',str(root/f'.build/opencv-4.11.0/modules/{name}/include')]
command += [str(root/'.build/cv/3rdparty/lib/libzlib.a'),'-I',str(root/'.build/cv'),'-O3','-fexceptions','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=',
 '-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=33554432','-sMAXIMUM_MEMORY=1073741824','-sFILESYSTEM=0',
 '-sEXPORTED_FUNCTIONS=["_malloc","_free","_akaze_probe","_akaze_probe_result","_akaze_probe_release"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]','-o',str(root/'.build/akaze-primitives.mjs')]
subprocess.run(command,check=True)
