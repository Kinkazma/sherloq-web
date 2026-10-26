import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {sourceRegionGeneration,createGenerationContextImage,nativeGenerationContextAdmission,nativeGenerationSampling} from '../src/source-region-generation.js';
import {prepare,runPrepared} from '../../extensions-source/bfree.js';

const sha='a'.repeat(64),width=100,height=80;
async function fixture({rectangles=[],exclusions=[],poison=false,limit=64*1024**2}={}){
 const budget=new Budget(limit),state=await createOriginalSourceRegionsState({sourceSha256:sha,width,height});
 for(const [x0,y0,x1,y1]of rectangles)await state.add('acquisition',{x0,y0,x1,y1});
 for(const [x0,y0,x1,y1]of exclusions)await state.add('exclusion',{x0,y0,x1,y1});
 const domain=await compileOriginalSourceRegions(state.snapshot()),data=Uint8Array.from({length:width*height*3},(_,i)=>(i*23+(i>>>7)*53)%256);
 if(poison)for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(!domain.containsOriginal(x,y))for(let c=0;c<3;c++)data[(y*width+x)*3+c]^=255;
 const surface=createRgbSurface({byteLength:data.length,readInto:(out,offset)=>out.set(data.subarray(offset,offset+out.length))},{width,height,budget,ownsStore:false}),original={surface,sha256:sha,bytes:Uint8Array.of(1,2,3),blob:new Blob(['Original encoded bytes must never substitute a native context']),provenance:{format:'PNG'}},view=await createSourceRegionView({...surface,sha256:sha},domain.descriptor,{budget}),read=view.readWindow.bind(view),reads=[];
 view.readWindow=(rect,hooks)=>{assert(view.includesRectangle(rect));reads.push(rect);return read(rect,hooks);};
 return{budget,domain,data,original,view,reads,async close(){view.dispose();await surface.dispose();budget.clear();assert.equal(budget.total(),0);}};
}
const signature=p=>p.patches.map(w=>createHash('sha256').update(new Uint8Array(w.feeds.images.data.buffer)).digest('hex'));
const nativeRunner=(calls,gate=async()=>{})=>async(task,image,hooks)=>{
 assert.equal(image.bytes,undefined);assert.equal(image.blob,undefined);assert.equal(image.source,undefined);
 await gate(task,image,hooks);const d=image.surface.descriptor,prepared=await prepare({width:d.width,height:d.height,sourceSha256:image.sha256,readWindow:image.surface.readWindow},{signal:hooks.signal,onProgress:hooks.onProgress});
 const hashes=signature(prepared);let inference=0;const result=await runPrepared(prepared,{loadSession:async()=>({}),infer:async()=>({logits:{data:Float32Array.of(++inference/8)}})},{signal:hooks.signal,onProgress:hooks.onProgress});
 calls.push({task,image,hashes,inference});return{operation:task.operation,status:'ok',data:result,provenance:{controlledLogits:true,input:image.provenance},metrics:{modelCalls:inference}};
};
const run=(h,runNative,hooks={})=>sourceRegionGeneration({task:{id:'generation',imageId:'source',operation:'ai.generation.bfree',params:{},backend:'cpu'},original:h.original,view:h.view,domain:h.domain,budget:h.budget,runNative,...hooks});

for(const [name,config]of [['whole',{}],['disjoint',{rectangles:[[1,1,33,33],[60,2,92,34]]}],['hole',{exclusions:[[32,24,48,48]]}]])test('actual B-Free five-window native preprocessing is exact for each admitted context: '+name,async()=>{
 const h=await fixture(config),calls=[];try{const result=await run(h,nativeRunner(calls));let i=0;for(const rect of h.view.admittedRectangles()){
  const fragment=result.data.fragments[i++];assert.deepEqual(fragment.originalBounds,[rect.x+h.domain.origin[0],rect.y+h.domain.origin[1],rect.x+h.domain.origin[0]+rect.width,rect.y+h.domain.origin[1]+rect.height]);
  if(!fragment.evaluable)continue;const data=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++)data.set(h.data.subarray(((rect.y+y+h.domain.origin[1])*width+rect.x+h.domain.origin[0])*3,((rect.y+y+h.domain.origin[1])*width+rect.x+h.domain.origin[0]+rect.width)*3),y*rect.width*3);
  const expected=await prepare({width:rect.width,height:rect.height,data});assert.deepEqual(calls.shift().hashes,signature(expected));assert.equal(fragment.data.window_logits.length,5);
 }assert.equal(result.data.scores,undefined,'No invented global score');assert.equal(result.metrics.selectedPixels,h.domain.countIncluded);assert.equal(h.budget.active,0);}finally{await h.close();}
});

