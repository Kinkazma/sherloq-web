import test from 'node:test';
import assert from 'node:assert/strict';
import {createEnergyHistogram} from '../sherloq-browser/assets/energy-histogram.js';

function fixture({synthesis=true,residualIdentity}={}){
 const width=32,height=24,n=width*height,live=new Map(),audit={numeric:0,original:0,open:0};let seq=0,abortRead=null;
 const plane=Float32Array.from({length:n},(_,i)=>(i%97)/13),values={energy_scope:Int32Array.from({length:n},(_,i)=>i%23?1:0),energy_low_score:Float32Array.from({length:n},(_,i)=>i%17/7),energy_high_score:Float32Array.from({length:n},(_,i)=>i%19/8)};
 const probe={q10:.2,q90:5,central_mean:2,central_variance:1,low_mean:.1,low_variance:0,high_mean:6,high_variance:1};
 const reader=(array,id)=>({descriptor:{id,revision:1,width,height,format:array instanceof Int32Array?'int32':'float32'},async readWindow(rect){audit.numeric++;audit.open++;const data=new array.constructor(rect.width*rect.height);for(let y=0;y<rect.height;y++)data.set(array.subarray((rect.y+y)*width+rect.x,(rect.y+y)*width+rect.x+rect.width),y*rect.width);abortRead?.abort();return{plane:{width:rect.width,height:rect.height,data},release(){audit.open--;}};}});
 function analysis(version='A') {const panels=[{id:1,bbox:[0,0,width,height],probes:Array.from({length:synthesis?1:3},()=>({...probe,tag:version}))}];return{id:'result-'+version,imageId:'source',operation:'ela.energy',status:'ok',provenance:{originalSha256:'a'.repeat(64),decode:{format:'png',depth:8}},sourceRegionDomain:{fingerprint:'domain-A'},data:{width,height,...(synthesis?{energyPlaneCount:1}:{}),...Object.fromEntries(Object.entries(values).map(([name,array])=>[name,reader(array,name+version)])),energy_planes:Array.from({length:synthesis?1:3},(_,i)=>reader(plane,'plane'+i+version)),energy_summary:panels,metadata:{method:synthesis?'ela_energy_synthesis':'ela_energy',quality:synthesis?null:75,qualities:synthesis?[]:[70,75,80],energy:{enabled:true,planeCount:synthesis?1:3,quality_confirmation:synthesis?'median-already-aggregated':undefined,preparedIdentity:'same-verified-preparation',residualIdentity,quantiles:[.01,.99],thresholds:[5,5],panels}}}};}
 const engine={async reserveExternalMemory({bytes}){const lease={id:++seq,bytes};live.set(lease.id,lease);return lease;},async releaseExternalMemory(id){assert(live.delete(id),'Every histogram lease must receive exactly one ACK');}},helper=createEnergyHistogram({engine,maximumWindowBytes:1024,readOriginal:async(_analysis,rect)=>{audit.original++;return{width:rect.width,height:rect.height,data:new Uint8Array(rect.width*rect.height*3).fill(100)};}});
 return{analysis,helper,audit,live,abortReads:controller=>abortRead=controller,bytes:()=>[...live.values()].reduce((n,l)=>n+l.bytes,0)};
}

test('verified synthesis distributions survive a new result and handles while IDs, probes and threshold markers stay current',async()=>{
 const h=fixture();try{const first=await h.helper.get(h.analysis()),reads=h.audit.numeric,original=h.audit.original,next=h.analysis('B');next.data.metadata.energy.thresholds=[2,8];const second=await h.helper.get(next);assert.equal(h.audit.numeric,reads);assert.equal(h.audit.original,original);assert.equal(second.scores.counts,first.scores.counts);assert.equal(second.reference.counts,first.reference.counts);assert.equal(second.source.resultId,'result-B');assert.equal(second.reference.probe.tag,'B');assert.equal(second.panels[0].probes[0].tag,'B');assert.deepEqual(second.scores.markers,[{kind:'low',value:-2,weakValue:-1},{kind:'high',value:8,weakValue:4}]);assert.deepEqual(second.metadata.energy.thresholds,[2,8]);assert.equal(h.live.size,2,'Reuse only the two already financed complete distributions');assert.equal(h.audit.open,0);}finally{await h.helper.dispose();assert.equal(h.bytes(),0);}
});

