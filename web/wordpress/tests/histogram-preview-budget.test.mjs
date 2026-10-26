import test from 'node:test';
import assert from 'node:assert/strict';
import {createToolClient} from '../sherloq-browser/assets/tool-client.js';
import {histogramSummary} from '../sherloq-browser/assets/unified-engine/src/histogram.js';

const originalFetch=globalThis.fetch;
function fixture(){
 const bins=Float64Array.from({length:1024},(_,i)=>(i%256)%17),cumulative=new Float64Array(1024);
 for(let c=0;c<4;c++){let n=0;for(let i=0;i<256;i++)cumulative[c*256+i]=n+=bins[c*256+i];}
 const native={id:'histogram',imageId:'source',operation:'inspection.histogram',status:'ok',data:{bins,cumulative,uniqueColors:10,uniqueRatio:.49,summary:histogramSummary(bins,3,0,255,cumulative[255])},provenance:{params:{channel:3,start:0,end:255}}};
 const calls={native:0,sourceReads:0,leases:[],released:[]};let next=0;
 const engine={async loadBlob({id}){return{id,sha256:'source-hash',surface:{id:'original',revision:1,width:120,height:17,format:'rgb8'}};},async run(){calls.native++;return native;},async capabilities(){return{memory:{budgetBytes:128*1024**2,retainedBytes:128*1024**2-128*1024,cacheBytes:0,activeReservationBytes:0,knownHeapCapacityBytes:0}};},async reserveExternalMemory({bytes}){if(bytes>128*1024)throw Object.assign(Error('Only bounded summary workspace remains'),{code:'MEMORY_LIMIT'});const id=++next;calls.leases.push({id,bytes});return{id};},async releaseExternalMemory(id){calls.released.push(id);},async readDisplay(){calls.sourceReads++;throw Error('Histogram presentation must not read source pixels');},async releaseSurface(){},async unload(){},async dispose(){}};
 return{native,calls,engine};
}

test('retained histogram previews fit a small summary workspace without a raster allowance',async()=>{
 globalThis.fetch=async()=>({json:async()=>({assetBase:'./'})});const f=fixture(),client=await createToolClient({engineFactory:()=>f.engine});
 try{await client.load({id:'source',blob:new Blob()});await client.run({id:'histogram',operation:'inspection.histogram',params:f.native.provenance.params});
  for(const channel of [0,1,2,3])for(const [start,end]of [[0,255],[17,220],[220,17],[0,0],[255,255]]){
   const answer=await client.previewParameters({operation:'inspection.histogram',params:{channel,start,end}},{field:'start'});
   assert.deepEqual(answer.data.summary,histogramSummary(f.native.data.bins,channel,start,end,f.native.data.cumulative[255]));assert.equal(answer.summaryExact,true);assert.equal(answer.metrics.sourceReads,0);assert.equal(answer.data.bins,f.native.data.bins);assert.equal(client.result,f.native);
  }
  assert.equal(f.calls.native,1);assert.equal(f.calls.sourceReads,0);assert.equal(f.calls.leases.length,20);assert.ok(f.calls.leases.every(x=>x.bytes<=65536));assert.deepEqual(f.calls.released,f.calls.leases.map(x=>x.id));
  const final=await client.updateRetainedParameters({operation:'inspection.histogram',params:{channel:1,start:23,end:167}});assert.deepEqual(final.data.summary,histogramSummary(f.native.data.bins,1,23,167,f.native.data.cumulative[255]));assert.equal(final.metrics.previewCommit.nativeAnalysisCalls,0);assert.equal(f.calls.native,1);
 }finally{await client.dispose();globalThis.fetch=originalFetch;}
});

test('invalid and cancelled histogram drafts release their small lease without replacing native bins',async()=>{
 globalThis.fetch=async()=>({json:async()=>({assetBase:'./'})});const f=fixture(),client=await createToolClient({engineFactory:()=>f.engine});
 try{await client.load({id:'source',blob:new Blob()});await client.run({id:'histogram',operation:'inspection.histogram'});
  await assert.rejects(client.previewParameters({operation:'inspection.histogram',params:{channel:7}},{field:'channel'}),{code:'INVALID_INPUT'});
  const ac=new AbortController(),reserve=f.engine.reserveExternalMemory;f.engine.reserveExternalMemory=async x=>{const lease=await reserve(x);ac.abort();return lease;};
  await assert.rejects(client.previewParameters({operation:'inspection.histogram',params:{}},{field:'start',signal:ac.signal}),{code:'CANCELLED'});
  assert.equal(client.result,f.native);assert.equal(f.calls.native,1);assert.deepEqual(f.calls.released,f.calls.leases.map(x=>x.id));assert.equal(f.calls.leases.length,2);
 }finally{await client.dispose();globalThis.fetch=originalFetch;}
});

test('queued histogram drafts cannot outlive a source replacement',async()=>{
 globalThis.fetch=async()=>({json:async()=>({assetBase:'./'})});const f=fixture(),client=await createToolClient({engineFactory:()=>f.engine});let unblock;
 try{await client.load({id:'source',blob:new Blob()});await client.run({id:'histogram',operation:'inspection.histogram'});
  let entered;const blocked=new Promise(r=>unblock=r),started=new Promise(r=>entered=r);f.engine.readDisplay=async()=>{entered();await blocked;return{pixels:{width:1,height:1,format:'rgb8',data:new Uint8Array(3)}};};
  const reading=client.readTile(client.source.surface,{x:0,y:0,w:1,h:1,step:1});await started;
  const loading=client.load({id:'replacement',blob:new Blob()});
  const draft=client.previewParameters({operation:'inspection.histogram',params:{start:123}},{field:'start'});const caught=draft.then(x=>({value:x}),e=>({code:e.code}));
  await Promise.resolve();await Promise.resolve();unblock();await reading;await loading;
  const settled=await caught;assert.ok(settled.code==='CANCELLED'||settled.value===null,'old draft must not publish after a source change');assert.equal(client.source.id,'replacement');assert.equal(client.result,null);assert.equal(f.calls.native,1);assert.deepEqual(f.calls.released,f.calls.leases.map(x=>x.id));
 }finally{unblock?.();await client.dispose();globalThis.fetch=originalFetch;}
});

test('closing a client during summary admission prevents late publication and releases its lease',async()=>{
 globalThis.fetch=async()=>({json:async()=>({assetBase:'./'})});const f=fixture(),client=await createToolClient({engineFactory:()=>f.engine});let closing;
 try{await client.load({id:'source',blob:new Blob()});await client.run({id:'histogram',operation:'inspection.histogram'});
  const reserve=f.engine.reserveExternalMemory;f.engine.reserveExternalMemory=async args=>{const lease=await reserve(args);closing=client.dispose();return lease;};
  await assert.rejects(client.previewParameters({operation:'inspection.histogram',params:{start:100}},{field:'start'}),{code:'CANCELLED'});await closing;assert.deepEqual(f.calls.released,f.calls.leases.map(x=>x.id));
 }finally{await(closing??client.dispose());globalThis.fetch=originalFetch;}
});
