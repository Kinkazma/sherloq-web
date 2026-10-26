import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {sourceRegionPca} from '../src/source-region-general-pca.js';
import {createResultSurfaces} from '../src/segmented-results.js';
import {cvPcaModel,cvPcaView} from '../src/opencv.js';
import {createEngine} from '../src/index.js';
const sha='d'.repeat(64),width=17,height=13;
async function fixture({budget=new Budget(96*1024**2),alternate=false,poison=false}={}){
 const state=await createOriginalSourceRegionsState({width,height,sourceSha256:sha});
 for(const r of alternate?[{x0:2,y0:1,x1:9,y1:10},{x0:12,y0:4,x1:17,y1:13}]:[{x0:1,y0:1,x1:7,y1:12},{x0:10,y0:2,x1:17,y1:12}])await state.add('acquisition',r);
 await state.add('exclusion',{x0:3,y0:4,x1:5,y1:6});const domain=await compileOriginalSourceRegions(state.snapshot()),rgb=Uint8Array.from({length:width*height*3},(_,i)=>(i*73+Math.floor(i/7)*19)%256);if(poison)for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(!domain.containsOriginal(x,y))rgb.fill((x+y)%2?0:255,(y*width+x)*3,(y*width+x+1)*3);
 let held=0,scientificReads=0;const read=async(rect,strict)=>{if(strict){scientificReads++;for(let y=rect.y;y<rect.y+rect.height;y++)for(let x=rect.x;x<rect.x+rect.width;x++)assert(domain.containsOriginal(x,y),'Excluded sample entered PCA');}const release=budget.reserve(rect.width*rect.height*3),data=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++)data.set(rgb.subarray(((rect.y+y)*width+rect.x)*3,((rect.y+y)*width+rect.x+rect.width)*3),y*rect.width*3);held++;return{pixels:{width:rect.width,height:rect.height,format:'rgb8',data},release(){held--;release();}};},original={sha256:sha,surface:{readWindow:r=>read(r,false)}},view=await createSourceRegionView({width,height,sha256:sha,readWindow:r=>read(r,true)},domain.descriptor,{budget}),registry=createResultSurfaces(new Map());let record;
 const compact=new Uint8Array(domain.countIncluded*3);let index=0;for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(domain.containsOriginal(x,y)){compact.set(rgb.subarray((y*width+x)*3,(y*width+x+1)*3),index*3);index++;}
 return{budget,domain,original,view,rgb,compact,counts:()=>({held,scientificReads}),record:()=>record,publishResult(id,value){record=value;return registry.publishBundle(id,value);},releaseResults:()=>registry.clear(),async clear(){await registry.clear();view.dispose();}};
}
const task=params=>({id:'pca-test',imageId:'native-domain',operation:'colors.pca',params});
async function pixels(f){const lease=await f.record().surface.readWindow(),mask=await f.record().maskRecords.analysis_scope.surface.readWindow();try{return{rgb:lease.pixels.data.slice(),mask:mask.pixels.data.slice()};}finally{lease.release();mask.release();}}
test('membership PCA preserves the native compact-observation basis and every component/view/normalization before scattering to source coordinates',async()=>{
 const f=await fixture(),image={width:f.domain.countIncluded,height:1,format:'rgb8',data:f.compact},basis=await cvPcaModel(image);let first=true;
 try{for(const component of [0,1,2])for(const [modeIndex,mode]of ['distance','project','crossprod'].entries())for(const [invert,equalize]of [[false,false],[true,true]]){
  const answer=await sourceRegionPca({...f,task:task({component,mode,invert,equalize})}),expected=await cvPcaView(image,basis,[component,modeIndex,+invert,+equalize]),actual=await pixels(f);assert.deepEqual(answer.data.mean,basis.slice(0,3));assert.deepEqual(answer.data.eigenvectors,basis.slice(3,12));assert.deepEqual(answer.data.eigenvalues,basis.slice(12,15));assert.equal(answer.metrics.basisCached,!first);first=false;let at=0;
  for(let y=0;y<f.domain.height;y++)for(let x=0;x<f.domain.width;x++){const ox=x+f.domain.origin[0],oy=y+f.domain.origin[1],i=y*f.domain.width+x,included=f.domain.contains(x,y);assert.equal(actual.mask[i],Number(included));assert.deepEqual(actual.rgb.slice(i*3,i*3+3),included?expected.data.slice(at++*3,at*3):f.rgb.slice((oy*width+ox)*3,(oy*width+ox+1)*3));}assert.equal(at,f.domain.countIncluded);await f.releaseResults();
 }}finally{await f.clear();f.budget.clear();}assert.equal(f.counts().held,0);assert(f.counts().scientificReads>0);assert.equal(f.budget.total(),0);
});
test('arbitrary changes to every excluded RGB sample cannot alter the admitted PCA statistics or rendered values',async()=>{
 const original=await fixture(),changed=await fixture({poison:true});try{const a=await sourceRegionPca({...original,task:task({mode:'crossprod',equalize:true})}),b=await sourceRegionPca({...changed,task:task({mode:'crossprod',equalize:true})}),pa=await pixels(original),pb=await pixels(changed);assert.deepEqual(a.data,b.data);assert.deepEqual(pa.mask,pb.mask);for(let i=0;i<pa.mask.length;i++)if(pa.mask[i])assert.deepEqual(pa.rgb.slice(i*3,i*3+3),pb.rgb.slice(i*3,i*3+3));}finally{for(const f of[original,changed]){await f.clear();f.budget.clear();assert.equal(f.budget.total(),0);}}
});
test('a changed native domain cannot reuse another domain PCA basis even if an internal caller repeats its image ID',async()=>{
 const budget=new Budget(96*1024**2),a=await fixture({budget}),b=await fixture({budget,alternate:true});try{await sourceRegionPca({...a,task:task({})});await a.clear();const answer=await sourceRegionPca({...b,task:task({})}),expected=await cvPcaModel({width:b.domain.countIncluded,height:1,format:'rgb8',data:b.compact});assert.equal(answer.metrics.basisCached,false);assert.deepEqual(answer.data.mean,expected.slice(0,3));assert.deepEqual(answer.data.eigenvectors,expected.slice(3,12));}finally{await a.clear();await b.clear();budget.clear();}assert.equal(budget.total(),0);
});
for(const phase of ['source-region-pca-observations','mean','projection','source-region-pca-scatter'])test('PCA cancellation during '+phase+' releases unpublished output and borrowed native windows',async()=>{
 const f=await fixture(),controller=new AbortController();try{await assert.rejects(sourceRegionPca({...f,task:task({}),signal:controller.signal,onProgress:event=>{if(event.phase===phase)controller.abort();}}),{code:'CANCELLED'});assert.equal(f.record(),undefined);assert.equal(f.counts().held,0);assert.equal(f.budget.retained,0);assert.equal(f.budget.active,0);}finally{await f.clear();f.budget.clear();}assert.equal(f.budget.total(),0);
});

