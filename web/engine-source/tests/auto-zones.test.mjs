import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {detectPanels,subimageWorkspaceBytes} from '../src/auto-zones.js';
import {createEngine,createAnalysisScopeController} from '../src/index.js';
const base=new URL('../fixtures/auto-zones/',import.meta.url),reference=JSON.parse(await readFile(new URL('reference.json',base))),compressed=await readFile(new URL('reference.bin.gz',base)),payload=gunzipSync(compressed);
const hash=value=>createHash('sha256').update(value).digest('hex');
const pixels=row=>({width:row.width,height:row.height,format:'rgb8',data:payload.subarray(row.pixels.offset,row.pixels.offset+row.pixels.length)});
const bytes=row=>payload.subarray(row.source.offset,row.source.offset+row.source.length);
const task={id:'panels',imageId:'image',operation:'subimages.detect'};
const regions=row=>row.polygons.map((p,i)=>({id:'panel-'+i,bounds:[p[0][0],p[0][1],p[2][0]+1,p[2][1]+1]}));
test('Panel polygons equal the native original-byte oracle across palette, morphology, geometry and codec boundaries',async()=>{
 assert.equal(hash(compressed),reference.payload.compressedSha256);assert.equal(hash(payload),reference.payload.sha256);
 for(const row of reference.cases){let accounted=0;const progress=[];const result=await detectPanels(pixels(row),{account:n=>accounted+=n,onProgress:f=>progress.push(f)});assert.deepEqual(result,row.polygons,row.name);assert.ok(accounted>=subimageWorkspaceBytes(pixels(row)));assert.ok(progress.every((f,i)=>f>=0&&f<=1&&(!i||f>=progress[i-1])));}
});
test('Detector checks initial admission and admits cancellation events during useful flat and coloured work',async()=>{
 const row=reference.cases.find(x=>x.name==='grid-7-255'),image=pixels(row);
 let admitted=0;await assert.rejects(detectPanels(image,{account:()=>{admitted++;throw new Error('denied');}}),/denied/);assert.equal(admitted,1);
 for(const name of ['flat-1031-1024','outer-edges-1031-1024']){const controller=new AbortController(),image=pixels(reference.cases.find(x=>x.name===name));const timer=setTimeout(()=>controller.abort(),1);try{await assert.rejects(detectPanels(image,{signal:controller.signal}),{code:'CANCELLED'});}finally{clearTimeout(timer);}}
 const controller=new AbortController();controller.abort();await assert.rejects(detectPanels(image,{signal:controller.signal}),{code:'CANCELLED'});
 await assert.rejects(detectPanels({...image,data:new Uint8Array(1)}),{code:'INVALID_INPUT'});
});
test('Original PNG/JPEG/TIFF decode, original-byte provenance, polygons, half-open bounds and JSON are exact',async()=>{
 const engine=createEngine({memoryBudgetBytes:256*1024**2});
 try{for(const row of reference.cases){
  const loaded=await engine.loadBlob({id:'image',blob:new Blob([bytes(row)],{type:row.mime})});
  assert.equal(loaded.sha256,row.source.sha256);assert.deepEqual(engine.original('image'),new Uint8Array(bytes(row)));
  assert.equal(hash(engine.imagePixels('image').data),row.pixels.sha256,row.name+' decoded pixels');
  const result=await engine.run(task);assert.deepEqual(result.data.polygons,row.polygons,row.name);assert.deepEqual(result.data.regions,regions(row));assert.equal(result.pixels,undefined);assert.deepEqual(result.layers,[]);
  assert.equal(result.provenance.originalSha256,row.source.sha256);assert.equal(result.provenance.backend,'cpu');assert.equal(result.metrics.memory.activeReservationBytes,0);
  const json=JSON.parse(new TextDecoder().decode(engine.exportResult(result).bytes));assert.deepEqual(json.data.regions,regions(row));
  engine.unload('image');assert.equal(engine.capabilities().memory.retainedBytes+engine.capabilities().memory.cacheBytes,0);
 }}finally{engine.dispose();}
});
test('Owned cache, resource refusals, cancelled useful work and actual scope detector adapter preserve explicit boundaries',async()=>{
 const engine=createEngine({memoryBudgetBytes:256*1024**2}),row=reference.cases.find(x=>x.name==='grid-7-255');
 try{
  await engine.loadBlob({id:'image',blob:new Blob([bytes(row)])});
  await assert.rejects(engine.run({...task,params:{threshold:15}}),{code:'INVALID_INPUT'});
  await assert.rejects(engine.run({...task,backend:'webgpu'}),{code:'UNSUPPORTED_BACKEND'});
  await assert.rejects(engine.run({...task,regions:[{}]}),{code:'UNSUPPORTED_REGION'});
  const first=await engine.run(task);assert.ok(first.data.regions.length);first.data.regions[0].bounds[0]=999;first.data.polygons[0][0][0]=999;
  const cached=await engine.run(task);assert.ok(cached.metrics.cache.result);assert.deepEqual(cached.data.regions,regions(row));assert.deepEqual(cached.data.polygons,row.polygons);
  const requests=[],controller=createAnalysisScopeController({imageId:'image',width:row.width,height:row.height,detectSubimages:async request=>(await engine.run(task,{signal:request.signal,onProgress:request.onProgress})).data.regions,analyze:async request=>{requests.push(request);return {testDouble:true};}});
  assert.equal((await controller.start()).status,'complete');assert.deepEqual(requests[0].regions,regions(row));controller.dispose();
  engine.unload('image');const flat=reference.cases.find(x=>x.name==='flat-1031-1024');await engine.loadBlob({id:'image',blob:new Blob([bytes(flat)])});
  const noRegions=createAnalysisScopeController({imageId:'image',width:flat.width,height:flat.height,detectSubimages:async request=>(await engine.run(task,{signal:request.signal})).data.regions,analyze:async()=>{throw Error('No fallback allowed');}});
  assert.equal((await noRegions.start()).status,'no-regions');noRegions.dispose();engine.unload('image');
  const large=reference.cases.find(x=>x.name==='outer-edges-1031-1024');await engine.loadBlob({id:'image',blob:new Blob([bytes(large)])});
  const controller2=new AbortController();await assert.rejects(engine.run(task,{signal:controller2.signal,onProgress:e=>{if(e.fraction>=.1&&e.fraction<1)controller2.abort();}}),{code:'CANCELLED'});assert.equal(engine.capabilities().memory.activeReservationBytes,0);
  assert.deepEqual((await engine.run(task)).data.polygons,large.polygons);
  const resident=engine.capabilities().memory.knownHeapCapacityBytes,limit=resident+Math.max(32*1024**2,subimageWorkspaceBytes(pixels(large))/2)+bytes(large).length+pixels(large).data.length;
  const limited=createEngine({memoryBudgetBytes:limit});
  try{
   await limited.load({id:'image',bytes:bytes(large),pixels:pixels(large)});
   // Fill retained sources after decoding, without changing the budget or image.
   // A 256² source needs less temporary space than the detector workspace.
   const filler={width:256,height:256,format:'rgb8',data:new Uint8Array(256*256*3)};let count=0;
   while(limit-limited.capabilities().memory.retainedBytes-Math.max(resident,32*1024**2)>=subimageWorkspaceBytes(pixels(large))){assert.ok(count<512);await limited.load({id:'filler-'+count++,bytes:new Uint8Array([1]),pixels:filler});}
   await assert.rejects(limited.run(task),{code:'MEMORY_LIMIT'});assert.equal(limited.capabilities().memory.activeReservationBytes,0);
   for(let i=0;i<count;i++)limited.unload('filler-'+i);
   assert.deepEqual((await limited.run(task)).data.polygons,large.polygons);
  }finally{limited.dispose();}
  const capabilities=engine.capabilities();
  assert.equal(capabilities.operations.find(operation=>operation.id==='analysis.complete')?.status,'available');
  assert.equal(capabilities.unavailable.includes('analysis.complete'),false);
 }finally{engine.dispose();}
});
