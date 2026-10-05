import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createEngine} from '../src/index.js';
import {cloningAKAZEAdmission} from '../src/cloning.js';
import {cloningFixture,compareCloning} from './cloning-reference.js';
const fixtureRoot=new URL('../fixtures/akaze/',import.meta.url),reference=JSON.parse(await readFile(new URL('reference.json',fixtureRoot))),compressed=await readFile(new URL('reference.bin.gz',fixtureRoot)),payload=gunzipSync(compressed),sha=data=>createHash('sha256').update(data).digest('hex'),read=(file,Type)=>cloningFixture(reference,payload,file,Type);
const task={id:'akaze',imageId:'image',operation:'tampering.copyMove.akaze'};
test('AKAZE complete native PNG/mask and original JPEG/TIFF pipelines are exact',async()=>{
  assert.equal(sha(compressed),reference.payload.compressedSha256);assert.equal(sha(payload),reference.payload.sha256);
  const engine=createEngine({memoryBudgetBytes:1024**3,cpuKernel:'single'});let image,mask,admittedHeap=0;
  try{
    for(const item of reference.cases){
      if(item.image!==image){if(mask&&mask!=='all')engine.unload('mask');if(image)engine.unload('image');await engine.loadBlob({id:'image',blob:new Blob([read(item.inputFile??item.image+'.png')])});image=item.image;mask='all';}
      if(item.mask!==mask){if(mask!=='all')engine.unload('mask');if(item.mask!=='all')await engine.loadBlob({id:'mask',blob:new Blob([read(item.image+'-'+item.mask+'-mask.png')])});mask=item.mask;}
      const params={...item.params,maskImageId:mask==='all'?null:'mask'};
      if(item.error){await assert.rejects(engine.run({...task,params}),{code:'MEMORY_LIMIT'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);continue;}
      const progress=[],result=await engine.run({...task,params},{onProgress:e=>progress.push(e.fraction)});
      admittedHeap=Math.max(admittedHeap,result.pixels.width*result.pixels.height*256+160*1024**2);
      assert.ok(result.metrics.memory.cloningHeapCapacityBytes<=admittedHeap,'Actual linear heap stays within the admission bound');
      assert.ok(progress.every((x,i)=>!i||x>=progress[i-1]));compareCloning(result,item,read,'AKAZE');
      if(item.originalSha256)assert.equal(result.provenance.originalSha256,item.originalSha256);
    }
    if(mask!=='all')engine.unload('mask');engine.unload('image');const memory=engine.capabilities().memory;assert.equal(memory.retainedBytes+memory.cacheBytes+memory.activeReservationBytes,0);
  }finally{engine.dispose();}
});
test('AKAZE cache identity, explicit detector choice, owned outputs, budget and cancellation',async()=>{
  const engine=createEngine({memoryBudgetBytes:1024**3,cpuKernel:'single'}),item=reference.cases.find(x=>x.image==='shapes'&&x.mask==='all'),params=item.params;
  try{
    const bytes=read('shapes.png');await engine.loadBlob({id:'image',blob:new Blob([bytes])});
    await assert.rejects(engine.run({...task,params:{algorithm:'orb'}}),{code:'INVALID_INPUT'});
    await assert.rejects(engine.run({...task,backend:'webgpu'}),{code:'UNSUPPORTED_BACKEND'});
    await assert.rejects(engine.run({...task,regions:[{}]}),{code:'UNSUPPORTED_REGION'});
    const first=await engine.run({...task,params});compareCloning(first,item,read,'AKAZE');
    const orb=await engine.run({...task,operation:'tampering.copyMove.orb',params});assert.equal(orb.data.algorithm,'ORB');assert.equal(orb.metrics.cache.stages.detected,false);assert.notDeepEqual(orb.data.points,first.data.points);
    first.data.points.fill(9);first.data.groupIndices.fill(9);first.pixels.data.fill(9);
    const cached=await engine.run({...task,params});assert.equal(cached.metrics.cache.result,true);compareCloning(cached,item,read,'AKAZE');
    const style=await engine.run({...task,params:{...params,hideLines:true}});assert.equal(style.metrics.cache.result,true);
    const minimum=await engine.run({...task,params:{...params,minimum:1}});assert.equal(minimum.metrics.cloningMatchingMs,0);assert.equal(minimum.metrics.cloningClusteringMs,0);assert.equal(minimum.metrics.cloningGroupWorkers,0);
    const json=JSON.parse(new TextDecoder().decode(engine.exportResult(cached).bytes));assert.equal(json.data.algorithm,'AKAZE');assert.equal(json.provenance.params.minimum,5);
    await engine.loadBlob({id:'mask',blob:new Blob([read('shapes-half-mask.png')])});
    const masked=await engine.run({...task,params:{...params,maskImageId:'mask'}});engine.unload('mask');
    await engine.loadBlob({id:'mask',blob:new Blob([read('shapes-sparse-mask.png')])});
    const changed=await engine.run({...task,params:{...params,maskImageId:'mask'}});assert.equal(changed.metrics.cache.result,false);assert.notEqual(changed.provenance.references[0].originalSha256,masked.provenance.references[0].originalSha256);engine.unload('mask');
    await engine.loadBlob({id:'mask',blob:new Blob([read('flat.png')])});await assert.rejects(engine.run({...task,params:{maskImageId:'mask'}}),{code:'INVALID_INPUT'});engine.unload('mask');
    const cancel=new AbortController();await assert.rejects(engine.run({...task,params:{matching:35}},{signal:cancel.signal,onProgress:e=>{if(e.fraction>=.5&&e.fraction<1)cancel.abort();}}),{code:'CANCELLED'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);compareCloning(await engine.run({...task,params}),item,read,'AKAZE');
    const pixels=engine.imagePixels('image'),resident=engine.capabilities().memory.knownHeapCapacityBytes,limited=createEngine({memoryBudgetBytes:resident+cloningAKAZEAdmission(pixels)+bytes.length+pixels.data.length,cpuKernel:'single'});let reached=0;
    try{await limited.load({id:'image',bytes,pixels});await assert.rejects(limited.run(task,{onProgress:e=>{reached=Math.max(reached,e.fraction);}}),{code:'MEMORY_LIMIT'});assert.ok(reached>0);assert.equal(limited.capabilities().memory.activeReservationBytes,0);}finally{limited.dispose();}
  }finally{engine.dispose();}
});
