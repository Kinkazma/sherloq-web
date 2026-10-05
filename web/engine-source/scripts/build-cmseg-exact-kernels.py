"""Build the native-order CMSeg helpers without changing other model kernels."""
from pathlib import Path
import os,sys,subprocess,hashlib,json
root=Path(__file__).resolve().parents[1];compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';version=subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0];assert '4.0.15' in version
# Reuse the already diagnosed correlation transformation recipe; private candidate
# outputs remain private. This produces the source for the independently named helper.
subprocess.run([sys.executable,str(root/'scripts/build-cmseg-fma-candidate.py'),'--simd'],check=True)
common=[str(compiler),'-O3','-msimd128','-ffp-contract=off','-ffile-prefix-map='+str(root)+'=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sABORTING_MALLOC=0','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]']
source=root/'experiments/segmentation/cmseg-winograd.cpp';correlation=root/'.build/cmseg-native-fma-simd/correlation-source.cpp';out=root/'vendor/segmentation';out.mkdir(exist_ok=True)
subprocess.run(common+[str(source),'-sALLOW_MEMORY_GROWTH=0','-sINITIAL_MEMORY=67108864','-sEXPORTED_FUNCTIONS=["_malloc","_free","_cmseg_winograd"]','-o',str(out/'cmseg-winograd.js')],check=True)
subprocess.run(common+[str(correlation),'-I'+str(root/'experiments/segmentation'),'-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=67108864','-sMEMORY_GROWTH_LINEAR_STEP=16777216','-sEXPORTED_FUNCTIONS=["_malloc","_free","_cmseg_normalize","_cmseg_statistics","_cmseg_topk"]','-o',str(out/'correlation-fma.js')],check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();records={name:sha(out/name) for name in ['cmseg-winograd.js','cmseg-winograd.wasm','correlation-fma.js','correlation-fma.wasm']}
(out/'CMSEG-EXACT-PINNED.json').write_text(json.dumps(dict(schema=1,compiler=version,files=records,sources={str(p.relative_to(root)):sha(p) for p in [source,root/'experiments/segmentation/cmseg-correlation.cpp',root/'experiments/d2prl/fma-simd.h',root/'scripts/build-cmseg-fma-candidate.py',Path(__file__)]},nativeReference='https://github.com/pytorch/pytorch/blob/v2.8.0/aten/src/ATen/native/cpu/DepthwiseConvKernel.cpp',license='../d2prl/PYTORCH-LICENSE.txt',scope='Native float32 Winograd and ordered FMA; model-specific reference arithmetic, never browser-brand selection.'),indent=2)+'\n');print(json.dumps(records),flush=True)
