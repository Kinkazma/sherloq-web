import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {exportByteStore,readByteStore} from '../src/portable-byte-store.js';
import {EngineError} from '../src/errors.js';
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const store=()=>({byteLength:131072,readInto(out){out.fill(7);},write(){},flush(){}});

for(const mode of ['null','invalid','messageerror','close','cancel'])test('owner '+mode+' settles pending IO and keeps its staging until the active read exits',async()=>{
 const Native=globalThis.MessageChannel,budget=new Budget(65536),entered=gate(),finish=gate(),abort=new AbortController();let channel;
 globalThis.MessageChannel=class{constructor(){channel=new Native();return channel;}};
 let publication;try{publication=await exportByteStore({...store(),async readInto(out){entered.resolve();await finish.promise;out.fill(7);}},{budget,forceBroker:true,signal:abort.signal});}finally{globalThis.MessageChannel=Native;}
 const reader=await readByteStore(publication.descriptor),pending=reader.readInto(new Uint8Array(2)),rejected=assert.rejects(pending,{code:['close','cancel'].includes(mode)?'CANCELLED':'WORKER_MESSAGE_FAILED'});
 try{await entered.promise;
  if(mode==='null')publication.descriptor.port.postMessage(null);
  else if(mode==='invalid')publication.descriptor.port.postMessage({id:9,op:'read',offset:0,length:70000});
  else if(mode==='messageerror')channel.port1.dispatchEvent(new MessageEvent('messageerror'));
  else if(mode==='cancel')abort.abort();
  else void publication.release();
  await rejected;assert.equal(budget.total(),65536);let released=false;const retirement=publication.release().then(()=>released=true);await Promise.resolve();assert.equal(released,false);
  finish.resolve();await retirement;assert.equal(budget.total(),0);await assert.rejects(reader.readInto(new Uint8Array(1)));
 }finally{finish.resolve();await reader.dispose();await publication.release();}
});

for(const mode of ['null','unknown-id','short-read','messageerror','close','post-failure'])test('reader '+mode+' rejects every pending RPC once and is never reused',async()=>{
 const channel=new MessageChannel(),budget=new Budget(131072),received=gate();channel.port1.onmessage=()=>received.resolve();channel.port1.start();
 const reader=await readByteStore({kind:'broker',port:channel.port2,byteLength:131072,blockBytes:65536,writable:true},{budget});
 const a=reader.readInto(new Uint8Array(2)),b=reader.readInto(new Uint8Array(3),4),all=Promise.allSettled([a,b]);
 try{await received.promise;
  if(mode==='null')channel.port1.postMessage(null);
  else if(mode==='unknown-id')channel.port1.postMessage({id:999,buffer:new ArrayBuffer(2)});
  else if(mode==='short-read')channel.port1.postMessage({id:1,buffer:new ArrayBuffer(1)});
  else if(mode==='messageerror')channel.port2.dispatchEvent(new MessageEvent('messageerror'));
  else if(mode==='close')channel.port1.close();
  else{channel.port2.postMessage=()=>{throw new DOMException('cannot clone','DataCloneError');};await assert.rejects(reader.flush());}
  const results=await all;assert(results.every(item=>item.status==='rejected'));if(mode!=='post-failure')assert(results.every(item=>item.reason.code===(mode==='close'?'CANCELLED':'WORKER_MESSAGE_FAILED')));
  await assert.rejects(reader.readInto(new Uint8Array(1)));await reader.dispose();await reader.dispose();assert.equal(budget.total(),0);
 }finally{await reader.dispose();channel.port1.close();channel.port2.close();}
});

test('invalid broker window is rejected before any reservation or RPC',async()=>{
 const channel=new MessageChannel(),budget=new Budget(1);
 try{await assert.rejects(readByteStore({kind:'broker',port:channel.port2,byteLength:1,blockBytes:0},{budget}),{code:'INVALID_INPUT'});assert.equal(budget.total(),0);}finally{channel.port1.close();channel.port2.close();}
});

test('a later useful write failure preserves completed blocks and its structured cause',async()=>{
 const bytes=new Uint8Array(180123),expected=Uint8Array.from({length:bytes.length},(_,i)=>i%251);let writes=0;
 const pin=await exportByteStore({byteLength:bytes.length,readInto(out,offset){out.set(bytes.subarray(offset,offset+out.length));},write(part,offset){if(++writes===2)throw new EngineError('STORAGE_IO','disk refused',{details:{offset,completed:65536}});bytes.set(part,offset);},flush(){}},{writable:true,forceBroker:true}),reader=await readByteStore(pin.descriptor);
 try{await assert.rejects(reader.write(expected),error=>error.code==='STORAGE_IO'&&error.details.completed===65536);assert.deepEqual(bytes.subarray(0,65536),expected.subarray(0,65536));assert(bytes.subarray(65536).every(x=>x===0));await reader.write(expected.subarray(65536),65536);assert.deepEqual(bytes,expected);assert.equal(writes,4);}finally{await reader.dispose();await pin.release();}
});
