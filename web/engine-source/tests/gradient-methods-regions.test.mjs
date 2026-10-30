import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createEngine} from '../src/index.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {OPENCV_OPERATIONS} from '../src/opencv-operations.js';

const references=JSON.parse(await readFile(new URL('../fixtures/gradient-methods-reference.json',import.meta.url)));
const f=references.cases.find(x=>x.name==='masked');
async function fixture({poison=false,nativeRegions=false}={}){
 const engine=createEngine({memoryBudgetBytes:384*1024**2,cpuKernel:'reference'}),data=Uint8Array.from(f.rgb),bytes=Uint8Array.of(8,4,9,2);
 if(poison)for(let i=0;i<f.membership.length;i++)if(!f.membership[i])data.fill(i%2?0:255,i*3,i*3+3);
 const loaded=await engine.load({id:'original',bytes,pixels:{width:f.width,height:f.height,format:'rgb8',data}});
 const state=await createOriginalSourceRegionsState({width:f.width,height:f.height,sourceSha256:loaded.sha256});
 if(nativeRegions){await state.add('acquisition',{x0:0,y0:0,x1:9,y1:f.height});await state.add('acquisition',{x0:13,y0:0,x1:f.width,y1:f.height});}
 else{for(const rect of[{x0:9,y0:0,x1:13,y1:f.height},{x0:3,y0:4,x1:7,y1:12},{x0:0,y0:16,x1:4,y1:f.height}])await state.add('exclusion',rect);}
 const domain=await compileOriginalSourceRegions(state.snapshot());
 return{engine,domain,data,bytes,async run(params,hooks={}){return engine.run({id:'job',imageId:'original',operation:'detail.gradient',params,backend:'cpu',sourceRegionDomain:domain.descriptor},hooks);},async close(){await engine.unload('original');assert.equal(engine.capabilities().memory.retainedBytes,0);assert.equal(engine.capabilities().memory.activeReservationBytes,0);await engine.dispose();}};
}
async function rgb(engine,result){return result.pixels?.data??(await engine.readPixels({surfaceId:result.surface.id,revision:result.surface.revision})).pixels.data;}
function equalAdmitted(a,b,membership){for(let i=0;i<membership.length;i++)if(membership[i])assert.deepEqual(a.subarray(i*3,i*3+3),b.subarray(i*3,i*3+3));}

