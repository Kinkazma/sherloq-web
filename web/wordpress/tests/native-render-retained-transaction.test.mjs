import test from 'node:test';import assert from 'node:assert/strict';
import {createToolClient} from '../sherloq-browser/assets/tool-client.js';
const gate=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve};};
async function fixture(){
 const priorFetch=globalThis.fetch,events=[],entered=gate(),answer=gate();let held=false,failOld=false;
 globalThis.fetch=async()=>({ok:true,json:async()=>({assetBase:'./',m3:{}})});
 const original={id:'im',sha256:'a'.repeat(64),surface:{id:'Original',revision:1,width:8,height:8,format:'rgb8'}},task={id:'base',operation:'tampering.copyMove.sparse',cloneWindowMode:'independent',params:{algorithm:'XFeat',limit:6000},view:{lines:true}};
 const raw={params:task.params,points:Float64Array.of(1,2,3,4,5,6,7),unknownNative:Uint16Array.of(11,13),counter:9007199254740995n,windowResults:[{id:'custom-zone-id',dataNatif:{full:true}}]};
 const result=(t,id)=>({id,operation:t.operation,status:'ok',cloneWindowMode:'independent',surface:{id:id+'-surface',revision:1,width:8,height:8,format:'rgb8'},provenance:{params:t.params,originalSha256:original.sha256,cloneWindowMode:'independent'},data:raw});
 const engine={async loadBlob(){return original;},async loadM3Models(){events.push('configure');},async run(t){events.push('native-analysis');return result(t,'old');},async renderRetainedNativeParameters(input,hooks){events.push({render:input});entered.resolve(hooks);if(held)await answer.promise;return result(input.task,'next');},async releaseSurface(id){events.push('release:'+id);if(failOld&&id==='old-surface'){failOld=false;throw 0;}},async releaseTable(){},async unload(){},async dispose(){}};
 const client=await createToolClient({engineFactory:()=>engine});await client.load({id:'im',blob:new Blob(['original'])});await client.run(task);
 return{client,task,raw,events,entered,answer,hold(){held=true;},refuseOld(){failOld=true;},async close(){answer.resolve();try{await client.release();await client.dispose();}finally{globalThis.fetch=priorFetch;}}};
}
test('sparse native-table final sends full raw tables, preserves science, and retries old ACK only after UI adoption',async()=>{
 const f=await fixture();try{
  f.refuseOld();const previous=f.client.result,next=await f.client.updateRetainedParameters({...f.task,view:{lines:false}},{field:'view.lines',onRetainedResult:async(value)=>{assert.equal(f.client.result,previous);assert(!f.events.includes('release:old-surface'));assert.equal(value.id,'next');return true;}});
  assert.equal(f.client.result,next);assert.equal(next.metrics.retainedCleanup.pending,true);const r=f.events.find(v=>v?.render).render;assert.strictEqual(r.retained.data,f.raw);assert.deepEqual(r.task.params,f.task.params);assert.equal(r.retained.cloneWindowMode,'independent');assert.equal(r.task.view.lines,false);assert.equal(f.events.filter(v=>v==='native-analysis').length,1);assert.equal(f.events.filter(v=>v==='configure').length,1);
  await f.client.release();assert.equal(f.events.filter(v=>v==='release:old-surface').length,2);assert.equal(f.events.filter(v=>v==='release:next-surface').length,1);
 }finally{await f.close();}
});
test('cancelled native-table render retires its successor and leaves the displayed scientific owner live',async()=>{
 const f=await fixture();try{f.hold();const previous=f.client.result,p=f.client.updateRetainedParameters({...f.task,view:{lines:false}},{field:'view.lines'}),hooks=await f.entered.promise;f.client.cancelRetainedParameters();assert(hooks.signal.aborted);f.answer.resolve();assert.equal(await p,null);assert.equal(f.client.result,previous);assert.equal(f.events.filter(v=>v==='release:next-surface').length,1);assert(!f.events.includes('release:old-surface'));assert.equal(f.events.filter(v=>v==='native-analysis').length,1);}finally{await f.close();}
});
