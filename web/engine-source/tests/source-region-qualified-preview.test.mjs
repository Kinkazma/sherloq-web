import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionRuntime} from '../src/source-region-runtime.js';
import {createResultSurfaces} from '../src/segmented-results.js';
const sha='a'.repeat(64);
async function fixture(){
 const budget=new Budget(32*1024**2),state=await createOriginalSourceRegionsState({width:40,height:30,sourceSha256:sha});await state.add('acquisition',{x0:3,y0:2,x1:17,y1:28});await state.add('acquisition',{x0:24,y0:2,x1:37,y1:28});await state.add('exclusion',{x0:7,y0:8,x1:10,y1:12});const domain=await compileOriginalSourceRegions(state.snapshot());let reads=0;
 const image={sha256:sha,provenance:{},surface:{descriptor:{id:'original',width:40,height:30,format:'rgb8',revision:1},async readWindow(){reads++;throw Error('Preview admission cannot read scientific RGB.');}}},images=new Map([['original',image]]),surfaces=new Map(),results=createResultSurfaces(surfaces),runtime=createSourceRegionRuntime({budget,images,surfaces,resultSurfaces:results,getImage:id=>images.get(id),withBusy:f=>f(),runLegacy(){throw Error('No native inference during preview admission.');},knownHeapBytes:()=>0,version:'test',profile:{},cpuKernel:'reference',codec:{}});
 return{budget,domain,images,runtime,reads:()=>reads,async close(){await runtime.clear();await results.clear();assert.equal(budget.total(),0);}};
}
test('only the registered SAFIRE fragment owner admits a multi-zone grouping draft, without reading source RGB',async()=>{
 const f=await fixture();try{const answer=await f.runtime.checkPreview({id:'p',imageId:'original',operation:'ai.sources.safire',params:{},sourceRegionDomain:f.domain.descriptor});assert.equal(answer.domain.fingerprint,f.domain.fingerprint);assert.equal(answer.image.sourceRegionDomain.fingerprint,f.domain.fingerprint);assert.equal(answer.task.sourceRegionDomain,undefined);assert.notEqual(answer.task.imageId,'original');assert.equal(f.reads(),0);assert.equal(f.budget.active,0);}finally{await f.close();}
});
for(const operation of['ai.localization.focal','ai.localization.adaifl','noise.noisesniffer','inspection.adjust'])test(operation+' does not inherit a generic hole-reading proxy permission',async()=>{
 const f=await fixture();try{await assert.rejects(f.runtime.checkPreview({id:'p',imageId:'original',operation,params:{},sourceRegionDomain:f.domain.descriptor}),{code:'SOURCE_SCOPE_PREVIEW_UNSUPPORTED'});assert.equal(f.reads(),0);assert.equal(f.runtime.size,0);assert.equal(f.budget.total(),0);}finally{await f.close();}
});
test('forged scientific preview identity is refused before cache ownership or pixels are borrowed',async()=>{
 const f=await fixture();try{const forged=structuredClone(f.domain.descriptor);forged.snapshot.sourceSha256='b'.repeat(64);await assert.rejects(f.runtime.checkPreview({id:'p',imageId:'original',operation:'ai.sources.safire',params:{},sourceRegionDomain:forged}));assert.equal(f.reads(),0);assert.equal(f.budget.total(),0);}finally{await f.close();}
});
