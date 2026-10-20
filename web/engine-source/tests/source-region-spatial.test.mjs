import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {sourceRegionPointwise} from '../src/source-region-spatial.js';
import {pixelStats} from '../src/pixel-stats.js';
async function setup(){
 const width=9,height=7,sha256='d'.repeat(64),state=await createOriginalSourceRegionsState({width,height,sourceSha256:sha256});await state.add('acquisition',{x0:1,y0:1,x1:8,y1:7});await state.add('exclusion',{x0:3,y0:2,x1:6,y1:5});const domain=await compileOriginalSourceRegions(state.snapshot()),budget=new Budget(64*1024**2);let held=0,scientificReads=0,displayReads=0;
 const rgb=(x,y)=>[x*21+5,y*24+3,(x+y)*13+1],read=async(rect,strict)=>{if(strict){scientificReads++;for(let y=rect.y;y<rect.y+rect.height;y++)for(let x=rect.x;x<rect.x+rect.width;x++)assert(domain.containsOriginal(x,y));}else displayReads++;const data=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++)data.set(rgb(rect.x+x,rect.y+y),(y*rect.width+x)*3);held++;return{pixels:{width:rect.width,height:rect.height,format:'rgb8',data},release(){held--;}};};
 const original={sha256,surface:{readWindow:r=>read(r,false)}},view=await createSourceRegionView({width,height,sha256,readWindow:r=>read(r,true)},domain.descriptor,{budget});let published;
 return{domain,budget,original,view,rgb,counts:()=>({held,scientificReads,displayReads}),publishResult(id,record){published=record;return{surface:record.surface.descriptor};},record:()=>published};
}
test('pointwise native computation receives only admitted pixels and preserves exclusions solely for display',async()=>{
 const s=await setup(),task={id:'stats',imageId:'domain-id',operation:'colors.stats',params:{mode:'max',inclusive:false}};
 const answer=await sourceRegionPointwise({...s,task}),record=s.record();assert.equal(answer.status,'ok');assert.equal(answer.metrics.includedPixels,s.domain.countIncluded);assert.equal(answer.provenance.excludedParticipation,'omitted');const output=await record.surface.readWindow({x:0,y:0,width:s.domain.width,height:s.domain.height});
 try{for(let y=0;y<s.domain.height;y++)for(let x=0;x<s.domain.width;x++){const [ox,oy]=s.domain.toOriginal([x,y]),rgb=s.rgb(ox,oy),expected=s.domain.contains(x,y)?(await pixelStats({width:1,height:1,format:'rgb8',data:new Uint8Array(rgb)},task.params)).pixels.data:rgb;assert.deepEqual([...output.pixels.data.subarray((y*s.domain.width+x)*3,(y*s.domain.width+x+1)*3)],[...expected]);}}finally{output.release();await record.surface.dispose();s.view.dispose();}
 assert(s.counts().scientificReads>0);assert(s.counts().displayReads>0);assert.equal(s.counts().held,0);assert.equal(s.budget.snapshot().retainedBytes,0);assert.equal(s.budget.snapshot().activeReservationBytes,0);
});
test('unqualified global statistics parameters are refused before a native read or result allocation',async()=>{
 const s=await setup();await assert.rejects(sourceRegionPointwise({...s,task:{id:'adjust',imageId:'domain',operation:'inspection.adjust',params:{equalize:1}}}),e=>e.code==='SOURCE_SCOPE_UNSUPPORTED');assert.deepEqual(s.counts(),{held:0,scientificReads:0,displayReads:0});assert.equal(s.budget.snapshot().retainedBytes,0);s.view.dispose();
});
test('cancellation during the display copy releases the partial native result',async()=>{
 const s=await setup(),abort=new AbortController(),read=s.original.surface.readWindow;s.original.surface.readWindow=async rect=>{const value=await read(rect);abort.abort();return value;};await assert.rejects(sourceRegionPointwise({...s,signal:abort.signal,task:{id:'cancel',imageId:'domain',operation:'colors.stats',params:{}}}),e=>e.code==='CANCELLED');assert.equal(s.counts().held,0);assert.equal(s.record(),undefined);assert.equal(s.budget.snapshot().retainedBytes,0);assert.equal(s.budget.snapshot().activeReservationBytes,0);s.view.dispose();
});
