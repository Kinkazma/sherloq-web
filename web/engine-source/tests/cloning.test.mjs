import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createEngine} from '../src/index.js';
import {cloningAdmission} from '../src/cloning.js';
import {cloningImageHeapBound,cloningNormFunction} from '../src/cloning-math.js';
import {cloningGeometry} from '../src/cloning-post.js';
import {cloningFixture,compareCloning,verifyCloningPrimitives} from './cloning-reference.js';
const fixtureRoot=new URL('../fixtures/cloning/',import.meta.url),reference=JSON.parse(await readFile(new URL('reference.json',fixtureRoot))),compressed=await readFile(new URL('reference.bin.gz',fixtureRoot)),payload=gunzipSync(compressed),sha=data=>createHash('sha256').update(data).digest('hex'),read=(file,Type)=>cloningFixture(reference,payload,file,Type);
const task={id:'orb',imageId:'image',operation:'tampering.copyMove.orb'};
test('ORB native arithmetic primitives and reference identities',async()=>{
  assert.equal(sha(compressed),reference.payload.compressedSha256);assert.equal(sha(payload),reference.payload.sha256);
  assert.deepEqual(await verifyCloningPrimitives(reference,read),{norms:10000,standardDeviations:80,boundaries:90});
});
test('ORB PNG, binary-mask, geometry and rendering pipelines match native',async()=>{
  const engine=createEngine({memoryBudgetBytes:1024**3,cpuKernel:'single'});let image,mask;
  try{
    for(const item of reference.cases){
      if(item.image!==image){if(mask&&mask!=='all')engine.unload('mask');if(image)engine.unload('image');await engine.loadBlob({id:'image',blob:new Blob([read(item.inputFile??item.image+'.png')])});image=item.image;mask='all';}
      if(item.mask!==mask){if(mask!=='all')engine.unload('mask');if(item.mask!=='all')await engine.loadBlob({id:'mask',blob:new Blob([read(item.image+'-'+item.mask+'-mask.png')])});mask=item.mask;}
      if(item.error){const stop=new AbortController();await assert.rejects(engine.run({...task,params:item.params},{signal:stop.signal,onProgress:e=>{if(e.fraction>=.25)stop.abort();}}),{code:'CANCELLED'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);continue;}
      const progress=[],result=await engine.run({...task,params:{...item.params,maskImageId:item.mask==='all'?null:'mask'}},{onProgress:e=>progress.push(e.fraction)});
      assert.ok(progress.every((x,i)=>!i||x>=progress[i-1]));compareCloning(result,item,read);
    }
    if(mask!=='all')engine.unload('mask');engine.unload('image');const memory=engine.capabilities().memory;assert.equal(memory.retainedBytes+memory.cacheBytes+memory.activeReservationBytes,0);
  }finally{engine.dispose();}
});
test('ORB caches, owned results, mask invalidation, admission and cancellation',async()=>{
  const engine=createEngine({memoryBudgetBytes:1024**3,cpuKernel:'single'}),item=reference.cases.find(x=>x.image==='shapes'&&x.mask==='all'),params=item.params;
  try{
    const bytes=read('shapes.png');await engine.loadBlob({id:'image',blob:new Blob([bytes])});
    for(const bad of [{response:-1},{response:101},{response:NaN},{matching:0},{distance:101},{minimum:0},{minimum:2.5},{showPoints:1},{hideLines:'false'},{maskImageId:''},{algorithm:'brisk'}])await assert.rejects(engine.run({...task,params:bad}),{code:'INVALID_INPUT'});
    await assert.rejects(engine.run({...task,backend:'webgpu'}),{code:'UNSUPPORTED_BACKEND'});await assert.rejects(engine.run({...task,regions:[{}]}),{code:'UNSUPPORTED_REGION'});
    assert.throws(()=>cloningImageHeapBound(6,100),{code:'INVALID_INPUT'});assert.equal(cloningImageHeapBound(16384,16384),2*1024**3);
    const first=await engine.run({...task,params});compareCloning(first,item,read);
    first.data.points.fill(9);first.data.groupIndices.fill(9);first.pixels.data.fill(9);
    const cached=await engine.run({...task,params});assert.equal(cached.metrics.cache.result,true);compareCloning(cached,item,read);
    const style=await engine.run({...task,params:{...params,hideLines:true}});assert.equal(style.metrics.cache.result,true);
    const minimum=await engine.run({...task,params:{...params,minimum:1}});assert.equal(minimum.metrics.cloningMatchingMs,0);assert.equal(minimum.metrics.cloningClusteringMs,0);assert.equal(minimum.metrics.cloningGroupWorkers,0);assert.equal(minimum.metrics.cache.stages[`geometry/${params.response}/${params.matching}/auto/${params.distance}`],true);
    const json=JSON.parse(new TextDecoder().decode(engine.exportResult(cached).bytes));assert.equal(json.provenance.params.minimum,5);assert.equal(json.data.algorithm,'ORB');
    await engine.loadBlob({id:'mask',blob:new Blob([read('shapes-half-mask.png')])});
    const masked=await engine.run({...task,params:{...params,maskImageId:'mask'}});assert.equal(masked.provenance.references[0].imageId,'mask');engine.unload('mask');
    await engine.loadBlob({id:'mask',blob:new Blob([read('shapes-sparse-mask.png')])});const changed=await engine.run({...task,params:{...params,maskImageId:'mask'}});assert.equal(changed.metrics.cache.result,false);assert.notEqual(changed.provenance.references[0].originalSha256,masked.provenance.references[0].originalSha256);engine.unload('mask');
    await engine.loadBlob({id:'mask',blob:new Blob([read('flat.png')])});await assert.rejects(engine.run({...task,params:{maskImageId:'mask'}}),{code:'INVALID_INPUT'});engine.unload('mask');assert.equal(engine.capabilities().memory.activeReservationBytes,0);
    const cancel=new AbortController();await assert.rejects(engine.run({...task,params:{matching:35}},{signal:cancel.signal,onProgress:e=>{if(e.fraction>=.5&&e.fraction<1)cancel.abort();}}),{code:'CANCELLED'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);compareCloning(await engine.run({...task,params}),item,read);
    const pixels=engine.imagePixels('image'),retained=bytes.length+pixels.data.length,resident=engine.capabilities().memory.knownHeapCapacityBytes,limit=resident+cloningAdmission(pixels)+retained,limited=createEngine({memoryBudgetBytes:limit,cpuKernel:'single'});let reached=0;
    try{await limited.load({id:'image',bytes,pixels});await assert.rejects(limited.run(task,{onProgress:e=>{reached=Math.max(reached,e.fraction);}}),{code:'MEMORY_LIMIT'});assert.ok(reached>0,'Admission failure during useful work');assert.equal(limited.capabilities().memory.activeReservationBytes,0);}finally{limited.dispose();}
  }finally{engine.dispose();}
});

test('ORB geometry resource retry preserves native groups and monotonic progress',async()=>{
  const item=reference.primitives.geometry.find(x=>x.matches.length>=6),progress=[],pool={async run(input,{onProgress}){onProgress(.8);return {metrics:{cloningGroupWorkers:1,cloningGroupScheduling:{taskExecutions:2,retry:{code:'MEMORY_LIMIT'}}}};}};
  const result=await cloningGeometry(Float64Array.from(item.points),Float64Array.from(item.matches),item.distance,await cloningNormFunction(),{pairCache:'on',pool,poolMinimum:0,onProgress:f=>progress.push(f)});
  assert.deepEqual(Array.from(result.lengths),item.lengths);assert.deepEqual(Array.from(result.groups),item.groups);assert.ok(progress.every((value,i)=>!i||value>=progress[i-1]));assert.equal(progress.at(-1),1);assert.equal(result.metrics.cloningGroupScheduling.retry.code,'MEMORY_LIMIT');
});