test('source, decoded grid, domain, preparation, panels and score selection remain complete population boundaries',async()=>{
 const changes=[a=>a.provenance.originalSha256='b'.repeat(64),a=>a.provenance.decode.depth=16,a=>a.sourceRegionDomain.fingerprint='domain-B',a=>a.data.metadata.energy.preparedIdentity='other-preparation',a=>a.data.energy_summary[0].bbox=[1,0,32,24],a=>a.data.metadata.energy.quantiles=[.02,.98]];
 for(const change of changes){const h=fixture();try{await h.helper.get(h.analysis());const reads=h.audit.numeric,next=h.analysis('B');change(next);await h.helper.get(next);assert(h.audit.numeric>reads);}finally{await h.helper.dispose();assert.equal(h.bytes(),0);}}
 const h=fixture();try{const first=await h.helper.get(h.analysis()),reads=h.audit.numeric;const selected=await h.helper.get(h.analysis('B'),{panelId:1});assert.notEqual(selected.scores.counts,first.scores.counts);assert(h.audit.numeric>reads);await assert.rejects(h.helper.get(h.analysis('C'),{qualityIndex:1}),{code:'INVALID_INPUT'});}finally{await h.helper.dispose();assert.equal(h.bytes(),0);}
});

test('missing proof and normal three-plane analyses do not ignore result or reader identities',async()=>{
 for(const synthesis of[true,false]){const h=fixture({synthesis});try{const a=h.analysis();if(synthesis)delete a.data.metadata.energy.preparedIdentity;await h.helper.get(a);const reads=h.audit.numeric,b=h.analysis('B');if(synthesis)delete b.data.metadata.energy.preparedIdentity;await h.helper.get(b);assert(h.audit.numeric>reads);}finally{await h.helper.dispose();assert.equal(h.bytes(),0);}}
});

test('quantiles and score backend changes invalidate score bins but preserve the independently verified raw residual distribution',async()=>{
 const h=fixture({residualIdentity:'native-plane-A'});try{const first=await h.helper.get(h.analysis()),reads=h.audit.numeric,original=h.audit.original,b=h.analysis('B');b.data.metadata.energy.preparedIdentity='new-quantiles-and-score-provider';b.data.metadata.energy.quantiles=[.02,.98];b.data.metadata.energy.thresholds=[3,7];b.data.energy_summary[0].probes[0].q10=.3;const second=await h.helper.get(b);assert.notEqual(second.scores.counts,first.scores.counts);assert.equal(second.reference.counts,first.reference.counts);assert.equal(h.audit.original,original);assert(h.audit.numeric>reads);assert.equal(second.reference.cuts[0].quantile,.02);assert.equal(second.reference.cuts[0].value,.3);assert.equal(second.reference.probe.tag,'B');assert.equal(second.scores.markers[0].value,-3);
 }finally{await h.helper.dispose();assert.equal(h.bytes(),0);}
});

test('source, context or primitive identity changes invalidate both complete distributions',async()=>{
 for(const change of[a=>a.provenance.originalSha256='b'.repeat(64),a=>a.sourceRegionDomain.fingerprint='context-B',a=>{a.data.metadata.energy.residualIdentity='native-plane-B';a.data.metadata.energy.preparedIdentity='new-map-B';}]){const h=fixture({residualIdentity:'native-plane-A'});try{const first=await h.helper.get(h.analysis()),original=h.audit.original,next=h.analysis('B');change(next);const second=await h.helper.get(next);assert.notEqual(second.scores.counts,first.scores.counts);assert.notEqual(second.reference.counts,first.reference.counts);assert(h.audit.original>original);}finally{await h.helper.dispose();assert.equal(h.bytes(),0);}}
});

test('a cancelled partial distribution never becomes a hit and all window leases are closed',async()=>{
 const h=fixture(),stop=new AbortController();h.abortReads(stop);try{await assert.rejects(h.helper.get(h.analysis(),{signal:stop.signal}),{code:'CANCELLED'});assert.equal(h.audit.open,0);assert.equal(h.bytes(),0);const before=h.audit.numeric;h.abortReads(null);const next=await h.helper.get(h.analysis('B'));assert(h.audit.numeric>before);assert.equal(next.source.resultId,'result-B');assert.equal(h.live.size,2);}finally{await h.helper.dispose();assert.equal(h.bytes(),0);}
});

test('verified cache hits still reject an incompatible numeric field type',async()=>{
 const h=fixture();try{await h.helper.get(h.analysis());const next=h.analysis('B');next.data.energy_low_score=new Float64Array(32*24);await assert.rejects(h.helper.get(next),{code:'HISTOGRAM_NATIVE_UNAVAILABLE'});}finally{await h.helper.dispose();assert.equal(h.bytes(),0);}
});
