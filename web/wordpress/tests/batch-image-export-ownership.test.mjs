import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createBatchImageExporter} from '../sherloq-browser/assets/batch-image-export.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
const sha=value=>createHash('sha256').update(value).digest('hex');
function fixture({reserveGate,readGate,releaseExportError,unloadError,deriveError,readError,exclusive=false,admittedOutputs=false}={}){
 const bytes=Uint8Array.of(137,80,78,71,13,10,26,10,7,8,9),blob=new Blob([bytes],{type:'image/png'}),calls=[],leases=new Map(),outputs=[];let n=0,disposed=false;
 const engine={
  async loadBlob({id,blob:input}){calls.push('load');return{id,sha256:sha(bytes),surface:{id:'surface',revision:1,width:3,height:2},provenance:{format:'png'}}},
  async deriveOriginal(request){calls.push(['derive',request]);if(deriveError)throw deriveError;return{archive:{id:'owned',revision:1,sha256:sha(bytes),byteLength:bytes.length,mime:'image/png'}}},
  async exportSurface(){throw Error('Original PNG must not be re-encoded.')},
  async readExport({offset,length}){assert.equal(disposed,false,'No read after owner disposal');calls.push(['read',offset,length]);if(readGate)await readGate.promise;if(readError)throw readError;return{bytes:bytes.slice(offset,offset+length)}},
  async releaseExport(){assert.equal(disposed,false,'Archive cleanup precedes engine disposal');calls.push('release-export');if(releaseExportError)throw releaseExportError},
  async unload(){assert.equal(disposed,false,'Unload precedes engine disposal');calls.push('unload');if(unloadError)throw unloadError},
  async reserveExternalMemory({bytes}){calls.push(['reserve',bytes]);if(reserveGate)await reserveGate.promise;assert.equal(disposed,false,'Admission must not complete against a disposed broker');const id=++n;leases.set(id,bytes);return{id}},
  async releaseExternalMemory(id){assert.equal(disposed,false,'Lease must retire before broker disposal');assert(leases.has(id));leases.delete(id);calls.push(['free',id])},
  async dispose(){assert.equal(leases.size,0,'Broker has no outstanding owned lease');disposed=true;calls.push('dispose')}
 };
 if(exclusive){let active=false;for(const key of Object.keys(engine)){const invoke=engine[key];engine[key]=async(...args)=>{if(active)throw Object.assign(Error('Another worker task is active.'),{code:'BUSY'});active=true;try{await new Promise(resolve=>setImmediate(resolve));return await invoke(...args);}finally{active=false;}};}}
 const sinkFactory=async()=>{const parts=[];let clean=0;return{storage:'opfs',async write(bytes){parts.push(bytes.slice())},async finish(){const release=admittedOutputs?await converter.reserveMemory(bytes.length):null;const out={blob:new Blob(parts,{type:'image/png'}),storage:'opfs',async cleanup(){if(clean++)return;calls.push('artifact-cleanup');await release?.()}};outputs.push(out);return out},async abort(){calls.push('sink-abort')}}};
 const converter=createBatchImageExporter({}, {engineFactory:()=>engine,sinkFactory});
 return{bytes,blob,calls,leases,outputs,converter,get disposed(){return disposed}};
}
test('PNG source becomes an independent verified archive, exact bytes and cache preserved',async()=>{
 const f=fixture(),out=await f.converter.convert(f.blob,{name:'source.png',role:'source'});assert.notEqual(out.blob,f.blob);assert.deepEqual(new Uint8Array(await out.blob.arrayBuffer()),f.bytes);assert.equal(out.conversion.encodedSha256,sha(f.bytes));assert.equal(out.conversion.encodedSourcePreserved,true);assert.equal(out.conversion.provenance.byteOwnership,'verified-owned-original-archive');assert.equal(await f.converter.convert(f.blob,{role:'source'}),out);assert.equal(f.calls.filter(x=>x==='load').length,1);assert.equal(f.calls.filter(Array.isArray).filter(x=>x[0]==='derive').length,1);assert.equal(f.leases.size,0);await f.converter.dispose();assert.equal(f.disposed,true);assert.equal(f.calls.filter(x=>x==='artifact-cleanup').length,1);
});
test('archive decode failures are not cached and can be retried without publishing an output',async()=>{
 const failure=Error('derive failed'),f=fixture({deriveError:failure});await assert.rejects(f.converter.convert(f.blob,{role:'source'}),e=>e===failure);await assert.rejects(f.converter.convert(f.blob,{role:'source'}),e=>e===failure);assert.equal(f.calls.filter(x=>x==='load').length,2);assert.equal(f.calls.filter(x=>x==='unload').length,2);assert.equal(f.outputs.length,0);await f.converter.dispose();
});
test('unpublished completed output retires when archive cleanup fails; unload still runs',async()=>{
 const failure=Error('release archive failed'),f=fixture({releaseExportError:failure});await assert.rejects(f.converter.convert(f.blob,{role:'source'}),e=>e===failure);assert(f.calls.includes('unload'));assert.equal(f.calls.filter(x=>x==='artifact-cleanup').length,1);assert.equal(f.leases.size,0);await f.converter.dispose();assert.equal(f.calls.filter(x=>x==='artifact-cleanup').length,1);
});
test('primary cancellation survives archive and source cleanup failures',async()=>{
 const failure=Object.assign(Error('cancelled'),{code:'CANCELLED'}),f=fixture({readError:failure,releaseExportError:Error('release'),unloadError:Error('unload')});await assert.rejects(f.converter.convert(f.blob,{role:'source'}),e=>e===failure);assert(f.calls.includes('release-export'));assert(f.calls.includes('unload'));assert(f.calls.includes('sink-abort'));assert.equal(f.leases.size,0);await f.converter.dispose();
});
test('external final artifact reservation keeps broker until its idempotent cleanup',async()=>{
 const f=fixture(),release=await f.converter.reserveMemory(123);await f.converter.dispose();assert.equal(f.disposed,false);assert.equal(f.leases.size,1);await release();await release();assert.equal(f.disposed,true);assert.equal(f.leases.size,0);assert.equal(f.calls.filter(x=>x==='dispose').length,1);
});
test('dispose joins pending admission and rejects a late lease without closing its broker early',async()=>{
 const gate=deferred(),f=fixture({reserveGate:gate}),pending=f.converter.reserveMemory(123);await Promise.resolve();const disposal=f.converter.dispose();await Promise.resolve();assert.equal(f.disposed,false);gate.resolve();await assert.rejects(pending,/disposed/i);await disposal;assert.equal(f.leases.size,0);assert.equal(f.disposed,true);
});
test('dispose during copy closes engine only after archive and source cleanup',async()=>{
 const gate=deferred(),f=fixture({readGate:gate}),pending=f.converter.convert(f.blob,{role:'source'});while(!f.calls.some(x=>Array.isArray(x)&&x[0]==='read'))await new Promise(resolve=>setImmediate(resolve));const disposal=f.converter.dispose();gate.resolve();await pending;await disposal;assert.equal(f.disposed,true);assert(f.calls.indexOf('dispose')>f.calls.indexOf('unload'));assert.equal(f.leases.size,0);
});

test('multiple owned outputs retire through the worker single-command lane',async()=>{const f=fixture({exclusive:true,admittedOutputs:true});await f.converter.convert(f.blob,{role:'source'});await f.converter.convert(new Blob([f.bytes],{type:'image/png'}),{role:'source'});await f.converter.dispose();assert.equal(f.disposed,true);assert.equal(f.leases.size,0);assert.equal(f.calls.filter(x=>x==='artifact-cleanup').length,2)});
test('simultaneous final-admission leases and releases are serialized without BUSY or orphaning',async()=>{const f=fixture({exclusive:true}),releases=await Promise.all([f.converter.reserveMemory(123),f.converter.reserveMemory(456)]);assert.equal(f.leases.size,2);await Promise.all(releases.map(release=>release()));await f.converter.dispose();assert.equal(f.leases.size,0);assert.equal(f.disposed,true)});
