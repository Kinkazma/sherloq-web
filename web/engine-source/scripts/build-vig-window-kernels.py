"""Compile additive VIG window operators; read native sources in place."""
from pathlib import Path
import subprocess,hashlib,json

HERE=Path(__file__).resolve().parents[3]
ROOT=HERE
WEB=HERE/'web/engine-source'
compiler=WEB/'.build/emsdk-4.0.15/upstream/emscripten/em++'
version=subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
assert '4.0.15' in version
source=HERE/'web/engine-source/experiments/segmentation/vig-window-math.cpp'
out=HERE/'web/engine-source/vendor/segmentation'
exports=['malloc','free','vig_exp_values','vig_gelu','vig_conv','vig_normalize','vig_distance_rows','vig_topk_rows','vig_gather_rows','d2prl_batchnorm_parameters','d2prl_affine','vig_window_normalize','vig_window_distance_rows','vig_window_topk_rows','vig_window_gather_rows']
sources=[source,WEB/'experiments/segmentation/vig-math.cpp',WEB/'experiments/segmentation/vig-exp.h',WEB/'experiments/segmentation/vig-exp-table.h',WEB/'experiments/d2prl/convolution-cpu.cpp',WEB/'experiments/d2prl/fma-simd.h',WEB/'experiments/d2prl/resize.cpp',Path(__file__)]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
before={str(p):sha(p) for p in sources}
subprocess.run([str(compiler),str(source),'-I'+str(WEB/'experiments/segmentation'),'-O3','-msimd128','-ffp-contract=off','-ffile-prefix-map='+str(ROOT)+'=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sABORTING_MALLOC=0','-sALLOW_MEMORY_GROWTH=0','-sINITIAL_MEMORY=67108864','-sEXPORTED_FUNCTIONS='+json.dumps(['_'+s for s in exports]),'-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32","HEAP32"]','-o',str(out/'vig-window-math.js')],check=True)
assert before=={str(p):sha(p) for p in sources}
report=dict(schema='vig-window-kernels/1',compiler=version,heapBytes=67108864,precision='FP32',learnedInferenceCalls=0,sources=before,files={name:dict(bytes=(out/name).stat().st_size,sha256=sha(out/name)) for name in ['vig-window-math.js','vig-window-math.wasm']},scope='Additive population/row-layout adaptation. Original arithmetic included byte intact. No learned weights or tensors loaded.')
(out/'VIG-WINDOW-PINNED01.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report['files']))
