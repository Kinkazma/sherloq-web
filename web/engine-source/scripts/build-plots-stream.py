from pathlib import Path
import os,subprocess,json,shutil
root=Path(__file__).resolve().parents[1];compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';out=root/'vendor/plots-stream';out.mkdir(exist_ok=True)
subprocess.run([str(compiler),str(root/'native/plots-stream.cpp'),'-O3','-msimd128','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=8388608','-sMAXIMUM_MEMORY=67108864','-sMEMORY_GROWTH_LINEAR_STEP=1048576','-sABORTING_MALLOC=0','-sEXPORTED_FUNCTIONS='+json.dumps(['_malloc','_free','_plots_pyrdown','_plots_values']),'-sEXPORTED_RUNTIME_METHODS=["HEAPU8"]','-o',str(out/'plots-stream.js')],check=True)
shutil.copyfile(root/'vendor/quality/LICENSE',out/'LICENSE-MUSL.txt')
