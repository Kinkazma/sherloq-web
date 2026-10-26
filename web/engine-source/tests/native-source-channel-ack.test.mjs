import test from 'node:test';
import assert from 'node:assert/strict';
import{serveNativeSourceChannel,receiveNativeSourceChannel}from'../src/native-source-channel.js';
import{Budget}from'../src/cache.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const tick=()=>new Promise(setImmediate);
function setup({releaseGate,releaseError,copyReleaseError,signal}={}){
 const pair=new MessageChannel(),sender=new Budget(1024),receiverBudget=new Budget(1024),types=[],data=Uint8Array.of(1,2,3,4,5,6),started=deferred();let sourceReleases=0,sourceDisposes=0,copyReleases=0;
 const port=new Proxy(pair.port1,{get(target,key){if(key==='postMessage')return(message,transfer)=>{types.push(message.pixels?'pixels':message.error?'error':message.type);return target.postMessage(message,transfer);};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;},set:(target,key,value)=>Reflect.set(target,key,value,target)});
 const provider=serveNativeSourceChannel(port,{width:2,height:1,async readWindow(){return{pixels:{width:2,height:1,format:'rgb8',data},async release(){sourceReleases++;started.resolve();await releaseGate?.promise;if(releaseError)throw releaseError;}};},dispose(){sourceDisposes++;}},{signal,reserve(bytes){const free=sender.reserve(bytes);return()=>{copyReleases++;free();if(copyReleaseError)throw copyReleaseError;};}});
 const reader=receiveNativeSourceChannel({format:'rgb8-window-source',width:2,height:1,sha256:'a'.repeat(64),port:pair.port2},{budget:receiverBudget,signal});
 return{provider,reader,sender,receiverBudget,types,data,started,counts:()=>({sourceReleases,sourceDisposes,copyReleases}),async dispose(){releaseGate?.resolve();reader.dispose();await provider.dispose();pair.port1.close();pair.port2.close();}};
}
test('native source ticket waits for async borrowed-window retirement while its independent copy stays admitted',async()=>{
 const gate=deferred(),h=setup({releaseGate:gate});let window,settled=false;const pending=h.reader.readWindow({x:0,y:0,width:2,height:1});pending.then(()=>settled=true,()=>settled=true);
 try{await h.started.promise;await tick();await tick();assert.equal(settled,false);assert.equal(h.types.includes('pixels'),false);assert.equal(h.sender.total(),6);h.data.fill(99);gate.resolve();window=await pending;assert.deepEqual([...window.pixels.data],[1,2,3,4,5,6]);assert.equal(h.sender.total(),0);assert.deepEqual(h.counts(),{sourceReleases:1,sourceDisposes:0,copyReleases:1});}
 finally{gate.resolve();try{window??=await pending;window.release();}finally{await h.dispose();}}
 assert.equal(h.receiverBudget.total(),0);assert.equal(h.sender.total(),0);
});
test('failed borrowed-window ACK publishes no pixels and preserves the primary error through copy cleanup failure',async()=>{
 const error=Object.assign(Error('source ACK failed'),{code:'STORAGE_IO'}),copy=Object.assign(Error('copy cleanup failed'),{code:'MEMORY_LIMIT'}),h=setup({releaseError:error,copyReleaseError:copy});
 try{await assert.rejects(h.reader.readWindow({x:0,y:0,width:2,height:1}),e=>e.code==='STORAGE_IO'&&e.message==='source ACK failed'&&e.details.nativeSourceCleanupErrors[0].message==='copy cleanup failed');assert.equal(h.types.includes('pixels'),false);assert.equal(h.types.filter(x=>x==='error').length,1);assert.deepEqual(h.counts(),{sourceReleases:1,sourceDisposes:0,copyReleases:1});assert.equal(h.sender.total(),0);assert.equal(h.receiverBudget.total(),0);}
 finally{await h.dispose();}
});
test('abort during borrowed-window ACK closes the consumer, retains producer cleanup until ACK, and never publishes pixels',async()=>{
 const gate=deferred(),abort=new AbortController(),h=setup({releaseGate:gate,signal:abort.signal});let closed=false;const pending=h.reader.readWindow({x:0,y:0,width:2,height:1}),rejection=assert.rejects(pending,e=>e.code==='CANCELLED');
 try{await h.started.promise;abort.abort();await rejection;const closing=h.provider.dispose().then(()=>closed=true);await tick();assert.equal(closed,false);assert.equal(h.sender.total(),6);assert.equal(h.receiverBudget.total(),0);gate.resolve();await closing;assert.equal(h.types.includes('pixels'),false);assert.deepEqual(h.counts(),{sourceReleases:1,sourceDisposes:0,copyReleases:1});assert.equal(h.sender.total(),0);}
 finally{gate.resolve();await h.dispose();}
});
