import test from 'node:test';
import assert from 'node:assert/strict';
import {createEnergyParameterPreview} from '../sherloq-browser/assets/energy-parameter-preview.js';
import {renderEnergy} from '../sherloq-browser/assets/energy-render.js';
import {EngineError} from '../sherloq-browser/assets/unified-engine/src/errors.js';
import {numericPlaneSamplePlan} from '../sherloq-browser/assets/unified-engine/src/numeric-plane-sampling.js';

const MiB=1024**2,heap=32*MiB,overhead=2*MiB+8192;
const params={quality:0,block:16,minimum:1,profile:'manual',histogramLow:10,histogramHigh:990,shadow:50,highlight:50};
const presentation={view:'overlay',opacity:70};
function fixture({synthesis=true,direct=true}={}){
 const width=80,height=80,n=width*height,count=synthesis?1:3,live=new Map(),audit={reads:0,direct:0,source:0,prepares:0,segments:0,codecs:0,reserves:0,releases:[]};let serial=0,ceiling=heap+16*MiB,releaseGate=null;
 const values={energy_scope:new Int32Array(n).fill(1),energy_low_score:new Float32Array(n).fill(1),energy_high_score:new Float32Array(n).fill(2),...Object.fromEntries(Array.from({length:count},(_,q)=>['energy_plane_'+q,Float32Array.from({length:n},(_,i)=>(i*7+q*11)%251)]))};
 const panels=[{id:1,bbox:[0,0,width,height]}],analysis={id:'native',imageId:'original',...(synthesis?{synthesis:{key:'median-native'}}:{}),provenance:{originalSha256:'a'.repeat(64),decode:{format:'png',depth:8},params:{...params,quality:synthesis?0:75}},planeSurfaces:Object.fromEntries(Object.keys(values).map(name=>[name,{id:name,revision:1,width,height,format:name==='energy_scope'?'int32':'float32'}])),data:{width,height,energy_summary:panels,...(synthesis?{energyPlaneCount:1}:{}),metadata:{method:synthesis?'ela_energy_synthesis':'ela_energy',quality:synthesis?null:75,block:16,energy:{quantiles:[.01,.99],thresholds:[5,5],...(synthesis?{planeCount:1,quality_confirmation:'median-already-aggregated',preparedIdentity:'verified-median-preparation'}:{})}}}};
 const bytes=()=>[...live.values()].reduce((sum,l)=>sum+l.bytes,0);
 const engine={
  capabilities:()=>({memory:{budgetBytes:ceiling,policyAvailableBytes:ceiling-bytes(),knownHeapCapacityBytes:heap}}),
  async reserveExternalMemory({bytes:amount}){audit.reserves++;assert(Number.isSafeInteger(amount)&&amount>=0);if(amount+heap>ceiling-bytes())throw new EngineError('MEMORY_LIMIT','Real working headroom exhausted');const lease={id:'lease-'+(++serial),bytes:amount};live.set(lease.id,lease);return lease;},
  async releaseExternalMemory(id){audit.releases.push(id);if(releaseGate?.id===id){const gate=releaseGate;releaseGate=null;gate.entered.resolve();await gate.done.promise;}assert(live.delete(id),'One ACK per live lease');},
  async readPlane({surfaceId,rect}){audit.reads++;const input=values[surfaceId],data=new input.constructor(rect.width*rect.height);for(let y=0;y<rect.height;y++)data.set(input.subarray((rect.y+y)*width+rect.x,(rect.y+y)*width+rect.x+rect.width),y*rect.width);return{plane:{width:rect.width,height:rect.height,data}};},
  async recompressPreviewPixels(){audit.codecs++;throw Error('No codec for retained native planes');}
 };
 if(direct)engine.samplePlane=async request=>{audit.direct++;assert.equal(request.workspaceReservationId,undefined,'Retained caches are never lent to Core');const descriptor=analysis.planeSurfaces[request.surfaceId],plan=numericPlaneSamplePlan(descriptor,request),lease=await engine.reserveExternalMemory({bytes:plan.requiredBytes});try{const input=values[request.surfaceId],data=new input.constructor(request.width*request.height);for(let y=0;y<request.height;y++)for(let x=0;x<request.width;x++)data[y*request.width+x]=input[y*request.step*width+x*request.step];return{surfaceId:request.surfaceId,revision:request.revision,plane:{width:request.width,height:request.height,format:descriptor.format,data},metrics:{workingBytes:plan.requiredBytes}};}finally{await engine.releaseExternalMemory(lease.id);}};
 const owner=createEnergyParameterPreview({engine,adaptive:false,readOriginal:async(_analysis,tile)=>{audit.source++;return{width:Math.ceil(tile.w/tile.step),height:Math.ceil(tile.h/tile.step),format:'rgb8',data:new Uint8Array(Math.ceil(tile.w/tile.step)*Math.ceil(tile.h/tile.step)*3).fill(100)};},dependencies:{energyParams:p=>({...p}),energyProfile:()=>({quantiles:[.01,.99],thresholds:[5,5]}),energyLogData:()=>new Int32Array(1),referenceLogFunction:()=>Math.log,async prepareEnergy(source,_planes,quantiles,_log,{draftSourceScope}){audit.prepares++;return{energy_scope:draftSourceScope,energy_low_score:new Float32Array(source.width*source.height).fill(quantiles[0]*100),energy_high_score:new Float32Array(source.width*source.height).fill(quantiles[1]*2),energy_summary:panels};},async segmentEnergy(base,options){audit.segments++;return{labels:Int32Array.from({length:base.width*base.height},(_,i)=>i%7<options.thresholds[0]?1:0),regions:[{id:1}]};},energyColor:()=>[170,70,20],renderEnergy}});
 return{owner,analysis,audit,live,engine,bytes,setCeiling:value=>{ceiling=value;},gateRelease:id=>{const entered=gate(),done=gate();releaseGate={id,entered,done};return{entered:entered.promise,finish:done.resolve};},working:()=>Math.max(0,Math.floor(Math.min(ceiling/3,ceiling-bytes()-heap))),render:(p=params,preview={})=>owner.render(analysis,{params:{...p,quality:synthesis?0:75},presentation,preview:{maxWidth:80,maxHeight:80,adaptive:false,maxWorkingBytes:Math.max(0,Math.floor(Math.min(ceiling/3,ceiling-bytes()-heap))),...preview}})};
}
function gate(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}

