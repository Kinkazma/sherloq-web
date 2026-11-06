import test from 'node:test';
import assert from 'node:assert/strict';
import {createEnergyParameterPreview} from '../sherloq-browser/assets/energy-parameter-preview.js';
import {renderEnergy} from '../sherloq-browser/assets/energy-render.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../sherloq-browser/assets/unified-engine/src/source-region-geometry.js';
import {energyContextFieldNames,ENERGY_CONTEXT_LAYOUT} from '../sherloq-browser/assets/energy-context-selection.js';

const params={quality:0,block:16,minimum:1,profile:'manual',histogramLow:10,histogramHigh:990,shadow:50,highlight:50};
const preview={maxWidth:80,maxHeight:80,adaptive:false};
const presentation={view:'overlay',opacity:70};

function fixture({synthesis=true,preparedIdentity='native-preparation-A'}={}){
 const width=80,height=80,n=width*height,live=new Map(),audit={source:[],reads:[],prepares:0,segments:0,codecs:0,maxBytes:0};let serial=0,abortPrepare=null,abortSegment=null,prepareError=null;
 const count=synthesis?1:3,names=['energy_scope','energy_low_score','energy_high_score','energy_labels',...Array.from({length:count},(_,q)=>'energy_plane_'+q)],values={energy_labels:new Int32Array(n),energy_scope:new Int32Array(n).fill(1),energy_low_score:new Float32Array(n).fill(1),energy_high_score:new Float32Array(n).fill(2),...Object.fromEntries(Array.from({length:count},(_,q)=>['energy_plane_'+q,Float32Array.from({length:n},(_,i)=>(i*7+q*11)%251)]))};
 const data={width,height,energy_summary:[{id:1,bbox:[0,0,width,height]}],...(synthesis?{energyPlaneCount:1}:{}),metadata:{method:synthesis?'ela_energy_synthesis':'ela_energy',quality:synthesis?null:75,qualities:synthesis?[]:[70,75,80],block:16,energy:{quantiles:[.01,.99],thresholds:[5,5],...(synthesis?{planeCount:1,quality_confirmation:'median-already-aggregated',preparedIdentity}:{})}}};
 const h={analysis:{id:'native-A',imageId:'original',operation:'ela.energy',status:'ok',...(synthesis?{synthesis:{key:'neutral-A'}}:{}),data,provenance:{originalSha256:'a'.repeat(64),decode:{format:'png',depth:8},params:{...params,quality:synthesis?0:75}},planeSurfaces:Object.fromEntries(names.map(name=>[name,{id:name+':A',revision:1,width,height,format:/scope|labels/.test(name)?'int32':'float32'}]))},audit,live};
 const bytes=()=>[...live.values()].reduce((sum,e)=>sum+e.bytes,0);
 const engine={async reserveExternalMemory({bytes}){const lease={id:++serial,bytes};live.set(lease.id,lease);audit.maxBytes=Math.max(audit.maxBytes,[...live.values()].reduce((n,e)=>n+e.bytes,0));return lease;},async releaseExternalMemory(id){assert(live.delete(id),'Exactly one ACK per lease');},async readPlane({surfaceId,rect}){audit.reads.push(surfaceId);const input=values[surfaceId.split(':')[0]],out=new input.constructor(rect.width*rect.height);for(let y=0;y<rect.height;y++)out.set(input.subarray((rect.y+y)*width+rect.x,(rect.y+y)*width+rect.x+rect.width),y*rect.width);return{plane:{width:rect.width,height:rect.height,data:out}};},async recompressPreviewPixels(){audit.codecs++;throw Error('Synthesis must not recompress');}};
 h.owner=createEnergyParameterPreview({engine,adaptive:false,readOriginal:async(analysis,tile)=>{audit.source.push(analysis.id);const w=Math.ceil(tile.w/tile.step),height=Math.ceil(tile.h/tile.step);return{width:w,height,format:'rgb8',data:new Uint8Array(w*height*3).fill(100)};},dependencies:{energyParams:p=>({...p}),energyProfile:()=>({quantiles:[.01,.99],thresholds:[5,5]}),energyLogData:()=>new Int32Array(1),referenceLogFunction:()=>Math.log,async prepareEnergy(source,_planes,quantiles,_log,{draftSourceScope}){audit.prepares++;if(prepareError)throw prepareError;const result={energy_scope:draftSourceScope,energy_low_score:new Float32Array(source.width*source.height).fill(quantiles[0]*100),energy_high_score:new Float32Array(source.width*source.height).fill(quantiles[1]*2),energy_summary:[{id:1,bbox:[0,0,source.width,source.height]}]};abortPrepare?.abort();return result;},async segmentEnergy(base,options){audit.segments++;const labels=Int32Array.from({length:base.width*base.height},(_,i)=>base.energy_low_score[i]+base.energy_high_score[i]>options.thresholds[0]&&i%base.metadata.block<options.minimum?1:0);abortSegment?.abort();return{labels,regions:[{id:1}]};},energyColor:()=>[170,70,20],renderEnergy,async sharedCodec(){audit.codecs++;throw Error('No codec in unchanged native field previews');}}});
 h.engine=engine;h.bytes=bytes;h.render=(p=params,options={})=>h.owner.render(h.analysis,{params:p,presentation,preview,...options});h.failPrepare=error=>prepareError=error;h.abortPrepare=controller=>abortPrepare=controller;h.abortSegment=controller=>abortSegment=controller;return h;
}

