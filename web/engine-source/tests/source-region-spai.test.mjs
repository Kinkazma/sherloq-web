import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {sourceRegionSpai,nativeSpaiContextAdmission,nativeSpaiSampling} from '../src/source-region-spai.js';
import {prepare,runPrepared,windowPlan,extractPatchSource,extractPatch} from '../../extensions-source/spai.js';

const sha='a'.repeat(64),width=100,height=80,hash=data=>createHash('sha256').update(new Uint8Array(data.buffer,data.byteOffset,data.byteLength)).digest('hex');
async function fixture({rectangles=[],exclusions=[],poison=false,limit=64*1024**2}={}){
 const budget=new Budget(limit),state=await createOriginalSourceRegionsState({sourceSha256:sha,width,height});
 for(const[x0,y0,x1,y1]of rectangles)await state.add('acquisition',{x0,y0,x1,y1});for(const[x0,y0,x1,y1]of exclusions)await state.add('exclusion',{x0,y0,x1,y1});
 const domain=await compileOriginalSourceRegions(state.snapshot()),data=Uint8Array.from({length:width*height*3},(_,i)=>(i*23+(i>>>7)*53)%256);
 if(poison)for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(!domain.containsOriginal(x,y))for(let c=0;c<3;c++)data[(y*width+x)*3+c]^=255;
 const surface=createRgbSurface({byteLength:data.length,readInto:(out,offset)=>out.set(data.subarray(offset,offset+out.length))},{width,height,budget,ownsStore:false}),original={surface,sha256:sha,bytes:Uint8Array.of(1,2,3),blob:new Blob(['Encoded Original must not bypass strict RGB']),provenance:{format:'PNG'}},view=await createSourceRegionView({...surface,sha256:sha},domain.descriptor,{budget}),read=view.readWindow.bind(view),reads=[];
 view.readWindow=(rect,hooks)=>{assert(view.includesRectangle(rect));reads.push(rect);return read(rect,hooks);};
 return{budget,domain,data,original,view,reads,async close(){await view.dispose();await surface.dispose();budget.clear();assert.equal(budget.total(),0);}};
}
const signature=p=>p.patches.map(patch=>Object.fromEntries(Object.entries(patch.feeds).map(([name,feed])=>[name,hash(feed.data)])));
const nativeRunner=(calls,gate=async()=>{})=>async(task,image,hooks)=>{
 assert.equal(image.bytes,undefined);assert.equal(image.blob,undefined);assert.equal(image.source,undefined);await gate(task,image,hooks);
 const d=image.surface.descriptor,prepared=await prepare({width:d.width,height:d.height,sourceSha256:image.sha256,readWindow:image.surface.readWindow},{signal:hooks.signal,onProgress:hooks.onProgress}),hashes=signature(prepared);let encoder=0,aggregator=0;
 const result=await runPrepared(prepared,{loadSession:async(id,path)=>({id,path}),infer:async(session,feeds)=>{if(session.path.endsWith('encoder.onnx')){encoder++;const v=Number.parseInt(hash(feeds.x.data).slice(0,6),16)/16777216;return{features:{data:Float32Array.from({length:1096},(_,i)=>Math.fround(v+(i%7)/8))}};}aggregator++;return{logits:{data:Float32Array.of(Number.parseInt(hash(feeds.features.data).slice(0,6),16)/8388608-1)}};}},{signal:hooks.signal,onProgress:hooks.onProgress});
 calls.push({task,image,hashes,encoder,aggregator});return{operation:task.operation,status:'ok',data:result,provenance:{controlledGraph:true,input:image.provenance},metrics:{encoder,aggregator}};
};
const run=(h,runner,hooks={})=>sourceRegionSpai({task:{id:'spai',imageId:'source',operation:'ai.generation.spai',params:{},backend:'cpu'},original:h.original,view:h.view,domain:h.domain,budget:h.budget,runNative:runner,...hooks});

