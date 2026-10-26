import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {proposalDeepMaskWindows} from '../src/selfdm-proposal-pyramid.js';
import {SELFDM_PROPOSAL_CONTEXT_GEOMETRY} from '../src/selfdm-proposal-context-geometry.js';
import {createSelfDMProposalContextBanks} from '../src/selfdm-proposal-context-banks.js';

const MASK=112**2;
function geometry(count=1,width=160,height=160){
 const contexts=Array.from({length:count},(_,i)=>({id:'context-'+i,bounds:[i*(width+5),0,i*(width+5)+width,height],scales:Array.from({length:7},(_,index)=>({index,...proposalDeepMaskWindows(width,height,2**(-2.5+index*.5))}))}));
 return{policy:SELFDM_PROPOSAL_CONTEXT_GEOMETRY,cloneWindowMode:'global',contexts,commonBanks:Array.from({length:7},(_,i)=>({maximumRows:Math.min(500,contexts.reduce((n,c)=>n+c.scales[i].rows*c.scales[i].cols,0))})),provenance:{contextFingerprint:'native-test-crops',candidateFingerprint:'same'}};
}
const score=(ci,si,slot)=>Math.fround(((slot*13+ci*31+si*7)%11)/16),mask=(ci,si,slot)=>Math.fround(((slot+ci*37+si*113)%997)/997);
function nativeOutput(g,ci,si,ti){
 const scale=g.contexts[ci].scales[si],w=scale.windows[ti],rows=Math.ceil(w.height/16)-9,cols=Math.ceil(w.width/16)-9,slots=rows*cols,data=new Float32Array(slots*MASK),scores=new Float32Array(slots);
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const local=y*cols+x,slot=(y+w.y/16)*scale.cols+x+w.x/16;scores[local]=score(ci,si,slot);data.fill(mask(ci,si,slot),local*MASK,(local+1)*MASK)}
 return{mask:{data,dims:[1,slots,112,112]},score:{data:scores,dims:[1,1,rows,cols]}};
}
function reference(g){
 const all=[];
 for(let si=0;si<7;si++){
  const rows=[];let offset=0;
  for(let ci=0;ci<g.contexts.length;ci++){const s=g.contexts[ci].scales[si];for(let slot=0;slot<s.rows*s.cols;slot++)rows.push({score:score(ci,si,slot),scale:si,slot,globalSlot:offset+slot,contextIndex:ci});offset+=s.rows*s.cols}
  rows.sort((a,b)=>b.score-a.score||a.globalSlot-b.globalSlot);all.push(...rows.slice(0,500));
 }
 return all.sort((a,b)=>b.score-a.score||a.scale-b.scale||a.globalSlot-b.globalSlot).slice(0,500);
}
const fields=v=>v.map(({score,scale,slot,globalSlot,contextIndex})=>({score,scale,slot,globalSlot,contextIndex}));
async function complete(owner,g,reverse=false){
 const order=[];for(let ci=0;ci<g.contexts.length;ci++)for(let si=0;si<7;si++)for(let ti=0;ti<g.contexts[ci].scales[si].windows.length;ti++)order.push([ci,si,ti]);if(reverse)order.reverse();
 for(const[ci,si,ti]of order)await owner.consume(ci,si,ti,nativeOutput(g,ci,si,ti));
}
test('one context preserves native score/scale/slot ranking and every retained mask bit',async()=>{
 const g=geometry(),budget=new Budget(256*1024**2),owner=await createSelfDMProposalContextBanks(g,{budget});
 try{await complete(owner,g);const out=owner.finalize();assert.deepEqual(fields(out),reference(g));for(const v of out)assert.ok(v.data.every(x=>Object.is(x,mask(v.contextIndex,v.scale,v.slot))));const bytes=budget.total();assert.equal(owner.finalize(),out);assert.equal(budget.total(),bytes);assert.equal(out.length,500);assert.ok(out.every(v=>v.contextIndex===0));}finally{await owner.release()}assert.equal(budget.total(),0);
});
test('three contexts share exactly seven Top500 banks and one final Top500, invariant to completion order',async()=>{
 const g=geometry(3),budget=new Budget(384*1024**2),expected=reference(g);let first;
 for(const reverse of[false,true]){const owner=await createSelfDMProposalContextBanks(g,{budget});try{await complete(owner,g,reverse);assert.equal(owner.banks.length,7);assert.equal(owner.banks[6].count,500);const out=owner.finalize();assert.deepEqual(fields(out),expected);const copied=out.map(v=>({fields:fields([v])[0],data:v.data.slice()}));if(!first)first=copied;else assert.deepEqual(copied,first);for(const v of out)assert.ok(v.data.every(x=>Object.is(x,mask(v.contextIndex,v.scale,v.slot))));assert.ok(new Set(out.map(v=>v.contextIndex)).size>1)}finally{await owner.release()}assert.equal(budget.total(),0)}
});
test('native halo/core addressing covers every slot once, with no repeated-window publication',async()=>{
 const g=geometry(1,900,700),budget=new Budget(256*1024**2),owner=await createSelfDMProposalContextBanks(g,{budget});
 try{assert.ok(g.contexts[0].scales[6].windows.length>1);await complete(owner,g,true);assert.deepEqual(fields(owner.finalize()),reference(g));await assert.rejects(owner.consume(0,0,0,nativeOutput(g,0,0,0)),/finalized/)}finally{await owner.release()}assert.equal(budget.total(),0);
});
test('invalid probabilities fail before changing the bank or completion receipt',async()=>{
 const g=geometry(1,24,20),budget=new Budget(32*1024**2),owner=await createSelfDMProposalContextBanks(g,{budget});
 try{const output=nativeOutput(g,0,0,0);output.score.data[0]=NaN;const before=budget.total();await assert.rejects(owner.consume(0,0,0,output),/probability/);assert.equal(owner.banks[0].count,0);assert.equal(owner.banks[0].done[0][0],0);assert.equal(budget.total(),before);assert.throws(()=>owner.finalize(),/Every native/);await complete(owner,g);assert.deepEqual(fields(owner.finalize()),reference(g))}finally{await owner.release()}assert.equal(budget.total(),0);
});
test('bank admission0 retires metadata and abort stops before a native result can be consumed',async()=>{
 const g=geometry(1,24,20);let grants=0,freed=0,has=false,primary;
 try{await createSelfDMProposalContextBanks(g,{budget:{reserve(){if(++grants===2)throw 0;return()=>freed++}}})}catch(e){has=true;primary=e}assert.ok(has);assert.equal(primary,0);assert.equal(freed,1);
 const budget=new Budget(32*1024**2),controller=new AbortController(),owner=await createSelfDMProposalContextBanks(g,{budget,signal:controller.signal});controller.abort();try{await assert.rejects(owner.consume(0,0,0,nativeOutput(g,0,0,0)),e=>e.code==='CANCELLED');assert.equal(owner.banks[0].count,0)}finally{await owner.release()}assert.equal(budget.total(),0);
});
test('release retains rejected credit0 for retry and coalesces without repeating successful predecessors',async()=>{
 const g=geometry(1,24,20);let calls=0,refuse=true;
 const owner=await createSelfDMProposalContextBanks(g,{budget:{reserve(){return async()=>{calls++;if(refuse){refuse=false;throw 0}}}}});
 const a=owner.release(),b=owner.release();assert.equal(a,b);await assert.rejects(a,e=>e===0);assert.equal(owner.state().released,false);assert.equal(owner.state().reservations,2);await owner.release();assert.equal(calls,3);assert.equal(owner.state().released,true);assert.equal(owner.banks.length,0);assert.throws(()=>owner.finalize(),/Every native/);
});
test('construction primaryfalse survives cleanup0 and the registered carrier keeps retry ownership',async()=>{
 const g=geometry(1,24,20);let owner,grants=0,calls=0,refuse=true;
 await assert.rejects(createSelfDMProposalContextBanks(g,{onOwner:v=>owner=v,budget:{reserve(){if(++grants===2)throw false;return async()=>{calls++;if(refuse){refuse=false;throw 0}}}}}),e=>e===false);
 assert.equal(owner.state().released,false);assert.equal(owner.state().reservations,1);await owner.release();assert.equal(calls,2);assert.equal(owner.state().released,true);
});
test('concurrent consume refuses before mutation and parent retirement waits for the current scratch ACK',async()=>{
 const g=geometry(1,24,20);let grants=0,completeAck,startedAck;
 const ready=new Promise(resolve=>startedAck=resolve),ack=new Promise(resolve=>completeAck=resolve),owner=await createSelfDMProposalContextBanks(g,{budget:{reserve(){const current=++grants;return async()=>{if(current===3){startedAck();await ack}}}}});
 const first=owner.consume(0,0,0,nativeOutput(g,0,0,0));await ready;
 await assert.rejects(owner.consume(0,1,0,nativeOutput(g,0,1,0)),/busy/);assert.equal(owner.banks[1].count,0);
 let retired=false;const closing=owner.release().then(()=>retired=true);await Promise.resolve();assert.equal(retired,false);assert.equal(owner.state().reservations,3);completeAck();await first;await closing;assert.equal(retired,true);assert.equal(owner.state().reservations,0);
});
