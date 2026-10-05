"""Standalone bounded-cache global matcher. Only this worktree is writable."""
from pathlib import Path
import os, json, subprocess, shutil
root=Path(__file__).resolve().parents[1]
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
out=root/'vendor/dense-paged';out.mkdir(exist_ok=True)
subprocess.run([str(compiler),str(root/'native/dense-paged.cpp'),'-std=c++17','-O3','-ffp-contract=off','-fexceptions','-ffile-prefix-map='+str(root)+'/=',
 '-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sIMPORTED_MEMORY=1','-sASYNCIFY=1','-sASYNCIFY_STACK_SIZE=262144',
 '-sINITIAL_MEMORY=8388608','-sMAXIMUM_MEMORY=1073741824','-sSTACK_SIZE=1048576','-sALLOW_MEMORY_GROWTH=1','-sMEMORY_GROWTH_GEOMETRIC_STEP=0','-sMEMORY_GROWTH_LINEAR_STEP=1048576','-sABORTING_MALLOC=0','-sDISABLE_EXCEPTION_CATCHING=0',
 '-sEXPORTED_FUNCTIONS='+json.dumps(['_malloc','_free','_dense_paged_field','_dense_paged_coherence','_dense_paged_regions','_dense_paged_links','_dense_paged_guide_labels','_numpy_paged_sort']),'-sEXPORTED_RUNTIME_METHODS='+json.dumps(['ccall','HEAPU8','HEAPU32','UTF8ToString']),'-o',str(out/'dense-paged.js')],check=True)

shutil.copyfile(root/"vendor/dense-paged-source/LICENSE-OPENCV-DRAWING.txt",out/"LICENSE-OPENCV-DRAWING.txt")

shutil.copyfile(root/"vendor/numpy-sort/LICENSE",out/"LICENSE-NUMPY-SORT.txt")