function commit(h,{identity,source,domain,synthesis}={}){
 const next=structuredClone(h.analysis);next.id+='-commit';next.provenance.params.shadow+=10;for(const field of Object.values(next.planeSurfaces)){field.id=field.id.split(':')[0]+':'+next.id;field.revision++;}
 if(identity!==undefined)next.data.metadata.energy.preparedIdentity=identity;if(source)next.provenance.originalSha256=source;if(domain)next.sourceRegionDomain={fingerprint:domain};if(synthesis)next.synthesis={key:synthesis};h.analysis=next;
}

test('verified synthesis preparation survives a new result and new RPC handles at threshold commit',async()=>{
 const h=fixture(),oracle=fixture();try{const first=await h.render(),reads=h.audit.reads.length;commit(h);const next=await h.render({...params,shadow:60}),fresh=await oracle.render({...params,shadow:60});assert.equal(next.draft.nativeSampleCache.hit,true);assert.equal(next.draft.nativeSampleCache.sourceReads,0);assert.equal(next.draft.nativeSampleCache.numericFieldsRead,0);assert.equal(h.audit.reads.length,reads);assert.equal(h.audit.source.length,1);assert.deepEqual(next.pixels.data,fresh.pixels.data);assert.equal(first.pixels.width,next.pixels.width);
  const currentId=h.analysis.id;await h.render({...params,shadow:60},{preview:{...preview,maxWidth:40,maxHeight:40}});assert.equal(h.audit.source.at(-1),currentId);assert(h.audit.reads.slice(reads).every(id=>id.endsWith(':'+currentId)),'A new grid must use the current descriptors, not old retired handles');
 }finally{await h.owner.dispose();await oracle.owner.dispose();assert.equal(h.bytes()+oracle.bytes(),0);}
});

test('source, domain, neutral key, preparation identity and sample grid remain cache boundaries',async()=>{
 for(const change of[{source:'b'.repeat(64)},{domain:'other-domain'},{synthesis:'neutral-B'},{identity:'preparation-B'},{identity:''}]){const h=fixture();try{await h.render();commit(h,change);const next=await h.render();assert.equal(next.draft.nativeSampleCache.hit,false,JSON.stringify(change));assert.equal(h.audit.source.length,2);}finally{await h.owner.dispose();assert.equal(h.bytes(),0);}}
});

test('unverified synthesis and normal three-plane results keep the historical result/revision guards',async()=>{
 for(const options of[{preparedIdentity:''},{synthesis:false}]){const h=fixture(options);try{const p={...params,quality:options.synthesis===false?75:0};await h.render(p);commit(h);assert.equal((await h.render(p)).draft.nativeSampleCache.hit,false);assert.equal(h.audit.source.length,2);}finally{await h.owner.dispose();assert.equal(h.bytes(),0);}}
});

