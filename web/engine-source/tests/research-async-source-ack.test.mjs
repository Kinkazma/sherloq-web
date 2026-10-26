import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {prepareResearchRows} from '../src/m3-research-rows.js';
import {createResearchSurface} from '../src/m3-research-surface.js';
// Allow the existing 8ms native preparation checkpoints to run while the ACK gate remains closed.
const turn=()=>new Promise(resolve=>setTimeout(resolve,50));
function delayedSource(budget,{fail=false}={}){
 let resume,entered;const gate=new Promise(r=>resume=r),first=new Promise(r=>entered=r);
 const s={width:3,height:2,format:'rgb8',reads:0,pending:0,acks:0,
  async readRows(y,count){assert.equal(s.pending,0,'The previous original row must be acknowledged before a new read');s.reads++;const free=budget.reserve(3*count*3);s.pending++;
   const data=Uint8Array.from({length:3*count*3},(_,i)=>(i+y*37)%256);let done=false;
   return{pixels:{width:3,height:count,format:'rgb8',data},release(){if(done)return;done=true;entered();const task=(async()=>{await gate;s.pending--;free();s.acks++;if(fail)throw Object.freeze(Object.assign(Error('Native source ACK failed'),{code:'STORAGE_IO'}));})();task.catch(()=>{});return task;}};
  },first,resume:()=>resume()};return s;
}
for(const method of ['adaifl','focal','safire'])test(method+' waits for original row ACK before reuse and tensor publication',async()=>{
 const b=new Budget(64*1024**2),s=delayedSource(b);let state='pending',result,error;
 const task=prepareResearchRows(s,{method,budget:b}).then(v=>{result=v;state='published';},e=>{error=e;state='rejected';});
 await s.first;await turn();let early;
 try{assert.equal(state,'pending');assert.equal(s.reads,1);assert.equal(s.pending,1);}catch(e){early=e;}finally{s.resume();await task;result?.release();}
 assert.equal(b.total(),0);if(early)throw early;if(error)throw error;assert.equal(s.pending,0);assert.equal(s.reads,s.acks);
});
test('row ACK error rejects preparation and returns all output/scratch/row credits',async()=>{
 const b=new Budget(64*1024**2),s=delayedSource(b,{fail:true});let result;
 const task=prepareResearchRows(s,{method:'adaifl',budget:b}).then(v=>{result=v;return null;},e=>e);
 await s.first;s.resume();const error=await task;result?.release();assert.equal(error?.code,'STORAGE_IO');assert.equal(b.total(),0);
});
test('abort during a pending row ACK cannot publish a prepared tensor',async()=>{
 const b=new Budget(64*1024**2),s=delayedSource(b),c=new AbortController();let result;
 const task=prepareResearchRows(s,{method:'adaifl',budget:b,signal:c.signal}).then(v=>{result=v;return null;},e=>e);
 await s.first;c.abort();s.resume();const error=await task;result?.release();assert.equal(error?.code,'CANCELLED');assert.equal(b.total(),0);
});
function nativeData(){return{map:Float32Array.of(.1,.2,.3,.4,.5,.6),mask:Uint8Array.of(0,0,0,0,1,1),metadata:{method:'adaifl',native_shape:[2,3]}};}
async function surfaceFixture({fail=false,abort=false}={}){
 const b=new Budget(1024*1024),c=new AbortController();let resume,entered,pending=0;const gate=new Promise(r=>resume=r),first=new Promise(r=>entered=r);
 const image={surface:{descriptor:{width:3,height:2},async readWindow({width,height}){const free=b.reserve(width*height*3);pending++;let done=false;return{pixels:{width,height,format:'rgb8',data:new Uint8Array(width*height*3).fill(55)},release(){if(done)return;done=true;entered();const p=(async()=>{await gate;pending--;free();if(fail)throw Object.freeze(Object.assign(Error('Original source retirement failed'),{code:'STORAGE_IO'}));})();p.catch(()=>{});return p;}};}}};
 const api=await createResearchSurface(image,nativeData(),{mode:'overlay'},{budget:b});let result,error,state='pending';const task=api.surface.readWindow({x:0,y:0,width:3,height:2},{signal:c.signal}).then(v=>{result=v;state='published';},e=>{error=e;state='rejected';});
 await first;await turn();const stateBeforeAck=state;if(abort)c.abort();resume();await task;result?.release();api.surface.dispose();return{stateBeforeAck,error,pending,memory:b.total()};
}
test('research RGB output waits for its presentation Original ACK',async()=>{const r=await surfaceFixture();assert.equal(r.stateBeforeAck,'pending');assert.equal(r.error,undefined);assert.equal(r.pending,0);assert.equal(r.memory,0);});
test('research RGB output cannot escape a failed presentation ACK',async()=>{const r=await surfaceFixture({fail:true});assert.equal(r.error?.code,'STORAGE_IO');assert.equal(r.memory,0);});
test('abort during presentation ACK rejects without leaking unpublished RGB',async()=>{const r=await surfaceFixture({abort:true});assert.equal(r.error?.code,'CANCELLED');assert.equal(r.memory,0);});

