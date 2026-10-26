import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createStrictResearchEngine} from '../src/m3-strict-research.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {checkAbort} from '../src/errors.js';

async function fixture({method='focal',shape='hole',failAt=0,malformed=false,disposalFailure=false}={}){
 const budget=new Budget(16*1024**2),state=await createOriginalSourceRegionsState({sourceSha256:'a'.repeat(64),width:16,height:12});
 await state.add('acquisition',{x0:2,y0:1,x1:8,y1:11});await state.add('acquisition',{x0:10,y0:2,x1:15,y1:10});
 if(shape==='hole')await state.add('exclusion',{x0:4,y0:4,x1:6,y1:8});
 if(shape==='polygon'){await state.clear();await state.add('acquisition',{x0:2,y0:1,x1:14,y1:11,polygon:[[2,1],[14,1],[2,11]]});}
 if(shape==='thin'){await state.clear();await state.add('acquisition',{x0:2,y0:1,x1:3,y1:11});await state.add('acquisition',{x0:10,y0:1,x1:11,y1:11});}
 const domain=await compileOriginalSourceRegions(state.snapshot()),seen=new Set(),owners=[],nativeCalls=[];let gate,disposeGate,entered,disposeEntered;
 const enteredTask=new Promise(resolve=>entered=resolve),disposeEnteredTask=new Promise(resolve=>disposeEntered=resolve);
 const original={sha256:'a'.repeat(64),surface:{descriptor:{width:16,height:12,format:'rgb8'},async readWindow(rect){const free=budget.reserve(rect.width*rect.height*3),data=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++){const ox=x+rect.x,oy=y+rect.y;assert(domain.containsOriginal(ox,oy),'Excluded RGB reached research preprocessing');seen.add(ox+':'+oy);data.set([ox,oy,ox+oy],(y*rect.width+x)*3);}return{pixels:{width:rect.width,height:rect.height,format:'rgb8',data},release:free};}}};
 const image={sha256:original.sha256,originalSource:original,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:domain.origin,surface:{descriptor:{width:domain.width,height:domain.height,format:'rgb8'}}};
 const engineFactory=input=>{
  const id=owners.length,cacheLease=budget.reserve(512),owner={image:input,computations:0,calls:0,releases:0,disposed:0,async analyze(params,{signal}={}){
   owner.calls++;entered();if(gate)await gate;checkAbort(signal);nativeCalls.push(id);if(nativeCalls.length===failAt)throw Error('native stage failed');
   const hit=owner.computations>0;if(!hit){for(let y=0;y<owner.image.height;y++){const row=await owner.image.readRows(y,1,{signal});row.release();}owner.computations++;}
   const free=budget.reserve(4096),map=Float32Array.from({length:6},(_,i)=>(id+i)/10),data=method==='focal'?{features:new Float32Array(6*288).fill(id)}:{mask:Uint8Array.from({length:6},(_,i)=>i%2)};
   if(malformed)map[0]=NaN;return{map,...data,metadata:{native_shape:[2,3],provider:'wasm',result_reused:hit,unchangedNativeParameters:params,owner:id},release(){owner.releases++;free();}};
  },async dispose(){owner.disposed++;disposeEntered();if(disposeGate)await disposeGate;if(disposalFailure&&owner.disposed===1)throw Error('native disposal failed');cacheLease();}};owners.push(owner);return owner;
 };
 const api=createStrictResearchEngine(image,budget,{maxWorkers:10},{method,engineFactory});return{api,image,budget,domain,seen,owners,nativeCalls,enteredTask,disposeEnteredTask,setGate:p=>gate=p,setDisposeGate:p=>disposeGate=p};
}

