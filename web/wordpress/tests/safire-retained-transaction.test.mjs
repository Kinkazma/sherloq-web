// Real client transaction with inert engine. No Worker, ORT or neural execution.
import test from 'node:test';import assert from 'node:assert/strict';
import {createToolClient} from '../sherloq-browser/assets/tool-client.js';
const gate=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve};};
async function fixture(){
 const priorFetch=globalThis.fetch,events=[],entered=gate(),answer=gate();let held=false,failOld=false;
 globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('integrated-config')?{assetBase:'./'}:{m3:{}}});
 const original={id:'im',sha256:'a'.repeat(64),surface:{id:'Original',revision:1,width:8,height:8,format:'rgb8'}};
 const task={id:'base',operation:'ai.sources.safire',params:{side:16,groups:3,kind:'kmeans',eps:.2,minimum:1,binary:false},view:{mode:'overlay'}};
 const result=(task,id)=>({id,operation:task.operation,status:'ok',surface:{id:id+'-surface',revision:1,width:8,height:8,format:'rgb8'},provenance:{params:task.params,originalSha256:original.sha256},data:{width:8,height:8,metadata:{method:'safire',native_shape:[1,1]},map:Float32Array.of(.5)}});
 const engine={async loadBlob(){return original;},async loadM3Models(){events.push('configure');},async run(t,hooks){events.push({run:t.operation,retainedNativeOnly:t.retainedNativeOnly,params:t.params});if(t.retainedNativeOnly){entered.resolve(hooks);if(held)await answer.promise;return result(t,'next');}return result(t,'old');},async releaseSurface(id){events.push('release:'+id);if(failOld&&id==='old-surface'){failOld=false;throw Object.freeze(Object.assign(Error('Controlled old owner ACK refusal'),{code:'ACK_REFUSED'}));}},async releaseTable(){},async unload(){},async dispose(){}};
 const client=await createToolClient({engineFactory:()=>engine});await client.load({id:'im',blob:new Blob(['original'])});await client.run(task);
 return{client,task,events,entered,answer,hold(){held=true;},refuseOld(){failOld=true;},async close(){answer.resolve();try{await client.release();await client.dispose();}finally{globalThis.fetch=priorFetch;}}};
}
test('cached SAFIRE final uses retained-only dispatch, keeps exact params, and retries old ownership ACK',async()=>{
 const h=await fixture();try{h.refuseOld();const params={...h.task.params,groups:4,minimum:7};const next=await h.client.updateRetainedParameters({...h.task,params},{field:'groups'});assert.equal(next.id,'next');assert.equal(h.client.result,next);assert.equal(next.metrics.retainedCleanup.pending,true);assert.equal(h.events.filter(e=>e==='configure').length,1);const run=h.events.filter(e=>e?.retainedNativeOnly).at(-1);assert.deepEqual(run.params,params);await h.client.release();assert.equal(h.events.filter(e=>e==='release:old-surface').length,2);assert.equal(h.events.filter(e=>e==='release:next-surface').length,1);}finally{await h.close();}
});
test('cancelled SAFIRE retained replacement retires only its rejected successor and preserves previous result',async()=>{
 const h=await fixture();try{h.hold();const previous=h.client.result,pending=h.client.updateRetainedParameters({...h.task,params:{...h.task.params,groups:4}},{field:'groups'});const hooks=await h.entered.promise;assert.equal(h.client.result,previous);h.client.cancelRetainedParameters();assert(hooks.signal.aborted);h.answer.resolve();assert.equal(await pending,null);assert.equal(h.client.result,previous);assert.equal(h.events.filter(e=>e==='release:next-surface').length,1);assert.equal(h.events.filter(e=>e==='release:old-surface').length,0);}finally{await h.close();}
});
