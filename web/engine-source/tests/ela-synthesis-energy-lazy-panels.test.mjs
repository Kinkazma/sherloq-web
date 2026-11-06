import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {computeElaSynthesisEnergy} from '../src/ela-synthesis-energy.js';

const read=async store=>{const out=new Uint8Array(store.byteLength);await store.readInto(out,0);return out;};
const source=(bytes,budget)=>({sha256:'a'.repeat(64),surface:createRgbSurface({byteLength:bytes.length,readInto(out,offset=0){out.set(bytes.subarray(offset,offset+out.length));},dispose(){}},{width:80,height:80,budget,ownsStore:false})});

for(const profile of ['manual','standard','sensitive'])test(`${profile}: a retained preparation segments exactly without a now-unavailable panel detector`,async()=>{
 const budget=new Budget(64*1024**2),image=source(new Uint8Array(80*80*3).fill(90),budget),residual=source(Uint8Array.from({length:80*80*3},(_,i)=>(Math.imul(i,37)+(i>>7))%256),budget);
 let plane,automatic,detectorCalls=0,planeAcquisitions=0,refusePanels=false,livePanels=0,warm,hit,reference;
 const preparations=new Map(),log=Math.log;
 const detector=async()=>{detectorCalls++;if(refusePanels)throw Error('Panel detection is unavailable after warm preparation');const free=budget.reserve(1024);let disposed=false;livePanels++;return{polygons:[],dispose(){if(!disposed){disposed=true;livePanels--;free();}}};};
 // The scientific stores are genuinely retained by this fixture cache. Panel
 // geometry is deliberately not cached, reproducing optional panel-cache eviction.
 const stages={
  async plane(make){planeAcquisitions++;plane??=await make();return{...plane,dispose(){}};},
  panels(make){return make();},
  async prepared(quantiles,make){const key=JSON.stringify(quantiles);let value=preparations.get(key);if(!value){value=await make();preparations.set(key,value);}return{...value,dispose(){}};},
  async automatic(make){automatic??=await make();return structuredClone(automatic);},
  segmented(value){return value;},
 };
 const initial={block:16,profile,...profile==='manual'?{shadow:20}:{},minimum:3},changed={...initial,...profile==='manual'?{shadow:80}:{},minimum:4};
 try{
  warm=await computeElaSynthesisEnergy(image,residual.surface,initial,{budget,log,scoreBackend:'cpu',synthesisKey:'same-neutral-median',panelDetector:detector,stages});
  const preparedCount=preparations.size,afterWarm=detectorCalls;assert.ok(preparedCount>0);assert.equal(livePanels,1,'Only actual miss preparation borrows the current panel result');
  await warm.dispose();warm=null;assert.equal(livePanels,0);refusePanels=true;
  hit=await computeElaSynthesisEnergy(image,residual.surface,changed,{budget,log,scoreBackend:'cpu',synthesisKey:'same-neutral-median',panelDetector:detector,stages});
  assert.equal(detectorCalls,afterWarm,'Prepared hits never consult the unavailable panel detector');assert.equal(planeAcquisitions,2,'Every result still acquires its real residual plane');assert.equal(preparations.size,preparedCount);assert.equal(hit.data.energy_planes[0],plane.store,'Published scientific plane is still the actual retained residual store');
  reference=await computeElaSynthesisEnergy(image,residual.surface,changed,{budget,log,scoreBackend:'cpu',synthesisKey:'same-neutral-median',panelDetector:async()=>({polygons:[],dispose(){}})});
  for(const field of ['energy_scope','energy_low_score','energy_high_score','energy_labels'])assert.deepEqual(await read(hit.data[field]),await read(reference.data[field]),field);
  assert.deepEqual(await read(hit.data.energy_planes[0]),await read(reference.data.energy_planes[0]));assert.deepEqual(hit.data.energy_summary,reference.data.energy_summary);assert.deepEqual(hit.data.regions,reference.data.regions);assert.deepEqual(hit.data.regionColors,reference.data.regionColors);assert.deepEqual(hit.data.metadata,reference.data.metadata);
 }finally{
  await warm?.dispose();await hit?.dispose();await reference?.dispose();for(const value of preparations.values())await value.dispose();await plane?.dispose();await image.surface.dispose();await residual.surface.dispose();
 }
 assert.equal(livePanels,0);assert.equal(budget.total(),0,'Real field, label, panel and summary owners all retire');
});
