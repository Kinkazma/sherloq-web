"""Build the bounded TNT arithmetic helper; no model activation or registration."""
from pathlib import Path
import os,subprocess,hashlib,json
root=Path(__file__).resolve().parents[1]
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
version=subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
assert '4.0.15' in version
source=root/'experiments/segmentation/tnt-math.cpp';out=root/'vendor/segmentation'
subprocess.run([str(compiler),str(source),'-O3','-msimd128','-ffp-contract=off','-ffile-prefix-map='+str(root)+'=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sABORTING_MALLOC=0','-sALLOW_MEMORY_GROWTH=0','-sINITIAL_MEMORY=67108864','-sEXPORTED_FUNCTIONS=["_malloc","_free","_tnt_matmul","_tnt_softmax","_tnt_norm","_tnt_linear","_tnt_gelu","_tnt_patch"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]','-o',str(out/'tnt-math.js')],check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
record=dict(schema=1,compiler=version,heapBytes=67108864,files={name:sha(out/name) for name in ['tnt-math.js','tnt-math.wasm']},sources={str(p.relative_to(root)):sha(p) for p in [source,root/'experiments/d2prl/fma-simd.h',root/'experiments/d2prl/reference-exp.h',Path(__file__)]},references=['https://github.com/pytorch/pytorch/blob/v2.8.0/aten/src/ATen/native/cpu/moments_utils.h','https://github.com/pytorch/pytorch/blob/v2.8.0/aten/src/ATen/cpu/vec/vec128/vec128_float_neon.h','https://github.com/pytorch/pytorch/blob/v2.8.0/aten/src/ATen/cpu/vec/functional_base.h','https://github.com/pytorch/pytorch/blob/v2.8.0/aten/src/ATen/native/cpu/SoftMaxKernel.cpp'],license='../d2prl/PYTORCH-LICENSE.txt',scope='Native-order model-specific float32 operations; GELU system exponential is not bit-exact. Activation requires actual final probabilities and masks.')
(out/'TNT-PINNED.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record['files']))
