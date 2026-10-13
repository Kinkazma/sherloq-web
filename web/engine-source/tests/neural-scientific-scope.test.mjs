import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {prepareNeuralScientificScope,emptyScopedNeuralResult} from '../src/neural-scientific-scope.js';
const sourceSha256='a'.repeat(64),rect=(x0,y0,x1,y1)=>({x0,y0,x1,y1,polygon:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]});
const scope=(width,height,excluded=[])=>({schema:'sherloq.scientific-scope/1',status:'ready',coordinates:'original-pixels',fingerprint:'b'.repeat(64),sourceSha256,width,height,regions:[rect(0,0,width,height)],excluded});
const zone=(id,bounds)=>({id,kind:'region',bounds});
test('original-coordinate scope cancels whole inputs before inference, preserves partial original crops and charges only native mask bytes',async()=>{
 const width=32,height=16,budget=new Budget(2**20),s=scope(width,height,[rect(0,0,15,15).polygon]),zones=[zone('gone',[0,0,16,16]),zone('retained',[16,0,32,16])],before=structuredClone(zones);
 const plan=await prepareNeuralScientificScope(s,zones,{width,height,sourceSha256,side:16,budget});
 try{assert.deepEqual(plan.zones,[zones[1]]);assert.deepEqual(plan.metadata.skippedZones.map(z=>z.id),['gone']);assert.equal(plan.grids.get('retained').values,null);assert.deepEqual(zones,before);assert.equal(budget.total(),0);}finally{plan.release();}
 const partial=scope(width,height,[rect(20,3,25,9).polygon]);const next=await prepareNeuralScientificScope(partial,[zones[1]],{width,height,sourceSha256,side:16,budget});
 try{const grid=next.grids.get('retained');assert.equal(grid.admitted,256-6*7);assert.equal(grid.values[3*16+4],0);assert.equal(grid.values[2*16+4],1);assert.equal(budget.total(),256);assert.match(next.metadata.cnnContext,/remains computed/);}finally{next.release();}assert.equal(budget.total(),0);
});
test('oblique OCR polygons, fractional resize centres and crop origins use original geometry without painting pixels',async()=>{
 const width=20,height=12,budget=new Budget(2**20),s=scope(width,height,[[[8,3],[12,3],[10,7]]]);
 const plan=await prepareNeuralScientificScope(s,[zone('roi',[4,2,16,10])],{width,height,sourceSha256,side:8,budget});
 try{const g=plan.grids.get('roi');assert.equal(g.values[2*8+4],0);assert.equal(g.values[5*8+6],1);assert.equal(g.side,8);assert.deepEqual(g.bounds,[4,2,16,10]);}finally{plan.release();}
 await assert.rejects(prepareNeuralScientificScope(s,[zone('roi',[4,2,16,10])],{width,height,sourceSha256:'c'.repeat(64),side:8,budget}),/source identity/i);assert.equal(budget.total(),0);
});
test('tiny remaining acquisition is not silently discarded when the native grid has no centre',async()=>{
 const width=1024,height=1024,budget=new Budget(2**20),s={...scope(width,height),regions:[rect(20,20,21,21)]},zones=[zone('wide',[0,0,width,height])];
 await assert.rejects(prepareNeuralScientificScope(s,zones,{width,height,sourceSha256,side:8,budget}),{code:'NEURAL_SCOPE_BELOW_GRID'});assert.equal(budget.total(),0);
 const plan=await prepareNeuralScientificScope(s,zones,{width,height,sourceSha256,side:8,budget,requireGridSupport:false});try{assert.equal(plan.zones.length,1);assert.equal(plan.grids.get('wide').unrepresentedOriginalPixels,true);}finally{plan.release();}assert.equal(budget.total(),0);
});
test('fractional resized centres cannot fabricate eligible source pixels in a fully annulled input',async()=>{
 const width=16,height=16,budget=new Budget(2**20),s={...scope(width,height,[rect(0,11,16,16).polygon]),regions:[rect(0,10.9,16,16)]};
 let reservations=0;const reserve=budget.reserve.bind(budget);budget.reserve=bytes=>{reservations++;return reserve(bytes);};
 for(const retainMatchingGrid of [true,false]){
  const plan=await prepareNeuralScientificScope(s,[zone('fractional',[0,0,16,16])],{width,height,sourceSha256,side:512,budget,requireGridSupport:false,retainMatchingGrid});
  try{assert.equal(plan.zones.length,0);assert.equal(plan.metadata.skippedZones[0].reason,'no-admissible-original-pixels-before-inference');assert.equal(reservations,0);assert.equal(budget.total(),0);}finally{plan.release();}
 }
});
test('cancellation and real admission refusal release every scientific grid owner',async()=>{
 const width=32,height=16,budget=new Budget(16),s=scope(width,height),zones=[zone('roi',[0,0,width,height])];
 await assert.rejects(prepareNeuralScientificScope(s,zones,{width,height,sourceSha256,side:8,budget}),{code:'MEMORY_LIMIT'});assert.equal(budget.total(),0);
 const abort=new AbortController();abort.abort();await assert.rejects(prepareNeuralScientificScope(s,zones,{width,height,sourceSha256,side:8,budget:new Budget(2**20),signal:abort.signal}),{code:'CANCELLED'});
});
test('fully cancelled stored output synthesizes bounded zero windows and remains distinguishable from a model result',async()=>{
 const budget=new Budget(2**20),result=emptyScopedNeuralResult({width:10000,height:10000,segmented:true,roles:true,budget,metadata:{scientificScope:{skippedZones:['a']}}});
 const bytes=new Uint8Array(128).fill(255);await result.stores.mask.readInto(bytes,100000);assert.ok(bytes.every(v=>v===0));assert.equal(result.metadata.inferences,0);assert.equal(result.stores.map.byteLength,400000000);assert.equal(budget.total(),65536);result.dispose();assert.equal(budget.total(),0);await assert.rejects(result.stores.mask.readInto(bytes,0));
 const small=new Budget(65536);assert.throws(()=>emptyScopedNeuralResult({width:8,height:8,segmented:false,roles:true,budget:small,metadata:{}}),{code:'MEMORY_LIMIT'});assert.equal(small.total(),0);
});
