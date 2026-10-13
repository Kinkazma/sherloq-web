import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createSelfDMScientificScopeInput} from '../src/selfdm-scientific-scope.js';
const sha='a'.repeat(64),rect=(x0,y0,x1,y1)=>({x0,y0,x1,y1}),polygon=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
function context({width=512,height=512,bounds=[0,0,width,height],regions=[rect(0,0,width,height)],excluded=[],status='ready'}={}){return {width,height,bounds,sourceSha256:sha,scope:{schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',sourceSha256:sha,width,height,fingerprint:'test',status,regions,excluded}};}

test('SelfDM preserves no-scope path and validates source identity before allocating',async()=>{
 const budget=new Budget(16*1024**2);assert.equal(await createSelfDMScientificScopeInput(undefined,{budget}),null);
 const wrong=context();wrong.sourceSha256='b'.repeat(64);
 await assert.rejects(createSelfDMScientificScopeInput(wrong,{budget}),{code:'INVALID_INPUT'});assert.equal(budget.total(),0);
});
test('SelfDM maps original crop coordinates and every nonzero interpolation support without touching RGB',async()=>{
 const budget=new Budget(16*1024**2),ctx=context({width:1024,height:768,bounds:[256,128,768,640],excluded:[polygon(264,136,280,152)]}),original=structuredClone(ctx),scope=await createSelfDMScientificScopeInput(ctx,{budget});
 try{
  assert.deepEqual(scope.inputs.scientific_scope_indices.dims,[scope.metadata.admittedCentres]);assert.deepEqual(scope.inputs.scientific_scope_output.dims,[1,1,512,512]);
  assert.equal(scope.inputs.scientific_scope_output.data[8*512+8],0);assert.equal(scope.matchingMask64[64+1],0);assert.equal(scope.inputs.scientific_scope_indices.data.includes(65n),false);
  assert.equal(scope.admitsSourcePoint(8,8),false);assert.equal(scope.admitsSourcePoint(32,32),true);
  assert.deepEqual(ctx,original);assert.match(scope.metadata.cnnContext,/retained/);assert.ok(scope.identity.includes(ctx.scope.fingerprint));
  const expected=[...new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(scope.matchingMask64)))].map(v=>v.toString(16).padStart(2,'0')).join('');assert.equal(scope.metadata.gridSha256,expected);assert.deepEqual(scope.metadata.grid,[64,64]);assert.equal(scope.metadata.gridDtype,'uint8');
 }finally{scope.release();}assert.equal(budget.total(),0);
});
test('SelfDM output centres reject bilinear samples on an exclusion boundary',async()=>{
 const budget=new Budget(16*1024**2),scope=await createSelfDMScientificScopeInput(context({width:256,height:256,excluded:[polygon(10,0,11,256)]}),{budget});
 try{assert.equal(scope.inputs.scientific_scope_output.data[19],0);assert.equal(scope.inputs.scientific_scope_output.data[26],1);}finally{scope.release();}assert.equal(budget.total(),0);
});
test('SelfDM cannot silently drop an acquisition between native correlation centres',async()=>{
 const budget=new Budget(16*1024**2);await assert.rejects(createSelfDMScientificScopeInput(context({regions:[rect(1,1,2,2)]}),{budget}),{code:'NEURAL_SCOPE_BELOW_GRID'});assert.equal(budget.total(),0);
});
test('SelfDM empty source scope, cancellation and admission refusal retain no mask lease',async()=>{
 const budget=new Budget(16*1024**2),empty=await createSelfDMScientificScopeInput(context({regions:[],status:'excluded'}),{budget});assert.equal(empty.metadata.admittedCentres,0);empty.release();assert.equal(budget.total(),0);
 const abort=new AbortController();abort.abort();await assert.rejects(createSelfDMScientificScopeInput(context(),{budget,signal:abort.signal}),{code:'CANCELLED'});assert.equal(budget.total(),0);
 const small=new Budget(512);await assert.rejects(createSelfDMScientificScopeInput(context(),{budget:small}),{code:'MEMORY_LIMIT'});assert.equal(small.total(),0);
});

test('SelfDM coarse candidate cells reject a thin exclusion between native centres',async()=>{
 const budget=new Budget(16*1024**2),scope=await createSelfDMScientificScopeInput(context({excluded:[polygon(1.1,1.1,1.2,3.1)]}),{budget});
 try{assert.equal(scope.matchingMask64[0],0);assert.equal(scope.inputs.scientific_scope_indices.data.includes(0n),false);assert.ok(scope.metadata.refusedCentres>0);assert.match(scope.metadata.projection,/whole native latent cell/);}finally{scope.release();}assert.equal(budget.total(),0);
});