test('poison outside membership cannot affect any prepared B-Free window or model input',async()=>{
 const a=await fixture({exclusions:[[32,24,48,48]]}),b=await fixture({exclusions:[[32,24,48,48]],poison:true}),ca=[],cb=[];try{const x=await run(a,nativeRunner(ca)),y=await run(b,nativeRunner(cb));assert.deepEqual(ca.map(c=>c.hashes),cb.map(c=>c.hashes));assert.deepEqual(x.data.fragments.map(f=>f.data),y.data.fragments.map(f=>f.data));}finally{await a.close();await b.close();}
});

test('equal-size contexts retain the real Original SHA with distinct immutable memo namespaces and no encoded bypass',async()=>{
 const h=await fixture({rectangles:[[1,1,33,33],[60,2,92,34]]});try{const images=[...h.view.admittedRectangles()].map(rect=>createGenerationContextImage({original:h.original,view:h.view,domain:h.domain,rect,budget:h.budget}));assert.equal(images[0].sha256,sha);assert.equal(images[1].sha256,sha);assert.notDeepEqual(images[0].provenance,images[1].provenance);assert.notEqual(images[0].surface.descriptor.id,images[1].surface.descriptor.id);await assert.rejects(images[0].surface.readWindow({x:0,y:0,width:33,height:1}),{code:'INVALID_INPUT'});assert.equal(h.reads.length,0);}finally{await h.close();}
});

test('native B-Free subminimum contexts are explicit without a model call or a fabricated zero',async()=>{
 const h=await fixture({rectangles:[[1,1,14,33]]});try{let calls=0;const result=await run(h,()=>{calls++;throw Error('must not run');});assert.equal(calls,0);assert.equal(result.data.sourceRegionEvaluation,'native-not-evaluable');assert.equal(result.data.fragments[0].data,null);assert.equal(result.metrics.analysedPixels,0);assert.equal(result.metrics.unanalysablePixels,h.domain.countIncluded);assert.equal(nativeGenerationContextAdmission('ai.generation.bfree',{width:14,height:14}).evaluable,true);assert.throws(()=>nativeGenerationContextAdmission('ai.generation.spai',{width:32,height:32}));}finally{await h.close();}
});

test('cancellation during native preprocessing returns every context window and metadata reservation',async()=>{
 const h=await fixture({rectangles:[[1,1,33,33],[60,2,92,34]]}),controller=new AbortController();try{await assert.rejects(run(h,nativeRunner([]),{signal:controller.signal,onProgress:e=>{if(e.completed===1)controller.abort();}}),e=>e.code==='CANCELLED'||e.name==='AbortError');assert.equal(h.budget.active,0);}finally{await h.close();}
});

test('native model errors remain failures and metadata admission refuses before any scientific read',async()=>{
 for(const limit of [1024,64*1024**2]){const h=await fixture({limit});try{let calls=0;await assert.rejects(run(h,async()=>{calls++;return{status:'error',error:{code:'ACTUAL_MODEL_ERROR',message:'controlled failure'}};}),e=>e.code===(limit===1024?'MEMORY_LIMIT':'ACTUAL_MODEL_ERROR'));assert.equal(h.budget.active,0);assert.equal(h.reads.length,0);assert.equal(calls,limit===1024?0:1);}finally{await h.close();}}
});

test('bounded context copies respect the real source-window cap and preserve exact RGB coordinates',async()=>{
 const h=await fixture({rectangles:[[3,5,83,69]]});let strict,part;try{strict=await createSourceRegionView({...h.original.surface,sha256:sha},h.domain.descriptor,{budget:h.budget,maxReadPixels:37});const seen=[],read=strict.readWindow.bind(strict);strict.readWindow=(rect,hooks)=>{seen.push(rect);assert(rect.width*rect.height<=37);return read(rect,hooks);};const rect=[...strict.admittedRectangles()][0],image=createGenerationContextImage({original:h.original,view:strict,domain:h.domain,rect,budget:h.budget});part=await image.surface.readWindow({x:7,y:9,width:53,height:41});for(let y=0;y<41;y++)for(let x=0;x<53;x++)for(let c=0;c<3;c++)assert.equal(part.pixels.data[(y*53+x)*3+c],h.data[((5+9+y)*width+3+7+x)*3+c]);assert(seen.length>1);part.release();part=null;}finally{part?.release();await strict?.dispose();await h.close();}
});

