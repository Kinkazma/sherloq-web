"""Build bounded VIG arithmetic and regenerate its mathematical exp2 table."""
from pathlib import Path
from decimal import Decimal,localcontext
import os,subprocess,hashlib,json,struct
root=Path(__file__).resolve().parents[1]
with localcontext() as ctx:
 ctx.prec=100
 table=[struct.unpack('<Q',struct.pack('<d',float(Decimal(2)**(Decimal(i)/128))))[0]-(i<<45) for i in range(128)]
(root/'experiments/segmentation/vig-exp-table.h').write_text('// Generated from 2^(j/128), Decimal precision100, IEEE float64 round-to-nearest.\nstatic constexpr uint64_t vig_exp_table[128]={\n'+',\n'.join(','.join(hex(v)+'ULL' for v in table[i:i+4]) for i in range(0,128,4))+'\n};\n')
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';version=subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0];assert '4.0.15' in version
out=root/'vendor/segmentation';source=root/'experiments/segmentation/vig-math.cpp'
exports=['malloc','free','vig_exp_values','vig_gelu','vig_conv','vig_normalize','vig_distance_rows','vig_topk_rows','vig_gather_rows','d2prl_batchnorm_parameters','d2prl_affine']
subprocess.run([str(compiler),str(source),'-O3','-msimd128','-ffp-contract=off','-ffile-prefix-map='+str(root)+'=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sABORTING_MALLOC=0','-sALLOW_MEMORY_GROWTH=0','-sINITIAL_MEMORY=67108864','-sEXPORTED_FUNCTIONS='+json.dumps(['_'+s for s in exports]),'-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32","HEAP32"]','-o',str(out/'vig-math.js')],check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
sources=['experiments/segmentation/vig-math.cpp','experiments/segmentation/vig-exp.h','experiments/segmentation/vig-exp-table.h','experiments/d2prl/convolution-cpu.cpp','experiments/d2prl/fma-simd.h','experiments/d2prl/resize.cpp','scripts/build-vig-kernels.py']
report=dict(schema=1,compiler=version,heapBytes=67108864,files={name:sha(out/name) for name in ['vig-math.js','vig-math.wasm']},sources={name:sha(root/name) for name in sources},references=['https://github.com/pytorch/pytorch/blob/v2.8.0/aten/src/ATen/native/TopKImpl.h','https://github.com/pytorch/pytorch/blob/v2.8.0/aten/src/ATen/cpu/vec/vec128/vec128_float_neon.h'],license='../d2prl/PYTORCH-LICENSE.txt',scope='Fixed VIG CPU arithmetic, independently generated exp2 table and explicit reference polynomial, no platform dispatch or captured activations; complete-model qualification required.')
(out/'VIG-PINNED.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report['files']))
