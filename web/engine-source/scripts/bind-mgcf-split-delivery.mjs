// Qualify the exact immutable delivery, preserving rejected graph placements.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),version=JSON.parse(await readFile(new URL('package.json',root))).version;
assert.equal(version,'0.30.0-m1.42');
const copied=new URL('.build/segmentation-runtime-'+version+'/',root),hash=b=>createHash('sha256').update(b).digest('hex');
const proofHashes={},read=async name=>{const b=await readFile(new URL('docs/'+name,root));proofHashes[name]=hash(b);return JSON.parse(b);};
const bytes=await readFile(new URL('runtime-manifest.json',copied)),manifest=JSON.parse(bytes),manifestSha256=hash(bytes);
assert.equal(manifest.version,version);
for(const spec of manifest.files){const b=await readFile(new URL(spec.file,copied));assert.equal(b.length,spec.bytes);assert.equal(hash(b),spec.sha256);assert.equal(hash(await readFile(new URL(spec.file,root))),spec.sha256);}
const {SEGMENTATION_MODELS:models}=await import(new URL('experiments/segmentation/models.js',copied));
const {validateSplitModel}=await import(new URL('experiments/segmentation/split-model.js',copied));
async function sources(proof){for(const[file,sha]of Object.entries({...proof.sources,...proof.recipeSources})){const runtime=/^(src|vendor|experiments)\//.test(file);assert.equal(hash(await readFile(new URL(file,runtime?copied:root))),sha,file);}}
function memory(m){assert(m.peakAccountedBytes<=m.budgetBytes);for(const key of ['retainedBytes','cacheBytes','activeReservationBytes'])assert.equal(m[key],0);}
function execution(browser,model){
  assert.equal(browser.requestedBackend,'auto');assert.equal(browser.records[0].inferences,3);assert.equal(browser.records[1].inferences,0);
  const e=browser.records[0].metrics.execution;assert.equal(e.backend,'webgpu-cpu');assert.equal(e.onnxStages,2);assert.deepEqual(e.stageBackends,model.gpu.stageBackends);assert.equal(e.intermediateBytes,4096008);assert(e.gpuPeakBufferBytes>0&&e.gpuPeakBufferBytes<=512*1024**2);
  assert(browser.records[0].metrics.timings.encoderMs>0&&browser.records[0].metrics.timings.headMs>0);
  assert.equal(browser.floatTolerance,model.gpu.probabilityTolerance??1e-4);
}
function exportPair(browser,npz,arrays,tolerance){
  assert.equal(browser.status,'passed');assert.equal(npz.status,'passed');assert.equal(browser.exported.sha256,npz.sha256);assert.equal(browser.exported.byteLength,npz.bytes);assert.equal(npz.records.length,arrays);assert.equal(npz.floatTolerance,tolerance);
  for(const row of browser.records){assert.equal(Object.keys(row.outputs).length,arrays);for(const[name,value]of Object.entries(row.outputs)){assert(value.accepted&&value.finite);if(['mask','analyzed','candidates'].includes(name))assert.equal(value.different,0);else assert(value.maxAbs<=tolerance);}}
  for(const row of npz.records){assert(row.accepted);assert.equal(row.sha256,browser.records.at(-1).outputs[row.array].sha256);if(['mask','analyzed','candidates'].includes(row.array))assert.equal(row.different,0);else assert(row.maxAbs<=tolerance);}
  memory(browser.memory);
}
const pinned=JSON.parse(await readFile(new URL('vendor/segmentation/GPU-CACHE-PINNED.json',copied)));
assert.equal(hash(await readFile(new URL('vendor/segmentation/ort.all.min.mjs',copied))),pinned.upstreamSha256);
const patched=await readFile(new URL('vendor/segmentation/'+pinned.file,copied));assert.equal(hash(patched),pinned.files['ort.all.min.mjs'].sha256);assert.equal(patched.length,pinned.files['ort.all.min.mjs'].bytes);
assert.equal(hash(await readFile(new URL('scripts/build-segmentation-gpu-cache.py',root))),pinned.scriptSha256);
assert.equal(pinned.maximumPerIdlePoolBytes,32795264);assert.equal(pinned.maximumBothIdlePoolsBytes,65590528);
const variants=[];
for(const variant of ['mgcfdn','mgcfdn-st']){
  const model=models[variant],spec={...model,...model.gpu},tolerance=spec.probabilityTolerance??1e-4,arrays=model.kind==='softmax'?6:4;
  const fixture=await readFile(new URL('fixtures/segmentation/gpu-split/'+variant+'.json',root));assert.equal(fixture.length,spec.bytes);assert.equal(hash(fixture),spec.sha256);
  const bundle=validateSplitModel(JSON.parse(fixture),spec);assert.equal(spec.cpuSha256,model.sha256);assert(spec.splitGraph&&!spec.sharedAssets);assert.equal(spec.bridgeBytes,12288024);
  assert.equal(hash(await readFile(new URL('.build/segmentation-models/'+variant+'/gpu-split-bundle.json',root))),spec.sha256);
  for(const stage of bundle.stages){const b=await readFile(new URL('.build/segmentation-models/'+variant+'/'+stage.file,root));assert.equal(b.length,stage.bytes);assert.equal(hash(b),stage.sha256);}
  const component=await read('mgcf-split-'+variant+'-workers-proof.json');assert.equal(component.status,'passed');assert.equal(component.conditions.length,2);await sources(component);
  for(const c of component.conditions){memory(c.memory);assert.equal(c.modelLoads,1);assert.equal(c.inferences,variant==='mgcfdn'?5:8);assert.equal(c.records.length,c.inferences);assert.equal(c.records[0].modelRequests,c.backend==='cpu'?1:3);assert.equal(c.records[0].modelBytes,c.backend==='cpu'?model.bytes:spec.bytes+spec.assetBytes);
    const repeated=c.records.slice(0,3);assert(repeated.every(r=>r.rawSha256===repeated[0].rawSha256));
    for(const r of c.records){assert(r.preparationExact);for(const name of ['probability','map',...(arrays===6?['target','source']:[])]){assert(r[name].finite);assert(r[name].maxAbs<=(c.backend==='cpu'?1e-4:tolerance));}assert.equal(r.mask.different,0);assert.deepEqual(r.components8.native,r.components8.browser);assert.equal(r.maskTransitions.length,0);if(r.run>0)assert.equal(r.modelRequests,0);}
  }
  const cpu=component.conditions.find(c=>c.backend==='cpu'),gpu=component.conditions.find(c=>c.backend==='webgpu');
  assert(gpu.records.every(r=>r.gpu.devices>0&&r.gpu.allocations>0&&r.gpu.peakAccountedBytes<=512*1024**2&&!r.gpu.errors.length&&r.timings.encoderMs>0&&r.timings.headMs>0));
  const actual=await read('neural-segmented-'+variant+'-webgpu-m1-42-extracted-proof.json'),npz=await read('neural-segmented-'+variant+'-webgpu-m1-42-extracted-npz-proof.json');await sources(actual);exportPair(actual,npz,arrays,tolerance);execution(actual,model);
  assert(actual.extractedRuntime);assert.equal(actual.runtimeManifestSha256,manifestSha256);assert(actual.checks.cancelled&&actual.checks.retry&&actual.checks.exportSha&&actual.checks.splitGraph);assert(actual.records[0].outputs.mask.nonzero>0);
  if(spec.numericalParity)assert.equal(npz.kernelParity,spec.numericalParity);
  variants.push({variant,cpuModelSha256:model.sha256,checkpointSha256:model.checkpointSha256,manifestSha256:spec.sha256,stages:bundle.stages,assetBytes:spec.assetBytes,bridgeReservedBytes:spec.bridgeBytes,continuousTolerance:tolerance,probabilityMax:Math.max(...gpu.records.map(r=>r.probability.maxAbs)),probabilityMaxMean:Math.max(...gpu.records.map(r=>r.probability.meanAbs)),maskDifferences:0,cpuMs:cpu.records.slice(0,3).map(r=>r.inferenceMs),hybridMs:gpu.records.slice(0,3).map(r=>r.inferenceMs),cpuPeak:cpu.memory.peakAccountedBytes,hybridPeak:gpu.memory.peakAccountedBytes,copiedApiMs:actual.records[0].rpcMs,cachedViewMs:actual.records[1].rpcMs,npzPreparationMs:actual.exportMs,copiedPeak:actual.memory.peakAccountedBytes,copiedForeground:actual.records.map(r=>r.outputs.mask.nonzero),npzSha256:npz.sha256,cancelledAfterEncoder:true,reloaded:true});
}
const large=await read('neural-segmented-mgcfdn-st-large-rich-webgpu-m1-42-candidate-proof.json'),largeNpz=await read('neural-segmented-mgcfdn-st-large-rich-webgpu-m1-42-candidate-npz-proof.json');await sources(large);exportPair(large,largeNpz,6,1e-4);execution(large,models['mgcfdn-st']);assert(large.rich&&large.large);assert.equal(large.exported.width,12000);assert.equal(large.exported.height,8000);assert(large.records.every(r=>r.outputs.mask.nonzero===3370950));
const rejected=[];
for(const name of ['segmentation-mgcfdn-gpu-concat-gpu-bounded-cache-candidate.json','segmentation-mgcfdn-gpu-concat-gpu-split-candidate.json','segmentation-mgcfdn-st-gpu-concat-gpu-split-candidate.json','segmentation-mgcfdn-st-gpu-concat-split-wasm-webgpu-candidate.json']){
  const p=await read(name);assert.equal(p.status,'rejected');memory(p.memory);await sources(p);
  if(name.includes('mgcfdn-st'))assert.equal(Math.max(...p.records.map(r=>r.mask.different)),3293);
  rejected.push({proof:name,status:p.status,maskDifferenceMaximum:p.records?.length?Math.max(...p.records.map(r=>r.mask.different)):null,reason:name.includes('bounded-cache')?'512MiB full-graph allocation refusal':name.includes('mgcfdn-st')?'GPU head decision divergence; exact cause unresolved':'Historical strict1e-4 threshold exceeded; later workers qualified separately under declared1e-3 continuous tolerance'});
}
const proof={schema:1,status:'passed',version,runtimeFiles:manifest.files.length,runtimeManifestSha256:manifestSha256,scope:'Exact copied runtime and execution/recipe-source binding. Separate pinned MGCF base/ST graph mirrors; bounded JSEP idle cache and full feature boundary. Actual workers, native continuous/decision corpus, cold/warm reuse, copied common API/cached view/full NPZ/cancel-after-useful-encoder/reload. New rich96MP ST six-plane path covers the larger-asset two-session adapter; base96MP is shared adapter coverage, not a newly executed base network. No WordPress, other-device or universal-speed claim.',runtimePatch:{upstreamSha256:pinned.upstreamSha256,sha256:hash(patched),maximumBothIdlePoolsBytes:pinned.maximumBothIdlePoolsBytes},variants,large:{width:12000,height:8000,arrays:6,foreground:3370950,map:large.records[0].outputs.map,loadMs:large.loadMs,analysisMs:large.records[0].rpcMs,cachedViewMs:large.records[1].rpcMs,npzPreparationMs:large.exportMs,peakBytes:large.memory.peakAccountedBytes,budgetBytes:large.memory.budgetBytes,exportBytes:largeNpz.bytes,exportSha256:largeNpz.sha256},rejected,proofHashes};
await writeFile(new URL('docs/mgcf-split-delivery-binding.json',root),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({status:proof.status,version,runtimeFiles:manifest.files.length,variants:variants.map(v=>v.variant)}));
