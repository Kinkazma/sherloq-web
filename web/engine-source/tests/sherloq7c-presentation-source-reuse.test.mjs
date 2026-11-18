import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {native16Descriptor} from '../src/rgb16-surface.js';
import {createSherloqPresentationCache} from '../src/sherloq7c-presentation-cache.js';

// Metadata/ownership protocol tests. The native descriptor is the real public
// API used by Gradient; no image data or numerical result is fabricated here.
function fixture(){
 const budget=new Budget(1024*1024),cache=createSherloqPresentationCache({budget}),counts={imports:0,releases:0,clears:0};
 const image={sha256:'a'.repeat(64),width:4,height:3,surface:{descriptor:{id:'original-rgb8',revision:1,width:4,height:3,format:'rgb8'}},nativeSurface:{descriptor:{id:'original-rgb16',revision:2,width:4,height:3,format:'rgb16',depth:16,sourceDepth:16,color:{transfer:'srgb'},provenance:{source:'decoded-original'}}}};
 const core={memory:()=>({busy:false}),async clearCache(){counts.clears++;}};
 const plan={base:{intensity:13,method:'scharr',view:'angle',equalize:false},state:{sherloq7c:{maxSide:512,precision:'1e-2',computationMode:'fast'}}};
 const task=(id,revelation=100)=>({id,imageId:'image-A',operation:'detail.gradient',workingDepth:16,backend:'auto',params:{...plan.base,equalization:{method:'sherloq7c',revelation}}});
 const answer=()=>({id:'first',imageId:'image-A',operation:'detail.gradient',status:'ok',layout:'surface',surface:{id:'computed-gradient',revision:1,width:4,height:3,format:'rgb8'},layers:[{id:'gradient',surfaceId:'computed-gradient',kind:'rgb'}],provenance:{precision:{...native16Descriptor(image.nativeSurface),operation:'detail.gradient'}},metrics:{analysisCacheHit:true}});
 async function begin(id,r=100,submitted=task(id,r)){return cache.begin(submitted,plan,image,core);}
 async function input(tx){return tx.source(async()=>{counts.imports++;return{byteLength:72,async release(){counts.releases++;}};});}
 async function commit(tx,value=answer()){await input(tx);return tx.commit(value,value.surface);}
 return{budget,cache,counts,image,core,plan,task,answer,begin,input,commit};
}

test('the real Original native16 descriptor is retained across Revelation-only presentations',async()=>{
 const f=fixture(),first=await f.begin('first');assert.equal(first.hit,false);assert.equal(await f.commit(first),true);await first.finish();
 const second=await f.begin('second',37);assert.equal(second.hit,true);assert.equal(second.programIdentity.sourceKey,first.programIdentity.sourceKey);
 const answer=second.answer();assert.equal(answer.id,'second');assert.equal(answer.provenance.precision.surfaceId,'original-rgb16');assert.equal(answer.provenance.precision.revision,2);
 await f.input(second);await second.finish();assert.equal(f.counts.imports,1);assert.equal(f.counts.releases,0);assert.equal(f.cache.snapshot().entries,1);
 await f.cache.dispose();assert.equal(f.counts.releases,1);assert.equal(f.counts.clears,1);assert.equal(f.budget.total(),0);
});

test('a reference belonging to another native Original cannot commit the source cache',async()=>{
 const f=fixture(),tx=await f.begin('first'),answer=f.answer();answer.provenance.precision.surfaceId='another-image-native16';
 assert.equal(await f.commit(tx,answer),false);await tx.finish();assert.equal(f.cache.snapshot().entries,0);assert.equal(f.counts.releases,1);assert.equal(f.budget.total(),0);await f.cache.dispose();
});

test('a different image id cannot reuse the previous native presentation source',async()=>{
 const f=fixture(),first=await f.begin('first');assert.equal(await f.commit(first),true);await first.finish();
 const second=await f.begin('second',37,{...f.task('second',37),imageId:'image-B'});assert.equal(second.hit,false);assert.equal(f.counts.releases,1);assert.equal(f.counts.clears,1);
 await second.finish();await f.cache.dispose();assert.equal(f.budget.total(),0);
});

test('a new native revision invalidates the key even when RGB8 identity and task are unchanged',async()=>{
 const f=fixture(),first=await f.begin('first');assert.equal(await f.commit(first),true);await first.finish();
 f.image.nativeSurface={descriptor:{...f.image.nativeSurface.descriptor,revision:3}};
 const second=await f.begin('second',37);assert.equal(second.hit,false);assert.notEqual(second.programIdentity.sourceKey,first.programIdentity.sourceKey);assert.equal(f.counts.releases,1);
 await second.finish();await f.cache.dispose();assert.equal(f.budget.total(),0);
});

test('matching ids do not admit mismatched native revisions or geometry',async()=>{
 for(const change of [{revision:7},{width:9},{format:'rgb8'},{depth:8}]){
  const f=fixture(),tx=await f.begin('first'),answer=f.answer();Object.assign(answer.provenance.precision,change);
  assert.equal(await f.commit(tx,answer),false);await tx.finish();await f.cache.dispose();assert.equal(f.budget.total(),0);
 }
});