test('generation rejects an unrelated same-source view before reading or classifying',async()=>{
 const a=await fixture({rectangles:[[1,1,33,33]]}),b=await fixture({rectangles:[[60,2,92,34]]});try{await assert.rejects(sourceRegionGeneration({task:{id:'x',operation:'ai.generation.bfree'},original:a.original,view:b.view,domain:a.domain,budget:a.budget,runNative(){throw Error('must not run');}}),{code:'INVALID_INPUT'});assert.equal(a.reads.length,0);assert.equal(b.reads.length,0);}finally{await a.close();await b.close();}
});

test('task parameters and decode provenance are captured without contaminating later contexts or the Original',async()=>{
 const h=await fixture({rectangles:[[1,1,33,33],[60,2,92,34]]}),task={id:'x',imageId:'source',operation:'ai.generation.bfree',params:{displayLabel:'retained'}},calls=[];try{const runner=nativeRunner(calls,async(t,image)=>{assert.equal(t.params.displayLabel,'retained');assert.equal(image.provenance.originalDecode.format,'PNG');t.params.displayLabel='native-private';image.provenance.originalDecode.format='native-private';task.params.displayLabel='caller-changed';});const result=await sourceRegionGeneration({task,original:h.original,view:h.view,domain:h.domain,budget:h.budget,runNative:runner});assert.equal(result.provenance.params.displayLabel,'retained');assert.equal(h.original.provenance.format,'PNG');assert.equal(calls.length,2);}finally{await h.close();}
});

test('independent scopes cannot be silently discarded and malformed native logits never publish',async()=>{
 for(const field of ['excluded','exclusions','regions','scientificScope']){const h=await fixture();try{let calls=0;await assert.rejects(sourceRegionGeneration({task:{id:'x',operation:'ai.generation.bfree',params:{[field]:[{x0:1,y0:1,x1:2,y1:2}]}},original:h.original,view:h.view,domain:h.domain,budget:h.budget,runNative(){calls++;}}),{code:'SOURCE_COORDINATES_UNLOCALIZED'});assert.equal(calls,0);}finally{await h.close();}}
 const h=await fixture();try{await assert.rejects(run(h,async()=>({operation:'ai.generation.bfree',status:'ok',data:{method:'bfree',window_logits:[0,0,NaN,0,0]}})),{code:'INVALID_INPUT'});assert.equal(h.budget.active,0);}finally{await h.close();}
});


test('sampling metadata agrees with the actual native origins and distinct source observations, including short-axis wrap and overlaps',async()=>{
 for(const [width,height]of [[14,14],[32,32],[1000,32],[32,1000],[504,504],[518,532],[1008,1008],[1400,800]]){
  const sampling=nativeGenerationSampling(width,height),native=await prepare({width,height,data:new Uint8Array(width*height*3)}),seen=new Uint8Array(width*height);let count=0;
  assert.deepEqual(sampling.windows.map(w=>w.originEmbeddingGrid),native.patches.map(w=>w.origin_embedding_grid));
  const gh=Math.floor(height/14),gw=Math.floor(width/14);
  for(const patch of native.patches){const [oy,ox]=patch.origin_embedding_grid;for(let y=0;y<504;y++)for(let x=0;x<504;x++){const sy=(oy*14+y)%(gh*14),sx=(ox*14+x)%(gw*14),i=sy*width+sx;if(!seen[i]){seen[i]=1;count++;}}}
  assert.equal(sampling.observedPixels,count,`${width}x${height}: repetitions and overlaps are unique`);
  for(const window of sampling.windows){const [x0,y0,x1,y1]=window.sourceObservationBounds;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)assert.equal(seen[y*width+x],1);}
 }
 assert.equal(nativeGenerationSampling(13,100).observedPixels,0);assert.equal(nativeGenerationSampling(100,13).windows.length,0);
});

test('coverage reports native contributing pixels rather than a fabricated pixel-wise classification of the entire context',async()=>{
 const h=await fixture({rectangles:[[3,5,83,69]]});try{const result=await run(h,nativeRunner([])),fragment=result.data.fragments[0];assert.equal(result.metrics.selectedPixels,80*64);assert.equal(result.metrics.evaluatedContextPixels,80*64);assert.equal(result.metrics.analysedPixels,70*56);assert.equal(result.metrics.nativeObservedPixels,70*56);assert.equal(result.metrics.nativeUnobservedPixels,80*64-70*56);assert.equal(result.metrics.unclassifiedContextPixels,0);assert.equal(result.metrics.unanalysablePixels,0,'Native sampling remainders are not an unevaluable context');assert.equal(fragment.nativeObservedPixels,70*56);assert.equal(fragment.nativeSampling.windows.length,5);assert.deepEqual(fragment.nativeSampling.windows[0].originalObservationBounds,[3,5,73,61]);assert.match(result.semantics,/not pixel-wise localization or exhaustive coverage/);assert.equal(fragment.data.window_logits.length,5);}finally{await h.close();}
});
