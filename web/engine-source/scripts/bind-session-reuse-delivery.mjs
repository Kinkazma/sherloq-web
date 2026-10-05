import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),version=JSON.parse(await readFile(new URL('package.json',root))).version;
assert.equal(version,'0.30.0-m1.37');
const copied=new URL('.build/segmentation-runtime-'+version+'/',root),baselineRoot=new URL('.build/segmentation-runtime-0.30.0-m1.36/',root);
const hash=b=>createHash('sha256').update(b).digest('hex'),read=async file=>JSON.parse(await readFile(new URL('docs/'+file,root)));
const bytes=await readFile(new URL('runtime-manifest.json',copied)),manifest=JSON.parse(bytes),manifestSha256=hash(bytes),baselineSha256=hash(await readFile(new URL('runtime-manifest.json',baselineRoot)));
assert.equal(manifest.version,version);
for(const spec of manifest.files){const b=await readFile(new URL(spec.file,copied));assert.equal(b.length,spec.bytes);assert.equal(hash(b),spec.sha256);assert.equal(hash(await readFile(new URL(spec.file,root))),spec.sha256);}
async function checkSources(p,base){for(const [file,sha]of Object.entries(p.sources))assert.equal(hash(await readFile(new URL(file,base))),sha,file);}
function checkInference(p,sha){
 assert.equal(p.status,'passed');
 for(const r of p.records){assert.equal(r.sha256,sha);assert.equal(r.maskChanges,0);assert(r.probability.maxAbs<=1e-4&&r.foreground>0);assert(r.memory.peakAccountedBytes<=r.memory.budgetBytes);}
 for(const key of ['retainedBytes','cacheBytes','activeReservationBytes'])assert.equal(p.memory[key],0);
}
const variants=[];
for(const variant of ['mgcfdn-vig','mgcfdn-tnt','cmseg-generalization']){
 const baseline=await read('session-reuse-'+variant+'-baseline-m1-36-proof.json'),candidate=await read('session-reuse-'+variant+'-candidate-proof.json'),sha=baseline.records[0].sha256;
 checkInference(baseline,sha);checkInference(candidate,sha);assert.equal(baseline.runtimeManifestSha256,baselineSha256);
 await checkSources(baseline,baselineRoot);await checkSources(candidate,copied);
 for(const r of candidate.records.slice(1,3)){
  assert.equal(r.modelRequests,0);assert.equal(r.modelBytes,0);assert.equal(r.parameterRequests,0);
  assert.equal(r.sessionCache.creations,0);assert.equal(r.sessionCache.reuses,1);assert.equal(r.sessionCache.pressureEvictions,0);
  assert.equal(r.workers,baseline.records[0].workers);
 }
 assert.equal(candidate.records[3].modelRequests,baseline.records[0].modelRequests);assert.equal(candidate.records[3].sessionCache.creations,1);
 assert(candidate.afterPressure.activeReservationBytes<=candidate.afterPressure.budgetBytes);
 variants.push({variant,probabilitySha256:sha,foreground:candidate.records[0].foreground,warmModelRequestsAvoided:baseline.records[0].modelRequests,warmModelBytesAvoided:baseline.records[0].modelBytes,modelWorkerCapacity:candidate.records[0].sessionCache.residentBytesAfterInference,baselinePeak:baseline.memory.peakAccountedBytes,candidatePeak:candidate.memory.peakAccountedBytes,workers:candidate.records[0].workers});
}
const constrained=await read('session-reuse-mgcfdn-vig-one-gib-proof.json');checkInference(constrained,variants[0].probabilitySha256);await checkSources(constrained,copied);
assert.equal(constrained.budgetMiB,1024);for(const r of constrained.records.slice(1)){assert.equal(r.sessionCache.pressureEvictions,1);assert.equal(r.sessionCache.creations,1);assert.equal(r.sessionCache.reuses,0);assert.equal(r.parameterRequests,0);}
const large=await read('neural-segmented-mgcfdn-vig-large-rich-webgpu-m1-37-candidate-proof.json'),largeNpz=await read('neural-segmented-mgcfdn-vig-large-rich-webgpu-m1-37-candidate-npz-proof.json'),baselineLarge=await read('neural-segmented-mgcfdn-vig-large-rich-webgpu-m1-36-candidate-proof.json');
const actual=await read('neural-segmented-mgcfdn-vig-webgpu-m1-37-extracted-proof.json'),actualNpz=await read('neural-segmented-mgcfdn-vig-webgpu-m1-37-extracted-npz-proof.json'),cpu=await read('neural-segmented-mgcfdn-tnt-cpu-m1-37-extracted-proof.json'),cpuNpz=await read('neural-segmented-mgcfdn-tnt-cpu-m1-37-extracted-npz-proof.json');
for(const p of [large,largeNpz,baselineLarge,actual,actualNpz,cpu,cpuNpz])assert.equal(p.status,'passed');
await checkSources(large,copied);
for(let i=0;i<large.records.length;i++)for(const [key,value]of Object.entries(large.records[i].outputs))assert.equal(value.sha256,baselineLarge.records[i].outputs[key].sha256);
for(const p of [large,actual]){
 assert.equal(p.requestedBackend,'auto');assert.equal(p.records[0].metrics.execution.backend,'webgpu-cpu');
 assert(p.checks.parameterReuse&&p.checks.parameterCacheOnlyView&&p.checks.sessionReuse&&p.checks.sessionCacheOnlyView);
 assert.equal(p.records[0].metrics.execution.sessionCache.creations,1);assert.equal(p.records[0].metrics.execution.sessionCache.reuses,2);
 assert.equal(p.records[1].inferences,0);for(const key of ['creations','reuses','pressureEvictions'])assert.equal(p.records[1].metrics.execution.sessionCache[key],0);
}
for(const p of [large,actual,cpu]){for(const key of ['retainedBytes','cacheBytes','activeReservationBytes'])assert.equal(p.memory[key],0);assert(p.memory.peakAccountedBytes<=p.memory.budgetBytes);}
for(const p of [actual,cpu]){assert.equal(p.runtimeManifestSha256,manifestSha256);assert(p.checks.cancelled&&p.checks.retry);}
assert.equal(cpu.records[0].metrics.execution.backend,'cpu');assert(cpu.records[0].metrics.execution.observedLinearWorkers>0);assert.equal(cpu.records[0].metrics.execution.sessionCache,undefined);
const proof={schema:1,status:'passed',version,runtimeFiles:manifest.files.length,runtimeManifestSha256:manifestSha256,scope:'All copied runtime bytes and candidate component/96MP execution sources match exactly. Baseline copies retain parameter caching and differ only in session lifetime. Actual2GiB warm/6MiB pressure runs and1GiB useful-work reclamation, identical probability SHA/native masks. Fresh copied auto-GPU and explicit-CPU API, JPEG zones, cache-only views, complete NPZ/telemetry, cancellation and reload. Largest-cache VIG96MP all plane SHA equal M1.36; distinct unchanged TNT/CMSeg96MP arithmetic/output paths are reused explicitly. No WordPress or universal-device claim.',variants,constrained:{budgetMiB:1024,peakAccountedBytes:constrained.memory.peakAccountedBytes,parameterRequestsWarm:0,sessionPressureEvictionsPerWarmInference:1},large:{width:12000,height:8000,foreground:large.records[0].outputs.mask.nonzero,arrays:largeNpz.records.length,exportBytes:largeNpz.bytes,exportSha256:largeNpz.sha256,peakAccountedBytes:large.memory.peakAccountedBytes,sessionCache:large.records[0].metrics.execution.sessionCache,allPlaneHashesEqualToM1_36:true},copied:{automaticGpu:true,explicitCpu:true,cancelled:true,retry:true}};
await writeFile(new URL('docs/session-reuse-delivery-binding.json',root),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({status:proof.status,version,runtimeFiles:manifest.files.length}));
