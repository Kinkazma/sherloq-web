import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {exportPortableDenseInput,readPortableDenseInput} from '../src/dense-shared-field.js';
import {exportByteStore,readByteStore} from '../src/portable-byte-store.js';
globalThis.crossOriginIsolated=true;
const budget=new Budget(1024*1024),temporarySession={backend:'opfs',async create(length){const bytes=new Uint8Array(length);return {write(source,offset){bytes.set(source,offset);},readInto(out,offset){out.set(bytes.subarray(offset,offset+out.length));return out;},flush(){},dispose(){}};}};
const store=await createSegmentedBytes(96,{budget,temporarySession,storage:'memory',shared:true,chunkBytes:32}),mask=await createSegmentedBytes(2,{budget,storage:'memory',shared:true});await store.write(new Uint8Array(96).fill(37));await mask.write(Uint8Array.of(1,1));
let input,kernelReader,kernelPin;const retainedEnvelopes=[];
const exported=await exportPortableDenseInput({first:store,mask,width:2,height:1,dimensions:12},{budget,control:async event=>{if(event.action==='detach'){await kernelReader.dispose();await kernelPin.release();await input.detach([event.id]);}else{await input.attach([{id:event.id,descriptor:structuredClone(event.descriptor,{transfer:event.descriptor.port?[event.descriptor.port]:[]})}]);}}});
const references=exported.value.stores[0].segments.map(([,buffer])=>new WeakRef(buffer));retainedEnvelopes.push(exported.value.stores[0]);
const bootstrap=structuredClone(exported.value,{transfer:exported.transfer});retainedEnvelopes.push(bootstrap);references.push(...bootstrap.stores[0].segments.map(([,buffer])=>new WeakRef(buffer)));input=await readPortableDenseInput(bootstrap,{budget});
kernelPin=await exportByteStore(input.first,{budget});retainedEnvelopes.push(kernelPin.descriptor);const kernelBoot={stores:[structuredClone(kernelPin.descriptor)]};references.push(...kernelBoot.stores[0].segments.map(([,buffer])=>new WeakRef(buffer)));retainedEnvelopes.push(kernelBoot);kernelReader=await readByteStore(kernelBoot.stores[0],{budget});kernelBoot.stores=null;
await store.spillReadOnly();assert.equal(store.allocatedBackingBytes,0);assert.equal(retainedEnvelopes[0].segments.length,0);assert.equal(retainedEnvelopes[2].segments.length,0);
let cleared=false;for(let i=0;i<40;i++){await new Promise(resolve=>setImmediate(resolve));globalThis.gc();await new Promise(resolve=>setImmediate(resolve));if(references.every(ref=>ref.deref()===undefined)){cleared=true;break;}}
assert.equal(cleared,true,'A publication, disposed reader or suspended bootstrap frame still retained its SAB');assert.equal(retainedEnvelopes.length,4);assert.deepEqual([...await input.first.readInto(new Uint8Array(3))],[37,37,37]);await input.dispose();await exported.release();await store.dispose();await mask.dispose();assert.equal(budget.total(),0);console.log(JSON.stringify({bankWeakRefsCleared:references.length,retainedEnvelopes:retainedEnvelopes.length,budgetBytes:budget.total()}));