for(const method of ['focal','adaifl'])test(method+' partitions exact native observations and retains independent native grids',async()=>{
 const h=await fixture({method}),answer=await h.api.analyze({},{backend:'cpu'});assert.equal(answer.fragments.length,5);assert.equal(h.seen.size,h.domain.countIncluded);assert(h.owners.every(o=>o.calls===1&&o.releases===1&&o.image===null));
 assert.equal(new Set(answer.fragments.map(f=>f.metadata.owner)).size,5);assert.equal(answer.metadata.native_shape,null);assert.equal(answer.metadata.strictSourceRegions.excludedSamplesRead,false);assert.equal(answer.metadata.provider,'wasm');assert.equal(answer.metadata.nativeFragments.length,5);
 for(const fragment of answer.fragments){assert.equal(fragment.metadata.method,method);assert.deepEqual(fragment.metadata.native_shape,[2,3]);for(let y=fragment.bounds[1];y<fragment.bounds[3];y++)for(let x=fragment.bounds[0];x<fragment.bounds[2];x++)assert(h.domain.contains(x,y));}
 answer.release();answer.release();await h.api.dispose();assert.equal(h.budget.total(),0);
});
test('a warm native fragment cache belongs to its own rectangle, never the first image of the selection',async()=>{
 const h=await fixture(),a=await h.api.analyze(),before=h.owners.map(o=>o.computations),b=await h.api.analyze();assert.deepEqual(h.owners.map(o=>o.computations),before);assert(b.fragments.every(f=>f.metadata.result_reused));assert.deepEqual(b.fragments.map(f=>[...f.features]),a.fragments.map(f=>[...f.features]));assert.equal(b.metadata.result_reused,true);
 a.release();b.release();await h.api.dispose();assert.equal(h.budget.total(),0);
});
test('polygon and single-pixel-wide fragments are kept before the unchanged native preprocessing',async()=>{
 for(const shape of ['polygon','thin']){const h=await fixture({shape}),answer=await h.api.analyze();assert.equal(h.seen.size,h.domain.countIncluded);if(shape==='thin')assert(answer.fragments.every(f=>f.bounds[2]-f.bounds[0]===1));answer.release();await h.api.dispose();assert.equal(h.budget.total(),0);}
});
test('a later fragment stage failure does not publish or leak prior partial answers',async()=>{
 const h=await fixture({failAt:3});await assert.rejects(h.api.analyze(),/native stage failed/);assert.equal(h.owners[0].releases,1);assert.equal(h.owners[1].releases,1);assert.equal(h.owners[2].releases,0);await h.api.dispose();assert.equal(h.budget.total(),0);
});
test('cancellation during a native fragment rejects without returning a partial native-grid bundle',async()=>{
 const h=await fixture(),c=new AbortController();let resume;h.setGate(new Promise(resolve=>resume=resolve));const task=h.api.analyze({},{signal:c.signal});await h.enteredTask;c.abort();resume();await assert.rejects(task,{code:'CANCELLED'});assert.equal(h.seen.size,0);await h.api.dispose();assert.equal(h.budget.total(),0);
});
test('source identity, origin and metadata admission are checked before creating a native owner',async()=>{
 for(const mutation of [h=>{h.image.originalSource={...h.image.originalSource,sha256:'b'.repeat(64)};},h=>{h.image.sourceRegionOrigin=[];},h=>h.budget.setLimit(1024)]){
  const h=await fixture();mutation(h);await assert.rejects(h.api.analyze());assert.equal(h.owners.length,0);await h.api.dispose();assert.equal(h.budget.total(),0);
 }
});
test('unsupported scientific parameters reject before native owners and mutable caller objects cannot alter later fragments',async()=>{
 const invalid=await fixture();await assert.rejects(invalid.api.analyze({threshold:.2}),/do not expose scientific parameters/);assert.equal(invalid.owners.length,0);await invalid.api.dispose();assert.equal(invalid.budget.total(),0);
 const h=await fixture(),params={};let resume;h.setGate(new Promise(resolve=>resume=resolve));const task=h.api.analyze(params);await h.enteredTask;params.threshold=.2;resume();const result=await task;assert(result.fragments.every(f=>Object.keys(f.metadata.unchangedNativeParameters).length===0));result.release();await h.api.dispose();assert.equal(h.budget.total(),0);
});
test('a retained research owner rejects another scientific domain rather than reusing its native fragment caches',async()=>{
 const h=await fixture(),a=await h.api.analyze();a.release();const next=await createOriginalSourceRegionsState({sourceSha256:'a'.repeat(64),width:16,height:12});await next.add('acquisition',{x0:2,y0:1,x1:15,y1:11});h.api.image={...h.image,sourceRegionDomain:(await compileOriginalSourceRegions(next.snapshot())).descriptor};await assert.rejects(h.api.analyze(),/cannot change its native source domain/);await h.api.dispose();assert.equal(h.budget.total(),0);
});
test('nonfinite native research output is rejected before any scientific surface can be published',async()=>{
 const h=await fixture({malformed:true});await assert.rejects(h.api.analyze(),/invalid fragment probability geometry/);assert.equal(h.owners[0].releases,1);await h.api.dispose();assert.equal(h.budget.total(),0);
});
test('all native owners are attempted on disposal failure and a retry retains ownership of failed cleanup',async()=>{
 const h=await fixture({disposalFailure:true}),a=await h.api.analyze();a.release();await assert.rejects(h.api.dispose(),{code:'RESEARCH_CLEANUP_FAILED'});assert(h.owners.every(o=>o.disposed===1));assert(h.budget.total()>0);await h.api.dispose();assert(h.owners.every(o=>o.disposed===2));assert.equal(h.budget.total(),0);
});
test('concurrent disposal waits on the same native cleanup barrier',async()=>{
 const h=await fixture(),a=await h.api.analyze();a.release();let resume;h.setDisposeGate(new Promise(resolve=>resume=resolve));const first=h.api.dispose();await h.disposeEnteredTask;const second=h.api.dispose();assert.equal(first,second);assert(h.budget.total()>0);resume();await Promise.all([first,second]);assert(h.owners.every(o=>o.disposed===1));assert.equal(h.budget.total(),0);
});
