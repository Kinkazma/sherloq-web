"""Build a separate CPU postprocessor for streamed ordered GPU dot products."""
from pathlib import Path
import hashlib, json, os, subprocess
root=Path(__file__).resolve().parents[1]
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
version=subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
assert '4.0.15' in version
parent=root/'experiments/segmentation/cmseg-correlation.cpp'
source=parent.read_text().replace('sum += v*v;','sum = std::fma(v,v,sum);')
first=source.index('static void row(');last=source.index('extern "C" int cmseg_statistics',first)
source=source[:first]+'''static void row(const float* dots, int n, int w, int index, int local,
                float alpha, const float* gy, const float* gx, float* logits) {
  const int iy=index/w, ix=index%w;
  for(int j=0;j<n;j++) {
    const float suppress=1.f-gy[std::abs(iy-j/w)]*gx[std::abs(ix-j%w)];
    logits[j]=(dots[local*n+j]*suppress)*alpha;
  }
}
'''+source[last:]
source=source.replace('row(xn,c,h,w,i,alpha,gy,gx,scratch);','row(xn,n,w,i,i-first,alpha,gy,gx,scratch);')
source=source.replace('row(xn,c,h,w,j,alpha,gy,gx,scratch);','row(xn,n,w,j,j-first,alpha,gy,gx,scratch);')
source=source.replace('int cmseg_statistics(', 'int cmseg_statistics_dots(').replace('int cmseg_topk(', 'int cmseg_topk_dots(')
out=root/'.build/cmseg-correlation-gpu-post-32m';out.mkdir(exist_ok=True)
cpp=out/'post.cpp';cpp.write_text(source)
subprocess.run([str(compiler),str(cpp),'-I'+str(root/'experiments/segmentation'),'-O3','-msimd128','-ffp-contract=off','-ffile-prefix-map='+str(root)+'=',
 '-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sABORTING_MALLOC=0',
 '-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=33554432','-sMEMORY_GROWTH_LINEAR_STEP=16777216',
 '-sEXPORTED_FUNCTIONS=["_malloc","_free","_cmseg_normalize","_cmseg_statistics_dots","_cmseg_topk_dots"]',
 '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]','-o',str(out/'post.js')],check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(out/'build.json').write_text(json.dumps(dict(schema=1,compiler=version,maximumMemoryBytes=33554432,sources={str(p.relative_to(root)):sha(p) for p in [parent,Path(__file__),root/'experiments/d2prl/reference-exp.h']},generatedSourceSha256=sha(cpp),files={p.name:dict(bytes=p.stat().st_size,sha256=sha(p)) for p in [out/'post.js',out/'post.wasm']}),indent=2)+'\n')
print('Separate CMSeg GPU-dot CPU postprocessor built')
