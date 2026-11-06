import test from 'node:test';
import assert from 'node:assert/strict';
import {createEnergyParameterPreview} from '../sherloq-browser/assets/energy-parameter-preview.js';
import {sampleEnergyField} from '../sherloq-browser/assets/energy-native-fields.js';
import {ADAPTIVE_PREVIEW_MAX_SIDE} from '../sherloq-browser/assets/preview-limits.js';

// These are transport/lifecycle tests, not a synthetic codec or timing score.
// Keep the real preview admission and native sampling; isolate only the
// scientific preparation/segmentation, which have independent exactness tests.
const MiB=1024**2,CAP=262144;
const params={quality:75,block:16,minimum:1,profile:'manual',histogramLow:20,histogramHigh:990,shadow:50,highlight:50};
const type=name=>name==='energy_scope'?Int32Array:Float32Array;
const scalar=name=>name==='energy_scope'?1:name==='energy_low_score'?.25:name==='energy_high_score'?.5:2+Number(name.at(-1));

function fixture({synthesis=false,width=2255,height=1511,budget=1024*MiB}={}){
 const count=synthesis?1:3,n=width*height,live=new Map(),audit={reads:[],originals:[],prepares:0,segments:0,maxBytes:0,codec:0};
 let serial=0,generation=1,onRead=null,onSegment=null,refuseRelease=null;
 const names=['energy_scope','energy_low_score','energy_high_score',...Array.from({length:count},(_,i)=>'energy_plane_'+i)];
 const p={...params,quality:synthesis?0:75};
 const analysis={id:'native-1',imageId:'source',operation:'ela.energy',...(synthesis?{synthesis:{key:'neutral-1'}}:{}),data:{width,height,energy_summary:[{id:1,bbox:[0,0,width,height]}],...(synthesis?{energyPlaneCount:1}:{}),metadata:{method:synthesis?'ela_energy_synthesis':'ela_energy',quality:synthesis?null:75,qualities:synthesis?[]:[70,75,80],block:16,energy:{quantiles:[.01,.99],thresholds:[5,5],...(synthesis?{planeCount:1,quality_confirmation:'median-already-aggregated',preparedIdentity:'preparation-1'}:{})}}},provenance:{originalSha256:'a'.repeat(64),decode:{format:'webp',depth:8},params:p}};
 const descriptors=()=>Object.fromEntries(names.map(name=>[name,{id:name+':'+generation,revision:generation,width,height,format:name==='energy_scope'?'int32':'float32'}]));
 analysis.planeSurfaces=descriptors();
 const bytes=()=>[...live.values()].reduce((sum,e)=>sum+e.bytes,0);
 const engine={
  async reserveExternalMemory({bytes:amount}){assert(Number.isSafeInteger(amount)&&amount>=0);if(bytes()+amount>budget)throw Object.assign(Error('Preview admission refused'),{code:'MEMORY_LIMIT'});const lease={id:++serial,bytes:amount};live.set(lease.id,lease);audit.maxBytes=Math.max(audit.maxBytes,bytes());return lease;},
  async releaseExternalMemory(id){if(refuseRelease?.(id))throw Object.assign(Error('Retirement ACK temporarily refused'),{code:'STORAGE_IO'});assert(live.delete(id),'A reservation is ACKed once');},
  async readPlane({surfaceId,revision,rect}){
   const name=surfaceId.split(':')[0];assert.equal(surfaceId,name+':'+generation,'Only the current native handle may be read');assert.equal(revision,generation);
   assert(names.includes(name));assert(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=width&&rect.y+rect.height<=height);assert(rect.width*rect.height<=CAP,'The one MiB numeric transport cap is independent of preview dimensions');
   audit.reads.push({name,revision,...rect});await onRead?.(audit.reads.length);
   return{plane:{width:rect.width,height:rect.height,data:new (type(name))(rect.width*rect.height).fill(scalar(name))}};
  },
  async recompressPreviewPixels(){audit.codec++;throw Error('Unchanged native fields must not be recompressed');}
 };
 const owner=createEnergyParameterPreview({engine,adaptive:false,readOriginal:async(current,tile)=>{assert.equal(current.id,analysis.id);assert.equal(tile.step,1,'A grid within the common bound and admitted budget must remain full resolution');audit.originals.push(current.id);return{width,height,format:'rgb8',data:new Uint8Array(n*3).fill(100)};},dependencies:{
  energyParams:value=>({...value}),energyLogData:()=>new Int32Array(1),referenceLogFunction:()=>Math.log,
  async prepareEnergy(source,planes,quantiles,_log,{draftSourceScope,planeCount}){audit.prepares++;assert.equal(source.width,width);assert.equal(source.height,height);assert.equal(planeCount,count);assert.equal(planes.length,n*count);assert.equal(draftSourceScope.length,n);assert.equal(draftSourceScope[0],1);assert.equal(draftSourceScope[n-1],1);for(let q=0;q<count;q++){assert.equal(planes[q*n],2+q);assert.equal(planes[(q+1)*n-1],2+q);}return{energy_scope:draftSourceScope,energy_low_score:new Float32Array(n).fill(quantiles[0]),energy_high_score:new Float32Array(n).fill(quantiles[1]),energy_summary:[{id:1,bbox:[0,0,width,height]}]};},
  async segmentEnergy(base){audit.segments++;assert.equal(base.width,width);assert.equal(base.height,height);await onSegment?.();return{labels:new Int32Array(n),regions:[]};},
  energyColor:()=>[0,0,0],renderEnergy:async(_draft,original)=>({...original,format:'rgb8'}),async sharedCodec(){audit.codec++;throw Error('No codec is required for retained native fields');}
 }});
 return{analysis,engine,owner,audit,live,bytes,params:p,
  render:(extra={})=>owner.render(analysis,{params:p,presentation:{view:'overlay',opacity:70},preview:{adaptive:false,maxWidth:ADAPTIVE_PREVIEW_MAX_SIDE,maxHeight:ADAPTIVE_PREVIEW_MAX_SIDE,maxPixels:n,maxWorkingBytes:768*MiB},...extra}),
  onRead:value=>{onRead=value;},onSegment:value=>{onSegment=value;},refuseRelease:value=>{refuseRelease=value;},
  replace(){generation++;analysis.id='native-'+generation;analysis.provenance.originalSha256='b'.repeat(64);analysis.planeSurfaces=descriptors();}
 };
}

