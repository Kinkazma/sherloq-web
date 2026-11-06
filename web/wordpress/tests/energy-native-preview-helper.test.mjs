import test from 'node:test';
import assert from 'node:assert/strict';
import {createEnergyParameterPreview} from '../sherloq-browser/assets/energy-parameter-preview.js';

function fixture({synthesis=false,decline=false,sampled=false}={}){
 const width=80,height=80,n=width*height,params={quality:synthesis?0:75,block:16,minimum:1,profile:'manual',histogramLow:10,histogramHigh:990,shadow:50,highlight:50},audit={native:0,reads:0,leases:0,segments:0},live=new Set();let serial=0;
 const analysis={id:'basis',imageId:'original',provenance:{originalSha256:'a'.repeat(64),params},...(synthesis?{synthesis:{key:'median'}}:{}),data:{width,height,energy_planes:new Float32Array(n*(synthesis?1:3)),energy_scope:new Int32Array(n).fill(1),energy_low_score:new Float32Array(n),energy_high_score:new Float32Array(n),energy_summary:[{id:1,bbox:[0,0,width,height]}],...(synthesis?{energyPlaneCount:1}:{}),metadata:{quality:synthesis?null:75,qualities:synthesis?[]:[70,75,80],energy:{quantiles:[.01,.99],thresholds:[5,5],...(synthesis?{planeCount:1}:{} )}}}};
 const owner=createEnergyParameterPreview({engine:{async reserveExternalMemory(){audit.leases++;const id=++serial;live.add(id);return{id};},async releaseExternalMemory(id){assert(live.delete(id));}},adaptive:false,exactNative:async(current,options)=>{audit.native++;assert.equal(current,analysis);assert.deepEqual(options.params,params);assert.equal(options.preview.maxWidth,80);if(decline)return null;return{pixels:{width,height,format:'rgb8',data:new Uint8Array(n*3)},presentation:{view:'overlay'},draft:{nativeScientificCandidate:true,exact:true,backend:'cpu'},metrics:{cold:true}};},readOriginal:async(_a,tile)=>{audit.reads++;return{width:Math.ceil(width/tile.step),height:Math.ceil(height/tile.step),format:'rgb8',data:new Uint8Array(Math.ceil(width/tile.step)*Math.ceil(height/tile.step)*3)};},dependencies:{energyParams:p=>({...p}),segmentEnergy:async d=>{audit.segments++;return{labels:new Int32Array(d.width*d.height),regions:[]};},energyColor:()=>[0,0,0],renderEnergy:async(d,original)=>({...original}),}});
 return{analysis,params,audit,live,owner,render:extra=>owner.render(analysis,{params,presentation:{view:'overlay'},backend:'cpu',preview:{adaptive:false,maxWidth:sampled?40:80,maxHeight:sampled?40:80,maxPixels:6400},...extra})};
}
test('normal grid one invokes exact native after admission and bypasses every local draft read/lease/kernel',async()=>{
 const h=fixture();try{const answer=await h.render();assert.equal(h.audit.native,1);assert.equal(h.audit.reads,0);assert.equal(h.audit.leases,0);assert.equal(h.audit.segments,0);assert.equal(answer.draft.nativeScientificCandidate,true);assert.equal(answer.draft.exact,true);assert.equal(answer.draft.samplingStep,1);assert.equal(answer.pixels.preview,true);assert.equal(answer.presentation.preview,true);assert.equal(answer.presentation.exact,false,'the exact scientific candidate stays an uncommitted presentation');}finally{await h.owner.dispose();}
});
test('a declined full-native callback preserves the existing provisional path',async()=>{
 const h=fixture({decline:true});try{const answer=await h.render();assert.equal(h.audit.native,1);assert.equal(h.audit.reads,1);assert.equal(h.audit.segments,1);assert.equal(answer.draft.exact,false);assert.equal(answer.draft.nativeScientificCandidate,undefined);}finally{await h.owner.dispose();assert.equal(h.live.size,0);}
});
test('sampled normal and Synthese retain their existing proxy paths without calling exact Native',async()=>{
 for(const mode of [{sampled:true},{synthesis:true}]){const h=fixture(mode);try{const answer=await h.render();assert.equal(h.audit.native,0);assert.equal(h.audit.segments,1);assert.equal(answer.draft.exact,false);assert.equal(answer.draft.samplingStep,mode.sampled?2:1);}finally{await h.owner.dispose();assert.equal(h.live.size,0);}}
});
test('failed admission never calls a native candidate, and a cancelled callback never publishes it',async()=>{
 const h=fixture();try{await assert.rejects(h.render({preview:{adaptive:false,maxWidth:80,maxHeight:80,maxPixels:6400,maxWorkingBytes:1}}),{code:'MEMORY_LIMIT'});assert.equal(h.audit.native,0);const controller=new AbortController();controller.abort();await assert.rejects(h.render({signal:controller.signal}),{code:'CANCELLED'});assert.equal(h.audit.native,0);}finally{await h.owner.dispose();}
});