for(const synthesis of [true,false])test((synthesis?'synthesis':'normal')+' input cache keeps its admitted grid with live capabilities and an ordinary direct sampler',async()=>{
 const h=fixture({synthesis}),oracle=fixture({synthesis,direct:false}),workspace=overhead+(synthesis?152:160)*40*40;h.setCeiling(heap+workspace);oracle.setCeiling(heap+workspace);
 try{
  const first=await h.render(),held=first.draft.nativeSampleCache.bytes,working=h.working(),readCount=h.audit.direct;assert.equal(first.draft.samplingStep,2);assert.equal(held,15*40*40);assert.equal(working,workspace-held);assert.equal(readCount,3);assert.equal(h.audit.reads,0);
  const next=await h.render({...params,shadow:30}),fresh=await oracle.render({...params,shadow:30});assert.equal(next.draft.samplingStep,2,'The already funded cache does not force step3');assert.equal(next.draft.nativeSampleCache.hit,true);assert.equal(next.draft.nativeSampleCache.numericFieldsRead,0);assert.equal(h.audit.direct,readCount);assert.equal(h.audit.source,1);assert.equal(h.audit.codecs,0);assert.deepEqual(next.pixels.data,fresh.pixels.data);
 }finally{await h.owner.dispose();await oracle.owner.dispose();assert.equal(h.bytes()+oracle.bytes(),0);}
});