test('one completed synthesis quantile preparation is reused for thresholds, area gates and presentation only',async()=>{
 const h=fixture(),p={...params,histogramLow:20};try{for(const change of[{}, {shadow:30},{highlight:70},{block:8},{minimum:2}]){const current={...p,...change},oracle=fixture();try{const value=await h.render(current),fresh=await oracle.render(current);assert.deepEqual(value.pixels.data,fresh.pixels.data);assert.equal(value.draft.preparationCache.hit,h.audit.segments>1);}finally{await oracle.owner.dispose();assert.equal(oracle.bytes(),0);}}assert.equal(h.audit.prepares,1);assert.equal(h.audit.codecs,0);assert.equal(h.audit.segments,5,'Real thresholds still run their segmentation');assert.equal(h.audit.source.length,1);assert(h.audit.maxBytes<=120*80*80+2*1024**2+8192+512*1024,'Retained preparation replaces, rather than adds to, the admitted frame workspace');
  await h.render({...p,histogramLow:30});assert.equal(h.audit.prepares,2);assert.equal((await h.render({...p,histogramLow:30})).draft.preparationCache.hit,true);
 }finally{await h.owner.dispose();assert.equal(h.bytes(),0);}
});

test('cancelled partial preparation is discarded; a completed preparation survives cancelled segmentation',async()=>{
 const h=fixture(),p={...params,histogramLow:20};try{const during=new AbortController();h.abortPrepare(during);await assert.rejects(h.render(p,{signal:during.signal}),{code:'CANCELLED'});h.abortPrepare(null);assert.equal(h.audit.prepares,1);const late=new AbortController();h.abortSegment(late);await assert.rejects(h.render(p,{signal:late.signal}),{code:'CANCELLED'});h.abortSegment(null);const count=h.audit.prepares,reads=h.audit.reads.length,result=await h.render(p);assert.equal(result.draft.preparationCache.hit,true);assert.equal(h.audit.prepares,count);assert.equal(h.audit.reads.length,reads);assert.equal(h.audit.codecs,0);}finally{await h.owner.dispose();assert.equal(h.bytes(),0);}
});

test('a refused preparation admission cannot allocate or cache partial fields',async()=>{
 const h=fixture(),reserve=h.engine.reserveExternalMemory;h.engine.reserveExternalMemory=async request=>{if(request.bytes===12*80*80+8192)throw Object.assign(Error('Prepared stage refused'),{code:'MEMORY_LIMIT'});return reserve(request);};try{await assert.rejects(h.render({...params,histogramLow:20}),{code:'MEMORY_LIMIT'});assert.equal(h.audit.prepares,0);assert.equal(h.audit.source.length,0);assert.equal(h.bytes(),0);}finally{await h.owner.dispose();assert.equal(h.bytes(),0);}
});

test('retiring a changed preparation waits for its lease ACK and retries a refusal before new work',async()=>{
 const h=fixture(),p={...params,histogramLow:20};try{await h.render(p);const prepared=[...h.live.values()].find(l=>l.bytes===12*80*80+8192);assert(prepared);const release=h.engine.releaseExternalMemory;let refused=false;h.engine.releaseExternalMemory=async id=>{if(id===prepared.id&&!refused){refused=true;throw Object.assign(Error('ACK not available'),{code:'STORAGE_IO'});}return release(id);};await assert.rejects(h.render({...p,histogramLow:30}),{code:'STORAGE_IO'});assert(h.live.has(prepared.id));assert.equal(h.audit.prepares,1);const recovered=await h.render({...p,histogramLow:30});assert.equal(recovered.draft.preparationCache.stored,true);assert.equal(h.audit.prepares,2);assert(!h.live.has(prepared.id));assert.equal(h.audit.source.length,1);}finally{await h.owner.dispose();assert.equal(h.bytes(),0);}
});

test('dispose joins the same retirement and can retry a refused prepared lease ACK',async()=>{
 const h=fixture();await h.render({...params,histogramLow:20});const prepared=[...h.live.values()].find(l=>l.bytes===12*80*80+8192),release=h.engine.releaseExternalMemory;let fail=true;h.engine.releaseExternalMemory=async id=>{if(id===prepared.id&&fail){fail=false;throw Object.assign(Error('Retry retirement ACK'),{code:'STORAGE_IO'});}return release(id);};const first=h.owner.dispose();assert.equal(h.owner.dispose(),first);await assert.rejects(first,{code:'STORAGE_IO'});assert(h.live.has(prepared.id));await h.owner.dispose();assert.equal(h.bytes(),0);await h.owner.dispose();assert.equal(h.bytes(),0);
});

