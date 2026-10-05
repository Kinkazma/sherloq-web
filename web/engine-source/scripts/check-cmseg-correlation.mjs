// Isolated bounded WASM arithmetic qualification on actual native features.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import factory from '../.build/cmseg-correlation/correlation.js';
const variant = process.argv[2] ?? 'generalization', selected = process.argv[3] ?? 'structured-copy';
if (!['generalization', 'addnoise'].includes(variant)) throw Error('Variant');
const root = new URL('../', import.meta.url), base = new URL('.build/segmentation-models/cmseg-' + variant + '/', root);
const reference = JSON.parse(await readFile(new URL('split-reference.json', base))), module = await factory();
const hash = data => createHash('sha256').update(data).digest('hex');
const records = [], row = reference.records.find(r => r.name === selected); if (!row) throw Error('Fixture');
for (const level of [2, 1, 0]) {
  const spec = row.features[level + 1], corr = reference.correlation[level], expectedSpec = row.correlations[level];
  const bytes = await readFile(new URL(spec.file, base)), expectedBytes = await readFile(new URL(expectedSpec.file, base));
  if (hash(bytes) !== spec.sha256 || hash(expectedBytes) !== expectedSpec.sha256) throw Error('Fixture hash');
  const [, c, h, w] = spec.shape, n = h * w, k = corr.topk, pointers = [];
  const allocate = floats => {const p = module._malloc(floats * 4); if (!p) throw Error('Malloc'); pointers.push(p); return p;};
  const input = allocate(c*n), normalized = allocate(c*n), gy = allocate(h), gx = allocate(w), maxima = allocate(n), inverse = allocate(2*n), scratch = allocate(n), output = allocate(k*n);
  try {
    module.HEAPU8.set(bytes, input); const start = performance.now();
    if (module._cmseg_normalize(input,c,h,w,normalized,gy,gx) !== 1) throw Error('Normalize');
    for (let first=0;first<n;first+=64) if(module._cmseg_statistics(normalized,c,h,w,corr.alpha,gy,gx,first,Math.min(64,n-first),maxima,inverse,scratch)!==1) throw Error('Statistics');
    for (let first=0;first<n;first+=64) if(module._cmseg_topk(normalized,c,h,w,k,corr.alpha,gy,gx,maxima,inverse,first,Math.min(64,n-first),output,scratch)!==1) throw Error('TopK');
    const milliseconds = performance.now()-start, actual = module.HEAPF32.slice(output/4,output/4+k*n), expected = new Float32Array(expectedBytes.buffer,expectedBytes.byteOffset,expectedBytes.byteLength/4);
    let maxAbs=0,maxRelative=0,different=0; for(let i=0;i<actual.length;i++){different+=actual[i]!==expected[i];const delta=Math.abs(actual[i]-expected[i]);maxAbs=Math.max(maxAbs,delta);maxRelative=Math.max(maxRelative,delta/Math.max(expected[i],1e-30));}
    await writeFile(new URL(selected+'-'+corr.name+'-bounded.bin',base),Buffer.from(actual.buffer));
    records.push({name:corr.name,shape:expectedSpec.shape,elements:actual.length,different,maxAbs,maxRelative,finite:actual.every(Number.isFinite),milliseconds,heapBytes:module.HEAPU8.length,ownedFloatBytes:pointers.length?4*(2*c*n+h+w+4*n+k*n):0});
    console.log(JSON.stringify(records.at(-1)));
  } finally {pointers.forEach(p=>module._free(p));}
}
const report={schema:1,status:records.every(r=>r.finite)?'bounded-arithmetic-candidate':'rejected',variant:'cmseg-'+variant,fixture:selected,scope:'Full global correlation on unchanged native feature tensors. No full browser network, mask or UI qualification. All pairs evaluated twice, sorted top-k values; float32 reduction/GEMM arithmetic differs from native and is measured.',records,sources:{}};
for(const name of ['experiments/segmentation/cmseg-correlation.cpp','scripts/check-cmseg-correlation.mjs','.build/cmseg-correlation/build.json'])report.sources[name]=hash(await readFile(new URL(name,root)));
await writeFile(new URL('docs/cmseg-'+variant+'-'+selected+'-native-axes-correlation-candidate.json',root),JSON.stringify(report,null,2)+'\n');