test('native source admission does not relax mutable metadata, table, layer or auxiliary-resource guards',async()=>{
 const cases=[
  answer=>{answer.provenance.backing=new Uint8Array(1);},
  answer=>{Object.defineProperty(answer.provenance,'accessor',{enumerable:true,get(){assert.fail('metadata accessors must not execute');}});},
  answer=>{answer.provenance.tableId='original-rgb16';},
  answer=>{answer.layers[0].surfaceId='original-rgb16';},
  answer=>{answer.maskSurfaces={mask:{id:'auxiliary-mask',revision:1,width:4,height:3}};},
  answer=>{answer.provenance.other={id:'foreign-surface',revision:1,width:4,height:3,format:'rgb16'};}
 ];
 for(const change of cases){const f=fixture(),tx=await f.begin('first'),answer=f.answer();change(answer);assert.equal(await f.commit(tx,answer),false);await tx.finish();assert.equal(f.counts.releases,1);await f.cache.dispose();assert.equal(f.budget.total(),0);}
});

test('source unload retires both the retained native import and metadata without retiring a foreign image',async()=>{
 const f=fixture(),tx=await f.begin('first');assert.equal(await f.commit(tx),true);await tx.finish();assert.ok(f.budget.total()>0);
 await f.cache.clearImage('image-B');assert.equal(f.cache.snapshot().entries,1);assert.equal(f.counts.releases,0);
 await f.cache.clearImage('image-A');assert.deepEqual(f.cache.snapshot(),{entries:0,pendingRetirements:0,busy:false,sourceBytes:0,metadataBytes:0});assert.equal(f.counts.releases,1);assert.equal(f.counts.clears,1);assert.equal(f.budget.total(),0);await f.cache.dispose();
});

test('a lazy native attachment commits its final key without losing the first warm interaction',async()=>{
 const f=fixture(),native=f.image.nativeSurface;delete f.image.nativeSurface;
 const first=await f.begin('first');assert.equal(first.hit,false);f.image.nativeSurface=native;assert.equal(await f.commit(first),true);await first.finish();
 const second=await f.begin('second',37);assert.equal(second.hit,true);assert.equal(f.counts.imports,1);assert.equal(f.counts.clears,0);await second.finish();await f.cache.dispose();assert.equal(f.counts.releases,1);assert.equal(f.budget.total(),0);
});

test('native attachment cannot hide a changed Original, and an existing native owner cannot change during preparation',async()=>{
 for(const change of [
  f=>{f.image.surface={descriptor:{...f.image.surface.descriptor,revision:2}};},
  f=>{f.image.sha256='b'.repeat(64);},
  f=>{f.image.nativeSurface={descriptor:{...f.image.nativeSurface.descriptor,revision:3}};},
  f=>{f.image.nativeSurface.descriptor={...f.image.nativeSurface.descriptor,revision:3};}
 ]){const f=fixture(),tx=await f.begin('first');change(f);assert.equal(await f.commit(tx),false);await tx.finish();assert.equal(f.cache.snapshot().entries,0);assert.equal(f.counts.releases,1);await f.cache.dispose();assert.equal(f.budget.total(),0);}
 const f=fixture(),native=f.image.nativeSurface;delete f.image.nativeSurface;const tx=await f.begin('first');f.image.nativeSurface=native;f.image.sha256='b'.repeat(64);assert.equal(await f.commit(tx),false);await tx.finish();await f.cache.dispose();assert.equal(f.budget.total(),0);
});

test('an inserted native owner without a valid descriptor cannot commit even when its scientific key is unchanged',async()=>{
 const f=fixture();delete f.image.nativeSurface;const tx=await f.begin('first');f.image.nativeSurface={};
 await f.input(tx);
 assert.equal(tx.commit({status:'ok',surface:{id:'computed-gradient',revision:1,width:4,height:3,format:'rgb8'},provenance:{}},{id:'computed-gradient',revision:1,width:4,height:3,format:'rgb8'}),false);
 await tx.finish();assert.equal(f.cache.snapshot().entries,0);assert.equal(f.counts.releases,1);await f.cache.dispose();assert.equal(f.budget.total(),0);
});

test('a lazy native attachment cannot hide scientific base parameter or task mutations',async()=>{
 for(const mutate of [(f,submitted)=>{f.plan.base.intensity=80;},(f,submitted)=>{submitted.backend='cpu';}]){
  const f=fixture(),native=f.image.nativeSurface;delete f.image.nativeSurface;const submitted=f.task('first'),tx=await f.begin('first',100,submitted);
  f.image.nativeSurface=native;mutate(f,submitted);assert.equal(await f.commit(tx),false);await tx.finish();assert.equal(f.cache.snapshot().entries,0);assert.equal(f.counts.releases,1);await f.cache.dispose();assert.equal(f.budget.total(),0);
 }
});
