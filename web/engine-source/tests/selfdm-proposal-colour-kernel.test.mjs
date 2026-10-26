import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';
import {runSelfDMProposalColourSeeds} from '../src/selfdm-proposal-colour-kernel.js';
const wasmBinary=new Uint8Array(await readFile(new URL('../vendor/selfdm-proposal/seeds-support.wasm',import.meta.url))),input={rect:{x:0,y:0,width:4,height:4},resize:[320,240]};
function view(readWindow){return{domain:{descriptor:{},width:4,height:4,sourceSha256:'a'.repeat(64),fingerprint:'bounded-test-source'},rowIntervals(){return[[0,4]]},*admittedRectangles(r){yield r},readWindow}}
test('a changed additive binary refuses before native instance or RGB and retires all grants',async()=>{
 const budget=new Budget(256*1024**2),changed=wasmBinary.slice();changed[100]^=1;let reads=0,instances=0,owner;
 await assert.rejects(runSelfDMProposalColourSeeds({...input,view:view(()=>{reads++;throw Error('RGB')})},{budget,wasmBinary:changed,onOwner:v=>owner=v,createModule(){instances++;throw Error('Native')}}),/bytes differ/);
 assert.equal(reads,0);assert.equal(instances,0);assert.equal(owner.state().closed,true);assert.equal(budget.total(),0);
});
test('parent retirement during native instance preparation aborts before RGB and awaits the actual operation',async()=>{
 const budget=new Budget(256*1024**2);let owner,started,resume,reads=0;
 const ready=new Promise(r=>started=r),wait=new Promise(r=>resume=r),run=runSelfDMProposalColourSeeds({...input,view:view(()=>{reads++;throw Error('RGB')})},{budget,wasmBinary,onOwner:v=>owner=v,async createModule(options){started();await wait;return{HEAPU8:new Uint8Array(options.wasmMemory.buffer)}}});
 await ready;let closed=false;const retirement=owner.release().then(()=>closed=true);await Promise.resolve();assert.equal(closed,false);assert.ok(budget.total()>0);resume();await assert.rejects(run,e=>e.code==='CANCELLED');await retirement;assert.equal(reads,0);assert.equal(owner.state().closed,true);assert.equal(budget.total(),0);
});
test('source primaryfalse survives two ACK0 refusals and its carrier keeps all remaining owners for retry',async()=>{
 const budget=new Budget(256*1024**2);let owner,calls=0,held=0;
 const source=view(async r=>{held++;const free=budget.reserve(r.width*r.height*3);return{pixels:{format:'rgb8',width:r.width,height:r.height,get data(){throw false}},async release(){calls++;if(calls<=2)throw 0;free();held--}}});
 await assert.rejects(runSelfDMProposalColourSeeds({...input,view:source},{budget,wasmBinary,onOwner:v=>owner=v,async createModule(options){return{HEAPU8:new Uint8Array(options.wasmMemory.buffer)}}}),e=>e===false);
 assert.equal(calls,2);assert.equal(held,1);assert.equal(owner.state().closed,false);assert.equal(owner.state().sourceLeases,1);assert.ok(budget.total()>0);await owner.release();assert.equal(calls,3);assert.equal(held,0);assert.equal(owner.state().closed,true);assert.equal(budget.total(),0);
});