test('strict multi-zone exclusions match independent Python omitted-neighbour Krawetz reference and retain every centre',async()=>{
 const h=await fixture();try{
  const answer=await h.run({method:'krawetz'}),actual=await rgb(h.engine,answer),mask=(await h.engine.readMask({surfaceId:answer.maskSurfaces.analysis_scope.id,revision:answer.maskSurfaces.analysis_scope.revision})).mask.data;
  assert.equal(answer.provenance.params.method,'krawetz');assert.equal(answer.metrics.gradientMethod,'krawetz');assert.equal(answer.metrics.analysedPixels,f.membership.reduce((a,b)=>a+b,0));assert.equal(answer.metrics.unanalysablePixels,0);assert.deepEqual([...mask],f.membership);
  for(let i=0;i<actual.length;i++)assert(Math.abs(actual[i]-f.output[i])<=1,`channel${i}: ${actual[i]} !=${f.output[i]}`);
  assert.deepEqual(await h.engine.original('original'),h.bytes);assert.equal(h.engine.capabilities().memory.activeReservationBytes,0);
 }finally{await h.close();}
});
test('strict Sobel/Krawetz caches stay separate through A/B/A and excluded poison never affects direction or global histogram',async()=>{
 const a=await fixture(),b=await fixture({poison:true});try{let baseline;
  for(const method of['sobel','krawetz','sobel','krawetz']){
   const params={method,equalize:true},ra=await a.run(params),rb=await b.run(params),pa=await rgb(a.engine,ra),pb=await rgb(b.engine,rb);equalAdmitted(pa,pb,f.membership);
   if(method==='krawetz'){if(baseline)assert.deepEqual(pa,baseline);else baseline=pa;}
   assert.equal(a.engine.capabilities().memory.activeReservationBytes,0);assert.equal(b.engine.capabilities().memory.activeReservationBytes,0);
  }
 }finally{await a.close();await b.close();}
});
test('native acquisition gaps do not become Krawetz observations and all acquired centres are retained',async()=>{
 const h=await fixture({nativeRegions:true});try{const answer=await h.run({method:'krawetz'}),mask=(await h.engine.readMask({surfaceId:answer.maskSurfaces.analysis_scope.id,revision:answer.maskSurfaces.analysis_scope.revision})).mask.data;
  assert.equal(answer.metrics.sourceRegion.shape,'native-regions');assert.equal(answer.metrics.analysedPixels,19*f.height);
  for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++)assert.equal(mask[y*f.width+x],x<9||x>=13?1:0);
 }finally{await h.close();}
});
test('rectangle acquisition uses its native physical border and both methods preserve API source bytes',async()=>{
 const engine=createEngine({memoryBudgetBytes:384*1024**2,cpuKernel:'reference'}),source=references.cases.find(x=>x.name==='texture'),data=Uint8Array.from(source.rgb),bytes=Uint8Array.of(1,3,5,7);
 try{const image=await engine.load({id:'original',bytes,pixels:{width:source.width,height:source.height,format:'rgb8',data}}),state=await createOriginalSourceRegionsState({width:source.width,height:source.height,sourceSha256:image.sha256});await state.add('acquisition',{x0:4,y0:3,x1:25,y1:24});const domain=await compileOriginalSourceRegions(state.snapshot()),crop=new Uint8Array(21*21*3);for(let y=0;y<21;y++)crop.set(data.subarray(((y+3)*source.width+4)*3,((y+3)*source.width+25)*3),y*21*3);
  for(const method of['sobel','krawetz']){const params=OPENCV_OPERATIONS['detail.gradient'].validate({method}),answer=await engine.run({id:'crop',imageId:'original',operation:'detail.gradient',params,backend:'cpu',sourceRegionDomain:domain.descriptor}),expected=await OPENCV_OPERATIONS['detail.gradient'].compute({width:21,height:21,format:'rgb8',data:crop},params,{});assert.deepEqual(await rgb(engine,answer),expected.pixels.data);assert.deepEqual(await engine.original('original'),bytes);}
 }finally{await engine.unload('original');assert.equal(engine.capabilities().memory.retainedBytes,0);assert.equal(engine.capabilities().memory.activeReservationBytes,0);await engine.dispose();}
});
test('isolated Krawetz acquisitions retain every zero-direction centre with neutral RGB',async()=>{
 const engine=createEngine({memoryBudgetBytes:384*1024**2,cpuKernel:'reference'}),data=Uint8Array.from(f.rgb);
 try{const image=await engine.load({id:'original',bytes:Uint8Array.of(1),pixels:{width:f.width,height:f.height,format:'rgb8',data}}),state=await createOriginalSourceRegionsState({width:f.width,height:f.height,sourceSha256:image.sha256});for(const rect of[{x0:5,y0:7,x1:6,y1:8},{x0:9,y0:10,x1:10,y1:11}])await state.add('acquisition',rect);const domain=await compileOriginalSourceRegions(state.snapshot()),answer=await engine.run({id:'isolated',imageId:'original',operation:'detail.gradient',params:{method:'krawetz'},sourceRegionDomain:domain.descriptor,backend:'cpu'}),output=await rgb(engine,answer),mask=(await engine.readMask({surfaceId:answer.maskSurfaces.analysis_scope.id,revision:answer.maskSurfaces.analysis_scope.revision})).mask.data;assert.equal(answer.metrics.analysedPixels,2);assert.equal(mask.reduce((a,b)=>a+b,0),2);for(let i=0;i<mask.length;i++)if(mask[i])assert.deepEqual([...output.subarray(i*3,i*3+3)],[127,127,0]);
 }finally{await engine.unload('original');assert.equal(engine.capabilities().memory.retainedBytes,0);assert.equal(engine.capabilities().memory.activeReservationBytes,0);await engine.dispose();}
});
for(const phase of['source-region-derivatives','source-region-derivative-render','source-region-gradient-tone'])test('Krawetz scoped cancellation preserves published owners during '+phase,async()=>{
 const h=await fixture(),stop=new AbortController(),previousMethod=phase==='source-region-derivatives'?'sobel':'krawetz';try{const before=await h.run({method:previousMethod}),original=await rgb(h.engine,before);await assert.rejects(h.run({method:'krawetz',equalize:true},{signal:stop.signal,onProgress:event=>{if(event.phase===phase)stop.abort();}}),{code:'CANCELLED'});assert.deepEqual(await rgb(h.engine,before),original);assert.equal(h.engine.capabilities().memory.activeReservationBytes,0);const retry=await h.run({method:previousMethod});assert.deepEqual(await rgb(h.engine,retry),original);}finally{await h.close();}
});
