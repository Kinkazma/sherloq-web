import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {prepareSelfDMWindowContexts} from '../src/selfdm-window-context-plan.js';
import {prepareSelfDMProposalContextGeometry as geometry} from '../src/selfdm-proposal-context-geometry.js';
import {proposalDeepMaskWindows,proposalSourcePatch} from '../src/selfdm-proposal-pyramid.js';

async function sourcePlan(boxes,{width=24,height=20}={}){
 const budget=new Budget(32*1024**2),sha256='c'.repeat(64),state=await createOriginalSourceRegionsState({sourceSha256:sha256,width,height});
 await state.replaceZones(boxes.map((b,i)=>({id:'p'+i,kind:'acquisition',enabled:true,x0:b[0],y0:b[1],x1:b[2],y1:b[3]})),{enabled:true,positiveMode:'selected'});
 const domain=await compileOriginalSourceRegions(state.snapshot());let reads=0;
 const original={sha256,width,height,surface:{sha256,width,height,readWindow(){reads++;throw Error('Geometry read RGB')}}};
 const plan=await prepareSelfDMWindowContexts({original,window:{id:'native-window',kind:'region',bounds:[0,0,width,height],fingerprint:'canonical-same-union',contextDomain:domain.descriptor,candidateDomain:domain.descriptor}},{budget});
 return{plan,budget,reads:()=>reads};
}
const semantic=p=>({contexts:p.contexts.map(c=>({id:c.id,bounds:c.bounds,scales:c.scales})),commonBanks:p.commonBanks,finalMaximumRows:p.finalMaximumRows});
test('one context keeps every exact native pyramid window/patch/admission and does no RGB/graph',async()=>{
 const s=await sourcePlan([[0,0,24,20]]),g=await geometry(s.plan,{budget:s.budget,cloneWindowMode:'independent'});
 try{assert.equal(g.contexts.length,1);assert.equal(g.contexts[0].nativeContext,s.plan.contexts[0]);for(let i=0;i<7;i++){const scale=2**(-2.5+i*.5),n=proposalDeepMaskWindows(24,20,scale),v=g.contexts[0].scales[i];assert.equal(v.scale,scale);assert.equal(v.rows,n.rows);assert.equal(v.cols,n.cols);assert.equal(v.windows.length,n.windows.length);for(let j=0;j<n.windows.length;j++){const w=v.windows[j];for(const[k,x]of Object.entries(n.windows[j]))assert.deepEqual(w[k],x);assert.deepEqual(w.sourcePatch,proposalSourcePatch(24,20,n.ow,n.oh,n.windows[j]));assert.equal(w.nativeWorkspaceBytes,Math.ceil(w.nativeInputBytes*40/1048576)*1048576);assert.ok(w.nativeHeapBytes<=2*1024**3);}}assert.equal(s.reads(),0)}finally{await g.release();await s.plan.release()}assert.equal(s.budget.total(),0);
});
test('actual canonical L geometry is invariant to inverse order/overlaps, with only seven COMMON banks',async()=>{
 const H=[[0,0,24,12],[0,12,12,20]],V=[[0,0,12,20],[12,0,24,12]];let ref;
 for(const boxes of[H,V,[...H].reverse(),[...V].reverse().concat([[0,0,6,20],[0,0,24,6]])]){const s=await sourcePlan(boxes),g=await geometry(s.plan,{budget:s.budget,cloneWindowMode:'global'});try{const value=semantic(g);if(!ref)ref=value;else assert.deepEqual(value,ref);assert.equal(g.contexts.length,2);assert.equal(g.commonBanks.length,7);for(let i=0;i<7;i++){const slots=g.contexts.reduce((n,c)=>n+c.scales[i].rows*c.scales[i].cols,0);assert.equal(g.commonBanks[i].candidateSlots,slots);assert.equal(g.commonBanks[i].maximumRows,Math.min(500,slots));}assert.equal(s.reads(),0)}finally{await g.release();await s.plan.release()}assert.equal(s.budget.total(),0)}
});
test('mode is actual and cache/provenance identity is distinct without changing native geometry',async()=>{
 const s=await sourcePlan([[0,0,24,20]]),a=await geometry(s.plan,{budget:s.budget,cloneWindowMode:'independent'}),b=await geometry(s.plan,{budget:s.budget,cloneWindowMode:'global'});
 try{assert.deepEqual(semantic(a),semantic(b));assert.notEqual(a.fingerprint,b.fingerprint);assert.equal(b.provenance.cloneWindowMode,'global')}finally{await a.release();await b.release();await s.plan.release()}assert.equal(s.budget.total(),0);
});
test('tiny zero native scale refuses before RGB, metadata allocation or initial encoder; no skipped/clamped scale',async()=>{
 const s=await sourcePlan([[0,0,5,20]]);let grants=0;
 try{await assert.rejects(geometry(s.plan,{budget:{reserve(){grants++;throw Error('Not before geometry')}},cloneWindowMode:'independent'}),e=>e.code==='NATIVE_PROPOSAL_CONTEXT_GEOMETRY'&&e.details.outputWidth===0&&e.details.scaleIndex===0&&e.details.beforeRgbAndAnyEncoder);assert.equal(grants,0);assert.equal(s.reads(),0)}finally{await s.plan.release()}assert.equal(s.budget.total(),0);
});
test('native output-size1 at width6 remains valid, without a new artificial minimum',async()=>{
 const s=await sourcePlan([[0,0,6,20]]),g=await geometry(s.plan,{budget:s.budget,cloneWindowMode:'independent'});
 try{assert.equal(g.contexts[0].scales[0].ow,1);assert.equal(g.contexts[0].scales.length,7);assert.equal(s.reads(),0)}finally{await g.release();await s.plan.release()}assert.equal(s.budget.total(),0);
});
test('metadata admission primitive0 is preserved and an admitted predecessor retires',async()=>{
 const s=await sourcePlan([[0,0,24,20]]);let grants=0,freed=0,caught=false,reason;
 try{try{await geometry(s.plan,{budget:{reserve(){if(++grants===2)throw 0;return()=>{freed++}}},cloneWindowMode:'independent'})}catch(e){caught=true;reason=e}assert.equal(caught,true);assert.equal(reason,0);assert.equal(freed,1);assert.equal(s.reads(),0)}finally{await s.plan.release()}assert.equal(s.budget.total(),0);
});
test('release ACK0 is retryable and concurrent release coalesces, without retiring borrowed source',async()=>{
 const s=await sourcePlan([[0,0,24,20]]);let calls=0,refuse=true;
 const g=await geometry(s.plan,{budget:{reserve(){return async()=>{calls++;if(refuse){refuse=false;throw 0}}}},cloneWindowMode:'independent'});
 const a=g.release(),b=g.release();assert.equal(a,b);await assert.rejects(a,e=>e===0);assert.equal(g.state().released,false);assert.equal(g.state().metadataReservations,8);await g.release();assert.equal(g.state().released,true);assert.equal(g.state().metadataReservations,0);assert.equal(calls,9);assert.equal(s.plan.closed,false);await s.plan.release();assert.equal(s.budget.total(),0);
});
test('abort during metadata admission retires preceding grants before any RGB or graph',async()=>{
 const s=await sourcePlan([[0,0,24,20]]),controller=new AbortController();let grants=0,freed=0;
 try{await assert.rejects(geometry(s.plan,{budget:{reserve(){if(++grants===2)controller.abort();return()=>{freed++}}},signal:controller.signal,cloneWindowMode:'independent'}),e=>e.code==='CANCELLED');assert.equal(grants,freed);assert.equal(s.reads(),0)}finally{await s.plan.release()}assert.equal(s.budget.total(),0);
});