for(const[name,config]of [['whole',{}],['disjoint',{rectangles:[[1,1,33,33],[60,2,92,34]]}],['hole',{exclusions:[[32,24,48,48]]}]])test('actual SPAI three spectral inputs equal independent native224 FFT preprocessing: '+name,async()=>{
 const h=await fixture(config),calls=[];try{const result=await run(h,nativeRunner(calls));let i=0;for(const rect of h.view.admittedRectangles()){
  const fragment=result.data.fragments[i++],data=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++)data.set(h.data.subarray(((rect.y+y+h.domain.origin[1])*width+rect.x+h.domain.origin[0])*3,((rect.y+y+h.domain.origin[1])*width+rect.x+h.domain.origin[0]+rect.width)*3),y*rect.width*3);
  const expected=await prepare({width:rect.width,height:rect.height,data});assert.deepEqual(calls.shift().hashes,signature(expected));assert.equal(fragment.data.patch_count,5);assert.equal(fragment.nativeObservedPixels,rect.width*rect.height);
 }assert.equal(result.data.scores,undefined);assert.equal(result.metrics.selectedPixels,h.domain.countIncluded);assert.equal(result.metrics.unanalysablePixels,0);assert.equal(h.budget.active,0);}finally{await h.close();}
});

test('poison outside admission cannot change any native FFT tensor or the learned-aggregator input',async()=>{
 const a=await fixture({rectangles:[[1,1,81,65]],exclusions:[[33,17,49,49]]}),b=await fixture({rectangles:[[1,1,81,65]],exclusions:[[33,17,49,49]],poison:true}),ca=[],cb=[];try{const x=await run(a,nativeRunner(ca)),y=await run(b,nativeRunner(cb));assert.deepEqual(ca.map(c=>c.hashes),cb.map(c=>c.hashes));assert.deepEqual(x.data.fragments.map(f=>f.data),y.data.fragments.map(f=>f.data));}finally{await a.close();await b.close();}
});

test('native sampler matches exact windowPlan and reflected observation union, including ties-to-even and grid remainders',()=>{
 const reflected=(i,n)=>{if(n===1)return 0;const period=2*(n-1);i=((i%period)+period)%period;return i<n?i:period-i;};
 for(const[width,height]of [[1,1],[3,7],[1,1000],[1000,1],[225,447],[227,449],[448,447],[448,448],[896,224],[999,230],[1000,879]]){
  const sampling=nativeSpaiSampling(width,height),native=windowPlan(width,height),seen=new Uint8Array(width*height);let count=0;
  assert.deepEqual(sampling.windows.map(w=>w.originPixels),native.origins);assert.deepEqual(sampling.reflectionPadding,native.padding);assert.equal(sampling.windowCount,native.origins.length);
  for(const[oy,ox]of native.origins)for(let y=0;y<224;y++)for(let x=0;x<224;x++){const sy=reflected(oy+y-native.padding[0],height),sx=reflected(ox+x-native.padding[1],width),index=sy*width+sx;if(!seen[index]){seen[index]=1;count++;}}
  assert.equal(sampling.observedPixels,count,`${width}x${height}`);let described=0;const union=new Uint8Array(seen.length);for(const w of sampling.windows){const[x0,y0,x1,y1]=w.sourceObservationBounds;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(!union[y*width+x]){union[y*width+x]=1;described++;}}assert.deepEqual(union,seen);assert.equal(described,count);
 }
 assert.equal(nativeSpaiSampling(999,230).observedPixels,896*224);assert.throws(()=>nativeSpaiContextAdmission('ai.generation.bfree',{width:14,height:14}));
});

test('native one-pixel contexts remain evaluable with reflected inputs, never a fabricated zero or new minimum14',async()=>{
 const h=await fixture({rectangles:[[1,1,2,2]]}),calls=[];try{const result=await run(h,nativeRunner(calls));assert.equal(calls.length,1);assert.equal(result.metrics.analysedPixels,1);assert.equal(result.data.fragments[0].evaluable,true);assert.equal(result.data.fragments[0].data.patch_count,5);assert.equal(nativeSpaiContextAdmission('ai.generation.spai',{width:1,height:1}).evaluable,true);}finally{await h.close();}
});

