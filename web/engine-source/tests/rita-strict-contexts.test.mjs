import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {ritaStrictField,planRitaStrictContexts,ritaStrictParameters} from '../src/rita-strict-contexts.js';
import {ritaStrictFixture,controlledRitaNative} from './helpers/rita-strict-fixture.mjs';

test('strict RITA validates its unchanged visual-only parameters',()=>{for(const p of [{},{threshold:0},{threshold:1}])assert.deepEqual(ritaStrictParameters(p),p);for(const p of [null,[],{threshold:-1},{threshold:2},{scale:32}])assert.throws(()=>ritaStrictParameters(p));});
test('exact plan covers admitted pixels once, including one-pixel boundary fragments',async()=>{
 const h=await ritaStrictFixture({rectangles:[[2,3,3,12],[8,4,20,15]],exclusions:[[9,5,10,6]]});let view,plan;
 try{view=await createSourceRegionView({...h.image.surface,sha256:h.image.sha256},h.domain.descriptor,{budget:h.budget});plan=await planRitaStrictContexts(view,{budget:h.budget});const seen=new Set();for(const f of plan.fragments){assert.deepEqual(f.paddedShape,[Math.ceil(f.shape[0]/32)*32,Math.ceil(f.shape[1]/32)*32]);for(let y=f.rect.y;y<f.rect.y+f.rect.height;y++)for(let x=f.rect.x;x<f.rect.x+f.rect.width;x++){assert(h.domain.contains(x,y));const k=x+':'+y;assert(!seen.has(k));seen.add(k);}}assert.equal(seen.size,h.domain.countIncluded);assert(plan.fragments.some(f=>f.rect.width===1));assert.equal(h.reads.length,0);}
 finally{plan?.release();await view?.dispose();await h.close();}assert.equal(h.budget.total(),0);
});
test('packed CHW logits preserve native bytes at fragment and channel boundaries',async()=>{
 const counts=[3,5,1],pixels=9,parts=counts.map((count,index)=>{const values=Float32Array.from({length:count*4},(_,i)=>1000*index+100*Math.floor(i/count)+i%count+.25);return{fragment:{count,offset:counts.slice(0,index).reduce((a,b)=>a+b,0)},value:{data:{logits:{async readBytes(out,offset){out.set(new Uint8Array(values.buffer,offset,out.length));}}}},values};}),expected=new Float32Array(36);
 for(let c=0;c<4;c++)for(const p of parts)expected.set(p.values.subarray(c*p.fragment.count,(c+1)*p.fragment.count),c*pixels+p.fragment.offset);
 const field=ritaStrictField(parts,'logits',pixels);assert.deepEqual(await field.readInto(new Float32Array(36)),expected);for(let offset=0;offset<field.byteLength;offset++)for(const length of [0,1,3,7,17])if(offset+length<=field.byteLength){const out=new Uint8Array(length);await field.readBytes(out,offset);assert.deepEqual(out,new Uint8Array(expected.buffer,offset,length));}
});
test('unchanged native autoregression matches independent crop references in all four packed fields',async()=>{
 const h=await ritaStrictFixture();let result;const references=[];
 try{
  result=await h.run({immutableSource:true});assert.equal(result.data.pixelCount,h.domain.countIncluded);const fragments=result.data.metadata.fragments,expected={map:new Float32Array(result.data.pixelCount),official_mask:new Float32Array(result.data.pixelCount),labels:new Float32Array(result.data.pixelCount),logits:new Float32Array(result.data.pixelCount*4)};
  for(const f of fragments){const budget=new Budget(64*1024**2),native=controlledRitaNative(budget),[x,y,right,bottom]=f.bounds,reference=await native.api.analyze({sha256:h.image.sha256,surface:{descriptor:{id:'independent/'+f.index,revision:1,width:right-x,height:bottom-y,format:'rgb8'},readWindow:(r,o)=>h.image.surface.readWindow({...r,x:x+r.x,y:y+r.y},o)}},{},{backend:'cpu'});references.push({native,budget,reference});
   for(const key of Object.keys(expected)){const channels=key==='logits'?4:1,values=await reference.data[key].readInto(new Float32Array(f.count*channels));for(let c=0;c<channels;c++)expected[key].set(values.subarray(c*f.count,(c+1)*f.count),c*result.data.pixelCount+f.offset);}
   const meta=result.provenance.executions[f.index].metadata;for(const key of ['firstColumnEosStep','selectedStep','selectedStepSigned','excludedLabel','generatedSteps'])assert.equal(meta[key],reference.data.metadata[key]);assert.equal(result.provenance.executions[f.index].provenance.originalSourceSha256,h.image.sha256);
  }
  for(const key of Object.keys(expected))assert.deepEqual(await result.data[key].readInto(new Float32Array(expected[key].length)),expected[key]);assert(result.data.metadata.fragments.every(f=>f.evaluable));assert.equal(h.native.calls.length,3*fragments.length);
  const before=h.native.calls.length,cached=await h.run({backend:'cpu',immutableSource:true});assert(cached.metrics.cache.result);assert.equal(h.native.calls.length,before);await cached.release();
 }finally{await result?.release();await h.close();for(const r of references){await r.reference.release();await r.native.api.dispose();assert.equal(r.budget.total(),0);}}
 assert.equal(h.budget.total(),0);assert.equal(h.windows.size,0);assert.equal(h.native.tensors.size,0);
});
test('excluded RGB poison cannot affect any of the four native RITA fields',async()=>{
 const first=await ritaStrictFixture({poison:0}),second=await ritaStrictFixture({poison:255});let a,b;try{a=await first.run();b=await second.run();assert.notEqual(first.image.sha256,second.image.sha256);for(const key of ['map','official_mask','labels','logits'])assert.deepEqual(await a.data[key].readInto(new Float32Array(a.data[key].length)),await b.data[key].readInto(new Float32Array(b.data[key].length)));}
 finally{await a?.release();await b?.release();await first.close();await second.close();}assert.equal(first.budget.total(),0);assert.equal(second.budget.total(),0);
});
test('source/coordinates and backend bind the cache while threshold is display-only',async()=>{
 const h=await ritaStrictFixture();let a,b,c;try{a=await h.run();const before=h.native.calls.length;b=await h.api.analyze(h.image,{threshold:.9},{sourceRegionDomain:h.domain.descriptor,backend:'cpu'});assert(b.metrics.cache.result);assert.equal(h.native.calls.length,before);c=await h.run({backend:'auto'});assert(!c.metrics.cache.result);assert.equal(h.native.calls.length,2*before);await assert.rejects(h.api.analyze({...h.image,sha256:'f'.repeat(64)},{},{sourceRegionDomain:h.domain.descriptor}),/actual Original/);}
 finally{await a?.release();await b?.release();await c?.release();await h.close();}assert.equal(h.budget.total(),0);
});
test('cancellation during a real native source read retires provisional context outputs',async()=>{
 const controller=new AbortController(),h=await ritaStrictFixture({onNetwork:()=>controller.abort()});try{await assert.rejects(h.run({signal:controller.signal}),{code:'CANCELLED'});assert.equal(h.windows.size,0);}finally{await h.close();}assert.equal(h.budget.total(),0);
});
test('frozen native failure is preserved and the wrapper can analyze again',async()=>{
 const primary=Object.freeze(Object.assign(Error('controlled primary'),{code:'CONTROLLED_PRIMARY'}));let fail=true;const h=await ritaStrictFixture({onNetwork:()=>{if(fail)throw primary;}});try{await assert.rejects(h.run(),e=>e===primary);fail=false;const result=await h.run();await result.release();}finally{await h.close();}assert.equal(h.budget.total(),0);
});
