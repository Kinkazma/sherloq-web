import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {contiguousSurface} from '../src/image-sources.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {sourceRegionNoisesnifferStatistics} from '../src/source-region-noisesniffer-statistics.js';

test('strict statistics preserve every falsy primary when the source retirement also refuses',async()=>{
 for(const primary of [0,null,undefined,false,'']){
  const width=17,height=13,budget=new Budget(96*1024**2),sha256='d'.repeat(64),state=await createOriginalSourceRegionsState({width,height,sourceSha256:sha256}),domain=await compileOriginalSourceRegions(state.snapshot()),surface=contiguousSurface({width,height,format:'rgb8',data:Uint8Array.from({length:width*height*3},(_,i)=>i*73)},budget),original={sha256,surface},view=await createSourceRegionView({...surface,sha256},domain.descriptor,{budget}),ack=Object.freeze(new Error('refused native ACK')),base=view.readWindow.bind(view);let attempted=0;
  const wrapped={...view,async readWindow(...args){const frame=await base(...args);return{...frame,release(){attempted++;const p=Promise.reject(ack);void p.catch(()=>{});return p;}};}};
  try{await assert.rejects(sourceRegionNoisesnifferStatistics(original,wrapped,domain,3,{budget,onProgress(){throw primary;}}),error=>Object.is(error,primary));assert.equal(attempted,1);}finally{await view.dispose();await surface.dispose();assert.equal(budget.total(),0);}
 }
});
