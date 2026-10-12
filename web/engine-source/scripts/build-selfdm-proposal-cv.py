#!/usr/bin/env python3
"""Rebuild exact OpenCV4.11 CV kernels using an existing native source/toolchain.

Usage: python build-selfdm-proposal-cv.py OPENCV_BUILD_DIR EMSDK_DIR
No model, dataset, package manager or remote server is involved.
"""
import hashlib,json,os,pathlib,subprocess,sys,time

HERE=pathlib.Path(__file__).resolve().parent
ENGINE=HERE.parent
BUILD=pathlib.Path(sys.argv[1]).resolve()
EMSDK=pathlib.Path(sys.argv[2]).resolve()
OUT=ENGINE/'vendor/selfdm-proposal'
inputs=[OUT/'seeds-wrapper.cpp',BUILD/'opencv_contrib-4.11.0/modules/ximgproc/src/seeds.cpp',BUILD/'cv/lib/libopencv_imgproc.a',BUILD/'cv/lib/libopencv_core.a',BUILD/'cv/3rdparty/lib/libzlib.a']
includes=[*sorted((BUILD/'opencv-4.11.0/modules').glob('*/include')),BUILD/'opencv_contrib-4.11.0/modules/ximgproc/include',BUILD/'cv']
assert all(path.is_file() for path in inputs),'Exact OpenCV4.11 sources/static libraries required'
command=[str(EMSDK/'upstream/emscripten/emcc'),*map(str,inputs),*['-I'+str(path) for path in includes],'-D__OPENCV_BUILD','-O3','-fexceptions','-ffp-contract=off','-ffile-prefix-map='+str(BUILD.parent)+'/=','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1','-sIMPORTED_MEMORY=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=2147483648','-sEXPORTED_FUNCTIONS=["_malloc","_free","_proposal_seeds","_proposal_seeds_error","_proposal_prepare_roi","_proposal_mask_box","_proposal_resize_float"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAP32","HEAPF32"]','-o',str(OUT/'proposal-cv.mjs')]
at=time.monotonic()
subprocess.run(command,env=dict(os.environ,EM_CONFIG=str(EMSDK/'.emscripten')),check=True)
factory=OUT/'proposal-cv.mjs';source=factory.read_text()
compiled='var getHeapMax=()=>2147483648;'
admitted='var getHeapMax=()=>Module["memoryMaximumBytes"]??2147483648;'
assert source.count(compiled)==1,'Generated Emscripten helper changed; review required'
factory.write_text(source.replace(compiled,admitted))
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
record={'schema':1,'compiler':'Emscripten4.0.15','opencv':'4.11.0','command':command,'inputs':{str(path):{'bytes':path.stat().st_size,'sha256':sha(path)} for path in inputs},'factoryAdaptation':{'compiled':compiled,'admitted':admitted,'reason':'Bound speculative growth by the admitted imported WebAssembly.Memory maximum; no numerical kernel changes'},'outputs':{path.name:{'bytes':path.stat().st_size,'sha256':sha(path)} for path in [factory,OUT/'seeds.wasm']},'elapsedMs':(time.monotonic()-at)*1000}
(OUT/'build.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record['outputs'],indent=2))