test('PCA publication failure retires both unpublished output owners and preserves the original error',async()=>{
 const f=await fixture();let captured;try{await assert.rejects(sourceRegionPca({...f,task:task({}),publishResult(_id,record){captured=record;throw Object.assign(new Error('publication refused'),{code:'PUBLICATION_REFUSED'});}}),{message:'publication refused'});assert(captured);assert.equal(f.counts().held,0);assert.equal(f.budget.retained,0);assert.equal(f.budget.active,0);}finally{await f.clear();f.budget.clear();}assert.equal(f.budget.total(),0);
});

test('engine dispatch publishes scoped PCA, keeps the encoded original and retires scoped owners after unload',async()=>{
 const engine=createEngine({memoryBudgetBytes:128*1024**2,cpuKernel:'reference'}),rgb=Uint8Array.from({length:width*height*3},(_,i)=>(i*73+Math.floor(i/7)*19)%256),bytes=Uint8Array.of(1,2,3,4,5);
 try{const loaded=await engine.load({id:'original',bytes,pixels:{width,height,format:'rgb8',data:rgb}}),state=await createOriginalSourceRegionsState({width,height,sourceSha256:loaded.sha256});for(const rect of[{x0:1,y0:1,x1:7,y1:12},{x0:10,y0:2,x1:17,y1:12}])await state.add('acquisition',rect);await state.add('exclusion',{x0:3,y0:4,x1:5,y1:6});const domain=await compileOriginalSourceRegions(state.snapshot()),run=async id=>engine.run({id,imageId:'original',operation:'colors.pca',params:{component:1,mode:'project',equalize:true},backend:'cpu',sourceRegionDomain:domain.descriptor}),answer=await run('first');assert.equal(answer.imageId,'original');assert.equal(answer.metrics.sourceRegion.shape,'membership');assert.equal(answer.metrics.observations,domain.countIncluded);assert.equal(answer.sourceRegionDomain.fingerprint,domain.fingerprint);assert.deepEqual(await engine.original('original'),bytes);assert.equal(answer.surface.width,domain.width);assert.equal(answer.maskSurfaces.analysis_scope.width,domain.width);const read=await engine.readPixels({surfaceId:answer.surface.id,revision:answer.surface.revision,rect:{x:0,y:0,width:domain.width,height:domain.height}});assert.equal(read.pixels.data.length,domain.width*domain.height*3);assert.equal(engine.capabilities().memory.activeReservationBytes,0);const reused=await run('second');assert.equal(reused.metrics.basisCached,true);assert.equal(reused.metrics.sourceRegion.cacheIdentity,answer.metrics.sourceRegion.cacheIdentity);assert.deepEqual(await engine.original('original'),bytes);
 }finally{await engine.unload('original');assert.equal(engine.capabilities().memory.retainedBytes,0);assert.equal(engine.capabilities().memory.activeReservationBytes,0);await engine.dispose();}
});
