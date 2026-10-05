import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),version=JSON.parse(await readFile(new URL('package.json',root))).version;
assert.equal(version,'0.30.0-m1.36');
const copied=new URL('.build/segmentation-runtime-'+version+'/',root),baselineRoot=new URL('.build/segmentation-runtime-0.30.0-m1.35/',root);
const hash=b=>createHash('sha256').update(b).digest('hex'),read=async file=>JSON.parse(await readFile(new URL('docs/'+file,root)));
const manifestBytes=await readFile(new URL('runtime-manifest.json',copied)),manifest=JSON.parse(manifestBytes),manifestSha256=hash(manifestBytes),baselineManifestSha256=hash(await readFile(new URL('runtime-manifest.json',baselineRoot)));
assert.equal(manifest.version,version);
for(const spec of manifest.files){const b=await readFile(new URL(spec.file,copied));assert.equal(b.length,spec.bytes);assert.equal(hash(b),spec.sha256);assert.equal(hash(await readFile(new URL(spec.file,root))),spec.sha256);}
const variants=[];
for(const variant of ['mgcfdn-vig','mgcfdn-tnt','cmseg-generalization']){
 const baseline=await read('parameter-reuse-'+variant+'-baseline-m1-35-proof.json'),candidate=await read('parameter-reuse-'+variant+'-candidate-proof.json');
 for(const p of [baseline,candidate])assert.equal(p.status,'passed');
 assert.equal(baseline.runtimeManifestSha256,baselineManifestSha256);
 for(const [file,sha]of Object.entries(baseline.sources))assert.equal(hash(await readFile(new URL(file,baselineRoot))),sha,file);
 for(const [file,sha]of Object.entries(candidate.sources))assert.equal(hash(await readFile(new URL(file,copied))),sha,file);
 const sha=baseline.records[0].sha256;
 for(const p of [baseline,candidate]){
  for(const r of p.records){assert.equal(r.sha256,sha);assert.equal(r.maskChanges,0);assert(r.probability.maxAbs<=1e-4&&r.foreground>0);assert(r.memory.peakAccountedBytes<=r.memory.budgetBytes);if(variant==='cmseg-generalization')assert.equal(r.workers,6);}
  for(const key of ['retainedBytes','cacheBytes','activeReservationBytes'])assert.equal(p.memory[key],0);
 }
 for(const r of candidate.records.slice(1,3)){assert.equal(r.parameterRequests,0);assert.equal(r.parameterBytes,0);assert.equal(r.parameterCache.misses,0);assert.equal(r.parameterCache.hits,baseline.records[0].parameterRequests);}
 assert(candidate.records[3].parameterRequests>0&&candidate.records[3].parameterRequests<baseline.records[0].parameterRequests);
 assert(candidate.afterPressure.activeReservationBytes<=candidate.afterPressure.budgetBytes);
 variants.push({variant,probabilitySha256:sha,foreground:candidate.records[0].foreground,warmParameterRequestsAvoided:baseline.records[0].parameterRequests,warmParameterBytesAvoided:baseline.records[0].parameterBytes,retainedCapacity:candidate.records[0].parameterCache.residentBytesAfterInference,peakAccountedBytes:candidate.memory.peakAccountedBytes,pressure:candidate.afterPressure});
}
const large=await read('neural-segmented-mgcfdn-vig-large-rich-webgpu-m1-36-candidate-proof.json'),largeNpz=await read('neural-segmented-mgcfdn-vig-large-rich-webgpu-m1-36-candidate-npz-proof.json');
const baselineLarge=await read('neural-segmented-mgcfdn-vig-large-rich-webgpu-gpu-candidate-proof.json');
const actual=await read('neural-segmented-mgcfdn-vig-webgpu-m1-36-extracted-proof.json'),actualNpz=await read('neural-segmented-mgcfdn-vig-webgpu-m1-36-extracted-npz-proof.json');
for(const p of [large,largeNpz,baselineLarge,actual,actualNpz])assert.equal(p.status,'passed');
const matches=[];for(const [file,sha256]of Object.entries(large.sources)){assert.equal(hash(await readFile(new URL(file,copied))),sha256,file);matches.push({file,sha256});}
for(let i=0;i<large.records.length;i++)for(const [key,value]of Object.entries(large.records[i].outputs))assert.equal(value.sha256,baselineLarge.records[i].outputs[key].sha256);
for(const p of [large,actual]){
 assert.equal(p.requestedBackend,'auto');assert.equal(p.records[0].metrics.execution.backend,'webgpu-cpu');
 assert(p.checks.parameterReuse&&p.checks.parameterCacheOnlyView);assert.equal(p.records[1].inferences,0);
 for(const key of ['hits','misses','hitBytes','fetchBytes','evictions'])assert.equal(p.records[1].metrics.execution.parameterCache[key],0);
 for(const key of ['retainedBytes','cacheBytes','activeReservationBytes'])assert.equal(p.memory[key],0);
 assert(p.memory.peakAccountedBytes<=p.memory.budgetBytes);
}
assert.equal(actual.runtimeManifestSha256,manifestSha256);assert(actual.checks.cancelled&&actual.checks.retry);
const proof={schema:1,status:'passed',version,runtimeFiles:manifest.files.length,runtimeManifestSha256:manifestSha256,scope:'All immutable copied runtime bytes verified. Component parameter-cache sources match the delivery exactly. Large VIG GPU/controller/cache modules byte-identical; all full-resolution plane hashes match the earlier M1.33 GPU path. Fresh copied API checks auto GPU, useful inter-zone cache, zero-work cached view, full NPZ including telemetry, actual GPU cancellation and source reload. VIG exercises the largest shared parameter cache on96MP; TNT/CMSeg component pressure and earlier distinct96MP path proofs are explicitly reused, not rerun here. No WordPress/device-general claim.',variants,matches,large:{width:12000,height:8000,foreground:large.records[0].outputs.mask.nonzero,arrays:largeNpz.records.length,exportBytes:largeNpz.bytes,exportSha256:largeNpz.sha256,peakAccountedBytes:large.memory.peakAccountedBytes,parameterCache:large.records[0].metrics.execution.parameterCache,allPlaneHashesEqualToM1_33:true},copied:{automaticGpu:true,cancelled:true,retry:true}};
await writeFile(new URL('docs/parameter-reuse-delivery-binding.json',root),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({status:proof.status,version,runtimeFiles:manifest.files.length}));
