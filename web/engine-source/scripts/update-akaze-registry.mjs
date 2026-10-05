// Only run after qualification has passed against the final runtime bytes.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),read=async file=>JSON.parse(await readFile(new URL(file,root))),fixture=await read('fixtures/akaze/reference.json');
const detector=await read('docs/akaze-detector-study.json');
if(detector.cases!==128||detector.differentCounts||detector.differentFields||detector.differentDescriptorBytes)throw Error('Expanded detector qualification missing');
let productOutputs=0,nativeRefusals=0;
for(const browser of ['chrome','firefox','webkit'])for(const size of ['','large-']){
  const proof=await read('docs/akaze-parallel-'+size+browser+'-proof.json');
  if(proof.status!=='passed'||proof.algorithm!=='AKAZE'||proof.cpuKernel!=='auto'||proof.cases!==(size?61:fixture.cases.length)||!size&&proof.payloadSha256!==fixture.payload.sha256)throw Error('Current AKAZE product qualification missing: '+browser+size);
  for(const [file,expected]of Object.entries(proof.runtimeFiles)){const bytes=await readFile(new URL(file,root));if(createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Qualification source changed: '+file);}
  if(browser==='chrome'){productOutputs+=proof.records.filter(x=>!x.error).length;nativeRefusals+=proof.records.filter(x=>x.error).length;}
}
const registry=await read('docs/engine-registry.json'),row=registry.panels.find(x=>x.nativeId==='7:1');
Object.assign(row,{
  status:'partial',operations:['tampering.copyMove.orb','tampering.copyMove.akaze'],
  cpu:'Explicit ORB and AKAZE; pinned native arithmetic, descriptor strides32/61, equal-distance sorting, exact point-pair cache and independent grouping workers; BRISK unavailable',
  errors:`ORB has its separate 0.25 qualification. AKAZE:429 float32 primitives;128 detector cases/78626 keypoints;22 ordered Hamming boundary cases;${productOutputs} complete product outputs and${nativeRefusals} native memory refusals in each of Chrome/Firefox/WebKit. All declared point/match/group/statistic/RGB comparisons exact.`,
  measurements:'ORB: cloning-kernel-chrome-benchmark.json and cloning-chrome-benchmark.json. AKAZE: akaze-chrome-benchmark.json, 3 alternating cold useful runs with startup, warm reload, caches, illustrative display and accounting; auto medians6860.4ms/31555.9ms for512x384/1MP, one grouping worker useful in both modes, no parallel speedup claimed. Guarded FMA rejected as1.5-2%slower in akaze-fma-chrome-benchmark.json. Memory is not RSS.',
  integration:'Portable worker API, original-byte decoding, binary1 masks, operation-separated caches, owned outputs, bounded JSON and cancellation/reload; WordPress integration pending. Dense 1MP checker complete native pipeline remains unqualified because of quadratic grouping cost.',
  tests:'tests/cloning.test.mjs; tests/akaze.test.mjs; tests/cloning-descriptors.test.mjs; cloning-*/akaze-*-proof.json; COPY-MOVE-ORB.md; COPY-MOVE-AKAZE.md',
  memoryLayout:{status:'full-memory-only',detail:'ORB pyramid or AKAZE nonlinear evolution; detector-specific heap admission plus dynamic matches/groups/results and grouping workers under the same budget; no segmentation or hidden scientific changes'}
});
delete row.unavailableVariants.AKAZE;
await writeFile(new URL('docs/engine-registry.json',root),JSON.stringify(registry,null,2)+'\n');
console.log(JSON.stringify({nativeId:row.nativeId,operations:row.operations,productOutputs,nativeRefusals,status:row.status}));