import {createStrictResearchEngine} from '../src/m3-strict-research.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
async function strictFixture({failures=0,primaryError}={}){
 const budget=new Budget(1024*1024),sha='a'.repeat(64);let resume,entered,acks=0,pending=0;const gate=new Promise(r=>resume=r),first=new Promise(r=>entered=r);
 const state=await createOriginalSourceRegionsState({sourceSha256:sha,width:3,height:2});await state.add('acquisition',{x0:0,y0:0,x1:3,y1:2});const domain=await compileOriginalSourceRegions(state.snapshot());
 const originalSource={sha256:sha,surface:{descriptor:{width:3,height:2,format:'rgb8'},async readWindow(rect){const free=budget.reserve(rect.width*rect.height*3);pending++;let done=false;return{pixels:{width:rect.width,height:rect.height,format:'rgb8',data:new Uint8Array(rect.width*rect.height*3)},async release(){if(done)return;acks++;entered();await gate;if(acks<=failures)throw Object.freeze(Object.assign(Error('Source ACK failed'),{code:'STORAGE_IO'}));done=true;pending--;free();}};}}};
 const image={sha256:sha,originalSource,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:domain.origin,surface:{descriptor:{width:3,height:2,format:'rgb8'}}};
 const engineFactory=input=>({image:input,async analyze(){await this.image.readRows(0,1);if(primaryError)throw primaryError;return{...nativeData(),release(){}};},async dispose(){}});
 const api=createStrictResearchEngine(image,budget,{maxWorkers:10},{method:'adaifl',engineFactory});return{api,budget,first,resume:()=>resume(),pending:()=>pending,acks:()=>acks};
}
test('strict bundle waits for all borrowed source-window ACKs before publishing',async()=>{
 const h=await strictFixture();let result,error,state='pending';const task=h.api.analyze().then(v=>{result=v;state='published';},e=>{error=e;state='rejected';});await h.first;await turn();let early;try{assert.equal(state,'pending');assert.equal(h.pending(),1);}catch(e){early=e;}finally{h.resume();await task;result?.release();await h.api.dispose();}assert.equal(h.budget.total(),0);if(early)throw early;if(error)throw error;
});
test('strict bundle cancellation during last ACK cannot publish retained arrays',async()=>{
 const h=await strictFixture(),c=new AbortController();let result;const task=h.api.analyze({},{signal:c.signal}).then(v=>{result=v;return null;},e=>e);await h.first;c.abort();h.resume();const error=await task;result?.release();await h.api.dispose();assert.equal(error?.code,'CANCELLED');assert.equal(h.budget.total(),0);
});
test('strict failed ACK retains its owner for dispose retry without leaking copied native arrays',async()=>{
 const h=await strictFixture({failures:2});let result;const task=h.api.analyze().then(v=>{result=v;return null;},e=>e);await h.first;h.resume();const error=await task;result?.release();assert.equal(error?.code,'STORAGE_IO');assert.equal(h.pending(),1);await h.api.dispose();assert.equal(h.acks(),3);assert.equal(h.budget.total(),0);
});
test('strict failed ACK cannot replace a frozen scientific primary error',async()=>{
 const primary=Object.freeze(Object.assign(Error('Cancelled scientific task'),{code:'CANCELLED'}));const h=await strictFixture({failures:1,primaryError:primary});const task=h.api.analyze().then(()=>null,e=>e);await h.first;h.resume();const error=await task;assert.equal(error,primary);await h.api.dispose();assert.equal(h.budget.total(),0);
});
test('surface failed ACK remains owned until disposal retry completes',async()=>{
 const budget=new Budget(1024*1024);let attempts=0;const image={surface:{descriptor:{width:3,height:2},async readWindow(){const free=budget.reserve(18);return{pixels:{width:3,height:2,format:'rgb8',data:new Uint8Array(18)},async release(){attempts++;if(attempts<=2)throw Object.freeze(Object.assign(Error('Presentation ACK failed'),{code:'STORAGE_IO'}));free();}};}}};
 const {surface}=await createResearchSurface(image,nativeData(),{mode:'overlay'},{budget});const error=await surface.readWindow({x:0,y:0,width:3,height:2}).then(()=>null,e=>e);assert.equal(error?.code,'STORAGE_IO');assert(budget.total()>18);await surface.dispose();assert.equal(attempts,3);assert.equal(budget.total(),0);
});
test('concurrent surface disposal shares its barrier and retires an in-flight window without publication',async()=>{
 const budget=new Budget(1024*1024);let resume,entered;const gate=new Promise(r=>resume=r),first=new Promise(r=>entered=r);
 const image={surface:{descriptor:{width:3,height:2},async readWindow(){const free=budget.reserve(18);return{pixels:{width:3,height:2,format:'rgb8',data:new Uint8Array(18)},async release(){entered();await gate;free();}};}}};
 const {surface}=await createResearchSurface(image,nativeData(),{mode:'overlay'},{budget});let window;
 const reading=surface.readWindow({x:0,y:0,width:3,height:2}).then(v=>{window=v;return null;},e=>e);await first;const a=surface.dispose(),b=surface.dispose();let closed=false;Promise.resolve(a).then(()=>closed=true);await turn();let early;try{assert.equal(a,b);assert.equal(closed,false);}catch(e){early=e;}finally{resume();const error=await reading;window?.release();await a;assert.equal(error?.code,'DISPOSED');assert.equal(budget.total(),0);}if(early)throw early;
});
for(const method of ['adaifl','focal','safire'])test(method+' keeps native prepared Float32 bits with synchronous versus asynchronous ACK',async()=>{
 const width=17,height=11,data=Uint8Array.from({length:width*height*3},(_,i)=>(i*37+Math.floor(i/51)*13)%256),original=data.slice(),budget=new Budget(64*1024**2);
 const source=asyncAck=>({width,height,async readRows(y,count){const free=budget.reserve(width*count*3);return{pixels:{width,height:count,format:'rgb8',data:data.subarray(y*width*3,(y+count)*width*3)},release:asyncAck?async()=>{await Promise.resolve();free();}:free};}});
 const a=await prepareResearchRows(source(false),{method,budget}),b=await prepareResearchRows(source(true),{method,budget});try{const aa=new Uint32Array(a.tensor.buffer),bb=new Uint32Array(b.tensor.buffer);assert.equal(aa.length,3*1024*1024);for(let i=0;i<aa.length;i++)assert.equal(aa[i],bb[i],'Native tensor bit differs at '+i);assert.equal(data.every((v,i)=>v===original[i]),true);}finally{a.release();b.release();}assert.equal(budget.total(),0);
});
test('published research view captures caller settings before the first await',async()=>{
 const budget=new Budget(1024*1024),view={mode:'map'};let reads=0;const image={surface:{descriptor:{width:3,height:2},async readWindow(r){reads++;return{pixels:{width:r.width,height:r.height,format:'rgb8',data:new Uint8Array(r.width*r.height*3).fill(200)},release(){}};}}};
 const creating=createResearchSurface(image,nativeData(),view,{budget});view.mode='overlay';const api=await creating;let a,b;
 try{a=await api.surface.readWindow();view.mode='mask';b=await api.surface.readWindow();assert.equal(api.style.mode,'map');assert.equal(a.pixels.data.every((v,i)=>v===b.pixels.data[i]),true);assert.equal(reads,0);}finally{a?.release();b?.release();await api.surface.dispose();}assert.equal(budget.total(),0);
});
test('cancelled factory retains native owner after failed retirement and preserves the primary',async()=>{
 const budget=new Budget(1024*1024),sha='a'.repeat(64),state=await createOriginalSourceRegionsState({sourceSha256:sha,width:4,height:4});await state.add('acquisition',{x0:0,y0:0,x1:2,y1:4});const domain=await compileOriginalSourceRegions(state.snapshot()),c=new AbortController(),free=budget.reserve(1024);let disposals=0;
 const originalSource={sha256:sha,surface:{descriptor:{width:4,height:4},readWindow(){throw Error('No native read expected');}}},image={sha256:sha,originalSource,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:domain.origin,surface:{descriptor:{width:domain.width,height:domain.height}}};
 const api=createStrictResearchEngine(image,budget,{maxWorkers:10},{method:'adaifl',engineFactory(){c.abort();return{analyze(){throw Error('No inference expected');},async dispose(){if(++disposals<=1)throw Object.freeze(Object.assign(Error('Factory disposal failed'),{code:'STORAGE_IO'}));free();}};}});
 const error=await api.analyze({},{signal:c.signal}).then(()=>null,e=>e);assert.equal(error?.code,'CANCELLED');assert.equal(api.snapshot().fragmentOwners,1);assert(budget.total()>1024);await api.dispose();assert.equal(disposals,2);assert.equal(budget.total(),0);
});