test('native source-window padding equals direct array padding for short axes and all source reads return their owners',async()=>{
 for(const[w,h]of [[1,1],[3,7],[3,449],[449,3],[227,449]]){const data=Uint8Array.from({length:w*h*3},(_,i)=>i%256),windows=new Set(),source={width:w,height:h,async readWindow(rect){const pixels=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++)pixels.set(data.subarray(((rect.y+y)*w+rect.x)*3,((rect.y+y)*w+rect.x+rect.width)*3),y*rect.width*3);const owner={pixels:{width:rect.width,height:rect.height,data:pixels},async release(){windows.delete(owner);}};windows.add(owner);return owner;}};const plan=windowPlan(w,h);for(const origin of plan.origins)assert.equal(hash(await extractPatchSource(source,origin,plan.padding)),hash(extractPatch({width:w,height:h,data},origin,plan.padding)));assert.equal(windows.size,0);}
});

test('metadata admission and wrong view binding fail before scientific RGB or any native runner',async()=>{
 for(const limit of [1024,64*1024**2]){const h=await fixture({limit});try{let calls=0;await assert.rejects(run(h,async()=>{calls++;return{status:'error',error:{code:'ACTUAL_MODEL_ERROR',message:'controlled failure'}};}),e=>e.code===(limit===1024?'MEMORY_LIMIT':'ACTUAL_MODEL_ERROR'));assert.equal(h.budget.active,0);assert.equal(h.reads.length,0);assert.equal(calls,limit===1024?0:1);}finally{await h.close();}}
 const a=await fixture({rectangles:[[1,1,33,33]]}),b=await fixture({rectangles:[[60,2,92,34]]});try{await assert.rejects(sourceRegionSpai({task:{id:'x',operation:'ai.generation.spai'},original:a.original,view:b.view,domain:a.domain,budget:a.budget,runNative(){throw Error('must not run');}}),{code:'INVALID_INPUT'});}finally{await a.close();await b.close();}
});

test('cancel during native preprocessing returns windows and metadata, preserves caller and prior result',async()=>{
 const h=await fixture({rectangles:[[1,1,33,33],[60,2,92,34]]}),controller=new AbortController();try{const old=await run(h,nativeRunner([]));const before=structuredClone(old);await assert.rejects(run(h,nativeRunner([]),{signal:controller.signal,onProgress:e=>{if(e.phase==='preprocess')controller.abort();}}),e=>e.code==='CANCELLED'||e.name==='AbortError');assert.deepEqual(old,before);assert.equal(h.budget.active,0);}finally{await h.close();}
});

test('unlocalized scientific geometry and mismatched native patch counts never publish',async()=>{
 for(const field of ['excluded','exclusions','regions','scientificScope']){const h=await fixture();try{let calls=0;await assert.rejects(sourceRegionSpai({task:{id:'x',operation:'ai.generation.spai',params:{[field]:[{x0:1,y0:1,x1:2,y1:2}]}},original:h.original,view:h.view,domain:h.domain,budget:h.budget,runNative(){calls++;}}),{code:'SOURCE_COORDINATES_UNLOCALIZED'});assert.equal(calls,0);}finally{await h.close();}}
 const h=await fixture();try{await assert.rejects(run(h,async()=>({operation:'ai.generation.spai',status:'ok',data:{method:'spai',patch_count:4,scores:{global_logit:0,sigmoid_score_uncalibrated:.5}}})),{code:'INVALID_INPUT'});assert.equal(h.budget.active,0);}finally{await h.close();}
});

test('unchanged native streaming preserves every feature row and configured encoder padding instead of reducing a large grid',async()=>{
 const width=65*224,height=1,data=Uint8Array.from({length:width*3},(_,i)=>Math.floor(i/(224*3))*3%256),budget=new Budget(128*1024**2),prepared=await prepare({width,height,data},{streaming:true,batchSize:16,encoderBatchSize:4});assert.equal(prepared.patch_count,65);assert.equal(prepared.patches,undefined);let encoder=0,aggregator=0;const consumed=[];
 const result=await runPrepared(prepared,{loadSession:async(id,path)=>({path}),infer:async(session,feeds)=>{if(session.path.endsWith('encoder.onnx')){encoder++;assert.deepEqual(feeds.x.dims,[4,3,224,224]);const out=new Float32Array(4*1096);for(let k=0;k<4;k++){consumed.push(feeds.x.data[k*3*224*224]);out.fill(feeds.x.data[k*3*224*224],k*1096,(k+1)*1096);}return{features:{data:out}};}aggregator++;assert.deepEqual(feeds.features.dims,[1,65,1096]);for(let i=0;i<65;i++){const expected=consumed[i];assert.equal(feeds.features.data[i*1096],expected);assert.equal(feeds.features.data[(i+1)*1096-1],expected);}return{logits:{data:Float32Array.of(.375)}};}},{source:{width,height,data},budget,encoderBatchSize:4});
 assert.equal(encoder,17);assert.equal(aggregator,1);assert.equal(consumed.length,68);assert.equal(result.patch_count,65);assert.equal(result.preprocessing.paddedEncoderWindows,3);assert.equal(result.preprocessing.streaming,true);assert.equal(result.scores.global_logit,.375);assert.equal(budget.active,0);
});

