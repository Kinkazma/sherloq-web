"""Test the captured native FMA order without replacing qualified vendor files."""
from pathlib import Path
import subprocess,os,json,hashlib,sys
root=Path(__file__).resolve().parents[1];compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';version=subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0];assert '4.0.15' in version
simd='--simd' in sys.argv
out=root/('.build/cmseg-native-fma-simd' if simd else '.build/cmseg-native-fma');out.mkdir(exist_ok=True);original=root/'experiments/segmentation/cmseg-correlation.cpp';source=original.read_text();source=source.replace('sum += v*v;','sum = std::fma(v,v,sum);')
start=source.index('  for(int j=0;j<n;j+=4) {');end=source.index('  const int iy=',start)
source=source[:start]+'''  for(int j=0;j<n;j++) {
    float sum=0;
    for(int channel=0;channel<c;channel++)
      sum=std::fma(xn[channel*n+i],xn[channel*n+j],sum);
    logits[j]=sum;
  }
'''+source[end:]
if simd:
    source=source.replace('#include <wasm_simd128.h>', '#include <wasm_simd128.h>\n#include "../d2prl/fma-simd.h"')
    start=source.index('  for(int j=0;j<n;j++) {',source.index('static void row('));end=source.index('  const int iy=',start)
    source=source[:start]+'''  for(int j=0;j<n;j+=4) {
    v128_t sum=wasm_f32x4_splat(0);
    for(int channel=0;channel<c;channel++)
      sum=d2prl_fma4(wasm_f32x4_splat(xn[channel*n+i]),wasm_v128_load(xn+channel*n+j),sum);
    wasm_v128_store(logits+j,sum);
  }
'''+source[end:]
file=out/'correlation-source.cpp';file.write_text(source)
subprocess.run([str(compiler),str(file),'-I'+str(root/'experiments/segmentation'),'-O3','-msimd128','-ffp-contract=off','-ffile-prefix-map='+str(root)+'=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=67108864','-sMEMORY_GROWTH_LINEAR_STEP=16777216','-sEXPORTED_FUNCTIONS=["_malloc","_free","_cmseg_normalize","_cmseg_statistics","_cmseg_topk"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]','-o',str(out/'correlation.js')],check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();(out/'build.json').write_text(json.dumps(dict(compiler=version,sourceSha256=sha(file),parentSourceSha256=sha(original),files={p.name:sha(p) for p in [out/'correlation.js',out/'correlation.wasm']}),indent=2)+'\n')
