import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {loadCatnetScopedOriginal} from '../src/catnet-scoped-blob-input.js';
test('nonJPEG signed input retains unchanged Original owner but exposes no Original RGB scientific tensor view',async()=>{
 const sha='a'.repeat(64),budget=new Budget(4*1024**2),blob=new Blob([Uint8Array.of(137,80,78,71)]),state=await createOriginalSourceRegionsState({sourceSha256:sha,width:8,height:16}),domain=await compileOriginalSourceRegions(state.snapshot());let decodes=0,retired=0;
 const image={kind:'image',segmented:true,sha256:sha,source:{},store:{},provenance:{format:'png'},surface:{descriptor:{width:8,height:16,sourceWidth:16,sourceHeight:8,orientation:6},readWindow(){throw Error('Companion input must not expose Original RGB as a scientific tensor');}}};
 const input={purpose:'analysis-native-companion-contexts',analysisContext:'native-catnet-global-q100-444-contexts-only',expectedSourceSha256:sha,sourceRegionDomain:domain.descriptor};let loaded;
 try{loaded=await loadCatnetScopedOriginal(blob,input,{budget,imageLoader:async b=>{assert.equal(b,blob);decodes++;return image;},imageDisposer:async i=>{assert.equal(i,image);retired++;}});assert.equal(loaded.encodedSource,blob);assert.equal(loaded.image,image);assert.equal(loaded.view,null);assert.deepEqual(loaded.geometry,{sourceWidth:8,sourceHeight:16,orientation:1});assert.equal(loaded.plan.evaluatedPixels,128);assert.equal(decodes,1);}finally{await loaded?.release();await loaded?.release();assert.equal(retired,1);assert.equal(budget.total(),0);}
});
