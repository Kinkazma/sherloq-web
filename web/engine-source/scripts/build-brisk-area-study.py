"""Build a standalone offline INTER_AREA comparison, without runtime mutations."""
from pathlib import Path
import os,subprocess
root=Path(__file__).resolve().parents[1]
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
assert '4.0.15' in subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
command=[str(compiler),'experiments/cloning/brisk-area-probe.cpp','experiments/cloning/brisk-area.cpp']
for module in ['imgproc','core']:
 command += ['.build/cv/lib/libopencv_'+module+'.a','-I.build/opencv-4.11.0/modules/'+module+'/include']
command += ['.build/cv/3rdparty/lib/libzlib.a','-I.build/cv','-O3','-fexceptions','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=',
 '-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node',
 '-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=33554432','-sMAXIMUM_MEMORY=1073741824','-sFILESYSTEM=0',
 '-sEXPORTED_FUNCTIONS=["_malloc","_free","_probe_resize","_probe_result","_probe_release"]',
 '-sEXPORTED_RUNTIME_METHODS=["HEAPU8"]','-o','.build/brisk-area-probe.mjs']
subprocess.run(command,cwd=root,check=True)