test('an unpublished preparation lease remains owned when cleanup also fails, without replacing a frozen primary error',async()=>{
 const h=fixture(),primary=Object.freeze(Object.assign(Error('Primary preparation failure'),{code:'PRIMARY'})),release=h.engine.releaseExternalMemory;let refused=false,retiredId;
 h.failPrepare(primary);h.engine.releaseExternalMemory=async id=>{if(h.live.get(id)?.bytes===12*80*80+8192&&!refused){refused=true;retiredId=id;throw Object.assign(Error('Cleanup ACK unavailable'),{code:'STORAGE_IO'});}return release(id);};
 try{await assert.rejects(h.render({...params,histogramLow:20}),error=>error===primary);assert(h.live.has(retiredId));h.failPrepare(null);await h.render({...params,histogramLow:20});assert(!h.live.has(retiredId),'A later render must ACK the unpublished lease before new work');}finally{await h.owner.dispose();assert.equal(h.bytes(),0);}
});

test('falsy prepared-retirement ACK rejection remains a failure and can be retried to zero admissions',async()=>{
 for(const rejection of[0,false,null,undefined]){const h=fixture();await h.render({...params,histogramLow:20});const prepared=[...h.live.values()].find(l=>l.bytes===12*80*80+8192),release=h.engine.releaseExternalMemory;let fail=true;h.engine.releaseExternalMemory=async id=>{if(id===prepared.id&&fail){fail=false;throw rejection;}return release(id);};await assert.rejects(h.owner.dispose(),error=>error===rejection);assert(h.live.has(prepared.id));await h.owner.dispose();assert.equal(h.bytes(),0);}
});

test('falsy input-retirement ACK stops source replacement until the pending admission is acknowledged',async()=>{
 const h=fixture();try{await h.render();const input=[...h.live.values()].find(l=>l.bytes===15*80*80),release=h.engine.releaseExternalMemory;let fail=true;h.engine.releaseExternalMemory=async id=>{if(id===input.id&&fail){fail=false;throw 0;}return release(id);};commit(h,{source:'b'.repeat(64)});await assert.rejects(h.render(),error=>error===0);assert.equal(h.audit.source.length,1);assert(h.live.has(input.id));await h.render();assert(!h.live.has(input.id));assert.equal(h.audit.source.length,2);}finally{await h.owner.dispose();assert.equal(h.bytes(),0);}
});

test('selected native context updates its current descriptors while retaining only a verified same preparation',async()=>{
 const h=fixture(),state=await createOriginalSourceRegionsState({sourceSha256:'a'.repeat(64),width:80,height:80}),domain=await compileOriginalSourceRegions(state.snapshot()),fingerprint='c'.repeat(64);
 const context={id:'selected-native',bounds:[0,0,80,80],originalBounds:[0,0,80,80],width:80,height:80,jpegPhase:[0,0],evaluable:true,status:'analysed',nativeMetadata:structuredClone(h.analysis.data.metadata),energy_summary:h.analysis.data.energy_summary,regions:[],regionColors:[],fieldKeys:Object.fromEntries(energyContextFieldNames(h.analysis).map(name=>[name,name]))};
 h.analysis.sourceRegionDomain=domain.descriptor;h.analysis.provenance.contextPlanFingerprint=fingerprint;Object.assign(h.analysis.data,{contextLayout:ENERGY_CONTEXT_LAYOUT,contexts:[context]});Object.assign(h.analysis.data.metadata,{contextLayout:ENERGY_CONTEXT_LAYOUT,contextPlanFingerprint:fingerprint,sourceRegionFingerprint:domain.fingerprint});
 try{await h.render();const reads=h.audit.reads.length;commit(h);assert.equal((await h.render({...params,shadow:60})).draft.nativeSampleCache.hit,true);assert.equal(h.audit.reads.length,reads);assert.equal(h.owner.state.children,1);
  await h.render({...params,shadow:60},{preview:{...preview,maxWidth:40,maxHeight:40}});assert(h.audit.reads.slice(reads).every(id=>id.endsWith(':'+h.analysis.id)));
  h.analysis.data.contexts[0].nativeMetadata.energy.preparedIdentity='other-context-preparation';const value=await h.render();assert.equal(value.draft.nativeSampleCache.hit,false);
 }finally{await h.owner.dispose();assert.equal(h.bytes(),0);}
});