test('a variable million-window metadata plan is refused before plan/RGB construction, not after an unaccounted allocation',async()=>{
 const size=224*1024,budget=new Budget(1024*1024),domain={fingerprint:'controlled-large-domain',sourceSha256:sha,countIncluded:size*size,origin:[0,0],descriptor:{sourceSha256:sha,width:size,height:size}},view={domain,admittedRectangles:function*(){yield{x:0,y:0,width:size,height:size};},readWindow(){throw Error('No admitted RGB before metadata reservation');},includesRectangle(){throw Error('No sampled plan should be constructed');}};let native=0;
 await assert.rejects(sourceRegionSpai({task:{id:'large',operation:'ai.generation.spai'},original:{sha256:sha,provenance:{}},view,domain,budget,runNative(){native++;}}),{code:'MEMORY_LIMIT'});assert.equal(native,0);assert.equal(budget.active,0);
});

test('SPAI source preprocessing waits for asynchronous strict-window retirement before any FFT/model consumer can proceed',async()=>{
 let releaseGate,entered,releaseEntered=new Promise(r=>entered=r),gate=new Promise(r=>releaseGate=r),held=0,first=true,finished=false;
 const budget=new Budget(16*1024**2),state=await createOriginalSourceRegionsState({sourceSha256:sha,width:2,height:2}),domain=await compileOriginalSourceRegions(state.snapshot()),source={descriptor:{width:2,height:2,format:'rgb8'},async readWindow(rect){held++;const owned={pixels:{width:rect.width,height:rect.height,format:'rgb8',data:new Uint8Array(rect.width*rect.height*3).fill(71)},async release(){if(first){first=false;entered();await gate;}held--;}};return owned;}},view=await createSourceRegionView({...source,sha256:sha},domain.descriptor,{budget});
 try{const pending=sourceRegionSpai({task:{id:'ack',operation:'ai.generation.spai'},original:{sha256:sha,surface:source,provenance:{format:'RGB8'}},view,domain,budget,runNative:nativeRunner([])}).then(value=>{finished=true;return value;});await releaseEntered;await new Promise(r=>setTimeout(r,0));assert.equal(held,1);assert.equal(finished,false);releaseGate();const result=await pending;assert.equal(result.data.fragments[0].data.patch_count,5);assert.equal(held,0);assert.equal(budget.active,0);}finally{releaseGate();await view.dispose();assert.equal(held,0);}
});

test('SPAI captures task/decode values once, and per-context native mutation cannot contaminate the next context or caller',async()=>{
 const h=await fixture({rectangles:[[1,1,33,33],[60,2,92,34]]}),task={id:'capture',imageId:'source',operation:'ai.generation.spai',params:{displayLabel:'retained'}},calls=[];try{const result=await sourceRegionSpai({task,original:h.original,view:h.view,domain:h.domain,budget:h.budget,runNative:nativeRunner(calls,async(t,image)=>{assert.equal(t.params.displayLabel,'retained');assert.equal(image.provenance.originalDecode.format,'PNG');t.params.displayLabel='native-mutated';image.provenance.originalDecode.format='native-mutated';task.params.displayLabel='caller-changed';})});assert.equal(result.provenance.params.displayLabel,'retained');assert.equal(h.original.provenance.format,'PNG');assert.equal(calls.length,2);}finally{await h.close();}
});