test('retained synthesis input and quantile owners replace frame bytes; setup credit stays excluded',async()=>{
 const h=fixture(),p={...params,histogramLow:20};try{
  await h.render(p);assert.equal(h.audit.prepares,1);const setup=[...h.live.values()].find(l=>l.bytes===512*1024);assert(setup);const workspace=overhead+152*40*40;h.setCeiling(heap+setup.bytes+workspace);
  const first=await h.render(p);assert.equal(first.draft.samplingStep,2);assert.equal(first.draft.preparationCache.stored,true);const readCount=h.audit.direct,prepared=h.audit.prepares;
  const next=await h.render({...p,shadow:30});assert.equal(next.draft.samplingStep,2);assert.equal(next.draft.nativeSampleCache.hit,true);assert.equal(next.draft.preparationCache.hit,true);assert.equal(h.audit.direct,readCount);assert.equal(h.audit.prepares,prepared);assert.equal(h.audit.codecs,0);
  const retained=next.draft.nativeSampleCache.bytes+next.draft.preparationCache.bytes;
  await assert.rejects(h.render(p,{maxWorkingBytes:overhead-retained-setup.bytes+160}),{code:'MEMORY_LIMIT'});assert.equal(h.audit.direct,readCount,'A setup lease is not planning credit');assert(h.live.has(setup.id));
 }finally{await h.owner.dispose();assert.equal(h.bytes(),0);}
});

for(const change of ['grid','source'])test(change+' replacement waits for retained input ACK before new allocation or reads',async()=>{
 const h=fixture(),workspace=overhead+152*40*40;h.setCeiling(heap+workspace);let pending,ticket;
 try{
  const first=await h.render(),input=[...h.live.values()].find(l=>l.bytes===first.draft.nativeSampleCache.bytes),reserves=h.audit.reserves,reads=h.audit.direct;ticket=h.gateRelease(input.id);
  if(change==='source')h.analysis.provenance.originalSha256='b'.repeat(64);
  pending=h.render(params,change==='grid'?{maxWidth:27,maxHeight:27}:{});await ticket.entered;assert(h.live.has(input.id));assert.equal(h.audit.reserves,reserves);assert.equal(h.audit.direct,reads);ticket.finish();
  const next=await pending;pending=null;assert.equal(next.draft.nativeSampleCache.hit,false);assert.equal(next.draft.samplingStep,change==='grid'?3:2);assert.equal(next.draft.sourceSha256,h.analysis.provenance.originalSha256);assert.equal(h.audit.source,2);assert(!h.live.has(input.id));
 }finally{ticket?.finish();await pending?.catch(()=>{});await h.owner.dispose();assert.equal(h.bytes(),0);}
});

test('false and zero retirement replies keep their debt and stop new work until retry ACK',async()=>{
 for(const refusal of [false,0]){const h=fixture(),workspace=overhead+152*40*40;h.setCeiling(heap+workspace);try{
  const first=await h.render(),input=[...h.live.values()].find(l=>l.bytes===first.draft.nativeSampleCache.bytes),release=h.engine.releaseExternalMemory,reserves=h.audit.reserves,reads=h.audit.direct;let refused=false;
  h.engine.releaseExternalMemory=async id=>{if(id===input.id&&!refused){refused=true;return refusal;}return release(id);};
  await assert.rejects(h.render(params,{maxWidth:27,maxHeight:27}),{code:'BUSY'});assert(h.live.has(input.id));assert.equal(h.audit.reserves,reserves);assert.equal(h.audit.direct,reads);
  const next=await h.render(params,{maxWidth:27,maxHeight:27});assert.equal(next.draft.samplingStep,3);assert.equal(next.draft.nativeSampleCache.hit,false);assert(!h.live.has(input.id));assert.equal(h.audit.source,2);
 }finally{await h.owner.dispose();assert.equal(h.bytes(),0);}}
});
