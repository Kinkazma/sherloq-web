"""Build an explicitly unqualified EM experiment under .build only."""
from pathlib import Path
import argparse, os, subprocess
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--exact-zero',action='store_true');parser.add_argument('--blas',action='store_true');args=parser.parse_args()
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
assert '4.0.15' in subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
cvroot=Path(os.environ.get('OPENCV_BUILD_ROOT',root/'.build'))
library=cvroot/'cv/lib/libopencv_core.a'
assert args.blas or library.is_file(), 'Build the pinned OpenCV archive with scripts/build-opencv.sh first.'
source=root/'experiments/resampling-em'/('portable.cpp' if args.blas else 'exact-zero.cpp' if args.exact_zero else 'opencv.cpp')
output=root/'.build'/('resampling-em-blas.mjs' if args.blas else 'resampling-em-lu0.mjs' if args.exact_zero else 'resampling-em-full.mjs')
subprocess.run([str(compiler),str(source),* ([] if args.blas else [str(library),'-I',str(cvroot/'opencv-4.11.0/modules/core/include'),'-I',str(cvroot/'cv')]),'-O3','-fexceptions','-ffp-contract=off','-fno-builtin-pow','-ffile-prefix-map='+str(root)+'/=','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=33554432','-sMAXIMUM_MEMORY=1073741824','-sFILESYSTEM=0','-sEXPORTED_FUNCTIONS=["_malloc","_free","_em_create","_em_step","_em_iterations","_em_weights","_em_destroy"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF64"]','-o',str(output)],check=True)