for(const synthesis of[false,true])test(`native 2255×1511 ${synthesis?'Synthèse one-plane':'normal three-plane'} proxy keeps the full admitted grid`,async()=>{
 const h=fixture({synthesis});try{const result=await h.render();assert.equal(result.draft.samplingStep,1);assert.equal(result.pixels.width,2255);assert.equal(result.pixels.height,1511);assert.equal(result.pixels.logicalWidth,2255);assert.equal(result.draft.energyPlaneCount,synthesis?1:3);assert.equal(result.draft.nativeSampleCache.numericFieldsRead,synthesis?4:6);assert.equal(h.audit.prepares,1);assert.equal(h.audit.codec,0);assert.equal(h.audit.originals.length,1);assert.equal(new Set(h.audit.reads.map(r=>r.name)).size,synthesis?4:6);for(const name of new Set(h.audit.reads.map(r=>r.name)))assert.equal(h.audit.reads.filter(r=>r.name===name).reduce((sum,r)=>sum+r.width*r.height,0),2255*1511,'Every native point is transported exactly once');assert(h.audit.maxBytes<=768*MiB);const reads=h.audit.reads.length;assert.equal((await h.render()).draft.nativeSampleCache.hit,true);assert.equal(h.audit.reads.length,reads);}finally{await h.owner.dispose();assert.equal(h.bytes(),0);}
});

test('the common display bound is accepted in both axes, while bound+1 is rejected before reads',async()=>{
 for(const [width,height]of[[ADAPTIVE_PREVIEW_MAX_SIDE,1],[1,ADAPTIVE_PREVIEW_MAX_SIDE]]){const analysis={data:{width,height}},reads=[];const engine={async readPlane({rect}){reads.push(rect);return{plane:{width:rect.width,height:rect.height,data:new Int32Array(rect.width*rect.height).fill(7)}};}};analysis.planeSurfaces={energy_scope:{id:'scope',revision:1,width,height}};const actual=await sampleEnergyField(analysis,'energy_scope',{width,height,step:1,maxWindowRows:height},{engine});assert.equal(actual.length,width*height);assert(actual.every(v=>v===7));const calls=reads.length;await assert.rejects(sampleEnergyField(analysis,'energy_scope',{width:width===1?1:width+1,height:height===1?1:height+1,step:1},{engine}),{code:'INVALID_INPUT'});assert.equal(reads.length,calls);}
});

test('large-grid denied admission does not read source or native fields and retires all leases',async()=>{
 const h=fixture({synthesis:true,height:32,budget:MiB});try{await assert.rejects(h.render(),{code:'MEMORY_LIMIT'});assert.equal(h.audit.originals.length,0);assert.equal(h.audit.reads.length,0);assert.equal(h.audit.prepares,0);assert.equal(h.bytes(),0);}finally{await h.owner.dispose();assert.equal(h.bytes(),0);}
});

for(const synthesis of[false,true])test(`large-grid ${synthesis?'Synthèse':'normal'} cancellation discards partial input and a new source reads current revisions`,async()=>{
 const h=fixture({synthesis,height:32}),controller=new AbortController();h.onRead(()=>controller.abort());try{await assert.rejects(h.render({signal:controller.signal}),{code:'CANCELLED'});assert.equal(h.audit.reads.length,1);assert.equal(h.audit.prepares,0);assert.equal(h.bytes(),0);h.onRead(null);h.replace();const result=await h.render();assert.equal(result.draft.nativeSampleCache.hit,false);assert(h.audit.reads.slice(1).every(r=>r.revision===2));assert.equal(h.audit.originals.at(-1),'native-2');}finally{await h.owner.dispose();assert.equal(h.bytes(),0);}
});

test('large-grid retirement keeps refused reservations reachable and retries ACK before replacing source',async()=>{
 const h=fixture({synthesis:true,height:32});try{await h.render();const input=[...h.live.values()].find(lease=>lease.bytes===(15+4)*2255*32);assert(input);let refused=false;h.refuseRelease(id=>id===input.id&&!refused&&(refused=true));h.replace();const reads=h.audit.reads.length;await assert.rejects(h.render(),{code:'STORAGE_IO'});assert(h.live.has(input.id));assert.equal(h.audit.reads.length,reads);await h.render();assert(!h.live.has(input.id));assert(h.audit.reads.slice(reads).every(r=>r.revision===2));}finally{await h.owner.dispose();assert.equal(h.bytes(),0);}
});
