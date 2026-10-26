import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {planElaMembership,sourceRegionJpegPlan} from '../src/source-region-ela.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
for(const shape of ['whole','tiny-hole','disjoint'])test('strict JPEG contexts retain every admitted native boundary observation: '+shape,async()=>{
 const width=64,height=64,sha='e'.repeat(64),budget=new Budget(32*1024**2),state=await createOriginalSourceRegionsState({sourceSha256:sha,width,height});
 if(shape==='tiny-hole')await state.add('exclusion',{x0:31,y0:31,x1:33,y1:33});
 if(shape==='disjoint'){await state.add('acquisition',{x0:0,y0:0,x1:20,y1:64});await state.add('acquisition',{x0:44,y0:0,x1:64,y1:64});}
 const domain=await compileOriginalSourceRegions(state.snapshot()),view=await createSourceRegionView({width,height,sha256:sha,readWindow(){throw Error('Planning must not inspect RGB');}},domain.descriptor,{budget});let plan;
 try{plan=await planElaMembership(view,domain,{budget});assert.equal(plan.analysedPixels,domain.countIncluded,'Selected native boundary pixels were erased by a codec halo instead of using their own native fragment context');let pixels=0;for(const r of plan.regions()){assert.ok(view.includesRectangle({...r,x:r.x-domain.origin[0],y:r.y-domain.origin[1]}));pixels+=r.width*r.height;}assert.equal(pixels,domain.countIncluded);}finally{plan?.dispose();view.dispose();}assert.equal(budget.total(),0);
});

test('idle native JPEG quality retirement makes actual RAM credit available during the same admission',async()=>{
 const budget=new Budget(32*1024**2),derived={},domain={width:1,height:1,countIncluded:1,fingerprint:'test-domain',origin:[0,0],contains:()=>true},view={*admittedRectangles(){yield{x:0,y:0,width:1,height:1};}};
 await sourceRegionJpegPlan({derived,view,domain,budget});const metadata=budget.total(),store=await createSegmentedBytes(1024,{budget,storage:'memory'});await store.write(new Uint8Array(1024));store.markCold();derived.rgbRecompression.entries.set(90,{store});budget.setLimit(metadata+512);
 try{const release=budget.reserve(512);release();assert.equal(derived.rgbRecompression.entries.size,0);assert.equal(budget.total(),metadata);}finally{await derived.rgbRecompression.dispose();}assert.equal(budget.total(),0);
});
