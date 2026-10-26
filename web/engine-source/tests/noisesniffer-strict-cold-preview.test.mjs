import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {contiguousSurface} from '../src/image-sources.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createNoisesnifferProxySource} from '../src/noisesniffer-proxy-source.js';
import {createStrictColdNoisesnifferPreview} from '../src/noisesniffer-strict-cold-preview.js';
import {segmentedNoisesniffer} from '../src/segmented-noisesniffer.js';
import {createEngine} from '../src/index.js';
import {noisesnifferStreamHeapBytes} from '../src/noisesniffer-stream-math.js';

const params={blockSize:3,cellSize:10,samplesPerBin:100,lowFrequencyFraction:1,lowNoiseFraction:.5,view:'regions'},preview={maxSide:48,maxPixels:10000,maxWorkingBytes:128*1024**2};
async function fixture({whole=false,poison=false,four=false,minihole=false}={}){
 const width=four?160:83,height=four?48:65,budget=new Budget(256*1024**2),data=Uint8Array.from({length:width*height*3},(_,i)=>23+(i*73+Math.floor(i/11)*19)%210),state=await createOriginalSourceRegionsState({width,height,sourceSha256:'a'.repeat(64)});
 if(four){for(let i=0;i<4;i++)await state.add('acquisition',{x0:2+i*40,y0:4,x1:34+i*40,y1:36});}
 else if(!whole){await state.add('acquisition',{x0:4,y0:5,x1:36,y1:50});await state.add('acquisition',{x0:45,y0:12,x1:78,y1:61});await state.add('exclusion',{x0:12,y0:20,x1:minihole?13:15,y1:minihole?21:24});}
 const preliminary=await compileOriginalSourceRegions(state.snapshot());if(poison)for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(!preliminary.containsOriginal(x,y))data.fill((x+y)%2?0:255,(y*width+x)*3,(y*width+x+1)*3);
 const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(v=>v.toString(16).padStart(2,'0')).join(''),snapshot={...structuredClone(state.snapshot()),sourceSha256:sha256};delete snapshot.fingerprint;
 const domain=await compileOriginalSourceRegions(snapshot),original={sha256,surface:contiguousSurface({width,height,format:'rgb8',data},budget)},owner=createStrictColdNoisesnifferPreview({budget});
 return{budget,data,width,height,domain,original,owner,async close(){await owner.dispose();await original.surface.dispose();assert.equal(budget.total(),0);}};
}
test('conservative cells retain a one-pixel hole and native offset without inventing RGB',async()=>{
 const h=await fixture({minihole:true});let source;try{source=await createNoisesnifferProxySource(h.original,h.domain,3,{budget:h.budget});for(let y=0;y<source.domain.height;y++)for(let x=0;x<source.domain.width;x++){let expected=true;for(let dy=0;dy<Math.min(3,h.domain.height-y*3);dy++)for(let dx=0;dx<Math.min(3,h.domain.width-x*3);dx++)expected&&=h.domain.containsOriginal(h.domain.origin[0]+x*3+dx,h.domain.origin[1]+y*3+dy);assert.equal(source.domain.contains(x,y),expected);}await assert.rejects(source.view.readWindow({x:0,y:0,width:source.domain.width,height:source.domain.height}),e=>e.code==='SOURCE_REGION_PARTIAL_WINDOW');}finally{await source?.dispose();await h.close();}
});
test('step1 whole rectangle preserves the true native Noisesniffer raster bit for bit',async()=>{
 const h=await fixture({whole:true});let native;try{native=await segmentedNoisesniffer({surface:h.original.surface},params,{budget:h.budget});const window=await native.surface.readWindow({x:0,y:0,width:h.width,height:h.height});let expected;try{expected=window.pixels.data.slice();}finally{window.release();}const answer=await h.owner.preview({...h,params,preview:{...preview,maxSide:100}});assert.equal(answer.preview.step,1);assert.deepEqual(answer.pixels.data,expected);assert.equal(answer.exact,false);assert.equal(answer.exportable,false);}finally{await native?.surface.dispose();await native?.noisesnifferCache.dispose();await h.close();}
});
for(const blockSize of [3,5,7,8])test('strict cold block'+blockSize+' omits excluded RGB before native kernels and preserves presentation',async()=>{
 const a=await fixture(),b=await fixture({poison:true});try{const x=await a.owner.preview({...a,params:{...params,blockSize},preview}),y=await b.owner.preview({...b,params:{...params,blockSize},preview});assert.equal(x.exact,false);assert.equal(x.metrics.strictSourceRegions,true);assert.deepEqual(x.analysisScope.data,y.analysisScope.data);let admitted=0;for(let i=0;i<x.analysisScope.data.length;i++){const col=i%x.pixels.width,row=Math.floor(i/x.pixels.width),ox=a.domain.origin[0]+col*x.preview.step,oy=a.domain.origin[1]+row*x.preview.step;if(x.analysisScope.data[i]){admitted++;assert.deepEqual(x.pixels.data.subarray(i*3,i*3+3),y.pixels.data.subarray(i*3,i*3+3));}else{assert.deepEqual(x.pixels.data.subarray(i*3,i*3+3),a.data.subarray((oy*a.width+ox)*3,(oy*a.width+ox+1)*3));assert.deepEqual(y.pixels.data.subarray(i*3,i*3+3),b.data.subarray((oy*b.width+ox)*3,(oy*b.width+ox+1)*3));}}assert(admitted>0);assert.equal(a.budget.active,0);assert.equal(b.budget.active,0);}finally{await a.close();await b.close();}
});
test('basis changes reuse statistics while block A/B/A retains the separate proxy owner',async()=>{
 const h=await fixture();try{const first=await h.owner.preview({...h,params,preview});const next=await h.owner.preview({...h,params:{...params,samplesPerBin:200,lowFrequencyFraction:.7},preview});assert.equal(next.metrics.proxyStatisticsCached,true);assert.equal(next.metrics.proxySelectionBasisCached,false);await h.owner.preview({...h,params:{...params,blockSize:5},preview});const back=await h.owner.preview({...h,params,preview});assert.equal(back.metrics.proxyStatisticsCached,true);assert.deepEqual(back.pixels.data,first.pixels.data);assert.equal(h.owner.cacheEntries,2);}finally{await h.close();}
});
test('block8 keeps four real FFT contexts and labels the global proxy NFA approximation',async()=>{
 const h=await fixture({four:true});try{const a=await h.owner.preview({...h,params:{...params,blockSize:8},preview:{...preview,maxSide:160}});assert.equal(a.metrics.proxyStatistics.observedFftContextJobs,4);assert.equal(a.metrics.proxyStatistics.supportedBlocks,4*(32-7)*(32-7));assert.equal(a.preview.statisticalMeaning,'approximate-global-population-and-NFA-on-conservative-provisional-lattice');}finally{await h.close();}
});
test('aborting a successful old signal cannot poison the cache and final progress abort cannot publish',async()=>{
 const h=await fixture(),first=new AbortController();try{await h.owner.preview({...h,params,preview,signal:first.signal});first.abort();await h.owner.preview({...h,params,preview,signal:new AbortController().signal});const controller=new AbortController();await assert.rejects(h.owner.preview({...h,params,preview,signal:controller.signal,onProgress:event=>{if(event.phase==='noisesniffer-strict-cold-proxy')controller.abort();}}),e=>e.code==='CANCELLED');assert.equal(h.owner.cacheEntries,0);assert.equal(h.budget.active,0);}finally{await h.close();}
});
test('a refused source ACK never publishes a sample and is retained for concurrent retirement retry',async()=>{
 const h=await fixture();let source,refuse=true,calls=0;const inner=h.original.surface;h.original.surface={...inner,async readWindow(...args){const part=await inner.readWindow(...args);return{...part,async release(){calls++;if(refuse)throw Object.freeze(new Error('ACK refused'));part.release();}};}};
 try{source=await createNoisesnifferProxySource(h.original,h.domain,2,{budget:h.budget});await assert.rejects(source.view.readWindow({x:0,y:0,width:1,height:1}));await assert.rejects(source.dispose());assert(h.budget.total()>0);refuse=false;const a=source.dispose(),b=source.dispose();assert.equal(a,b);await a;assert.equal(calls,3);}finally{refuse=false;await source?.dispose();await h.close();}
});
test('source revision changes and insufficient admission refuse before a source RGB read',async()=>{
 const h=await fixture();let source,reads=0;const inner=h.original.surface;h.original.surface={...inner,descriptor:{...inner.descriptor},readWindow(...args){reads++;return inner.readWindow(...args);}};
 try{source=await createNoisesnifferProxySource(h.original,h.domain,2,{budget:h.budget});h.original.surface.descriptor.revision++;await assert.rejects(source.view.readWindow({x:0,y:0,width:1,height:1}),e=>e.code==='SOURCE_CHANGED');assert.equal(reads,0);const tinyBudget=new Budget(1024),tiny=createStrictColdNoisesnifferPreview({budget:tinyBudget});await assert.rejects(tiny.preview({...h,params,preview}),e=>e.code==='MEMORY_LIMIT');await tiny.dispose();assert.equal(tinyBudget.total(),0);assert.equal(reads,0);}finally{await source?.dispose();await h.close();}
});
test('strict lattice reads only native admitted intervals and returns their literal sampled RGB',async()=>{
 const h=await fixture({minihole:true}),inner=h.original.surface;let source,reads=0;
 h.original.surface={...inner,async readWindow(rect,hooks){reads++;for(let y=rect.y;y<rect.y+rect.height;y++)for(let x=rect.x;x<rect.x+rect.width;x++)assert(h.domain.containsOriginal(x,y),'Scientific reader crossed excluded native RGB');return inner.readWindow(rect,hooks);}};
 try{source=await createNoisesnifferProxySource(h.original,h.domain,3,{budget:h.budget});let cells=0;await source.view.visitIncluded((pixels,{rect})=>{for(let x=0;x<rect.width;x++){const ox=h.domain.origin[0]+(rect.x+x)*3,oy=h.domain.origin[1]+rect.y*3;assert.deepEqual(pixels.data.subarray(x*3,x*3+3),h.data.subarray((oy*h.width+ox)*3,(oy*h.width+ox+1)*3));cells++;}});assert.equal(cells,source.domain.countIncluded);assert(reads>0);}finally{await source?.dispose();await h.close();}
});
test('source retirement waits for a late native read before acknowledging and retiring metadata',async()=>{
 const h=await fixture(),inner=h.original.surface;let source,enter,open;const entered=new Promise(r=>enter=r),gate=new Promise(r=>open=r);
 h.original.surface={...inner,async readWindow(...args){enter();await gate;return inner.readWindow(...args);}};
 try{source=await createNoisesnifferProxySource(h.original,h.domain,2,{budget:h.budget});const reading=source.view.readWindow({x:0,y:0,width:1,height:1});await entered;let retired=false;const retiring=source.dispose().then(()=>retired=true);await Promise.resolve();assert.equal(retired,false);assert(h.budget.total()>0);open();await assert.rejects(reading,e=>e.code==='DISPOSED');await retiring;assert.equal(retired,true);assert.equal(h.budget.active,0);}finally{open();await source?.dispose();await h.close();}
});
test('closing the factory cancels its active native proxy and waits for complete cleanup',async()=>{
 const h=await fixture();let enter,open;const entered=new Promise(r=>enter=r),gate=new Promise(r=>open=r),inner=h.original.surface;
 h.original.surface={...inner,async readWindow(...args){enter();await gate;return inner.readWindow(...args);}};
 try{const calculation=h.owner.preview({...h,params,preview});await entered;let retired=false;const retiring=h.owner.dispose().then(()=>retired=true);await Promise.resolve();assert.equal(retired,false);open();await assert.rejects(calculation,e=>e.code==='CANCELLED');await retiring;assert.equal(h.owner.cacheEntries,0);assert.equal(h.budget.active,0);}finally{open();await h.close();}
});
test('three cold controls never mutate a real Core published native final',async()=>{
 const h=await fixture(),engine=createEngine({memoryBudgetBytes:256*1024**2,cpuKernel:'reference'});
 try{const source=await engine.load({id:'original',bytes:h.data.slice(),pixels:{width:h.width,height:h.height,format:'rgb8',data:h.data}});assert.equal(source.sha256,h.original.sha256);const result=await engine.run({id:'native',imageId:'original',operation:'noise.noisesniffer',params,backend:'cpu',sourceRegionDomain:h.domain.descriptor}),request={surfaceId:result.surface.id,revision:result.surface.revision},before=(await engine.readPixels(request)).pixels.data.slice();for(const change of[{blockSize:5},{samplesPerBin:200},{lowFrequencyFraction:.7}]){const answer=await h.owner.preview({...h,params:{...params,...change},preview});assert.equal(answer.metrics.scientificFinalChanged,false);assert.deepEqual((await engine.readPixels(request)).pixels.data,before);}await engine.unload('original');assert.equal(engine.capabilities().memory.retainedBytes,0);assert.equal(engine.capabilities().memory.activeReservationBytes,0);}finally{await engine.dispose();await h.close();}
});
test('an already protected native singleton is accounted separately from retained proxy stores',async()=>{
 const h=await fixture();let held;try{await h.owner.preview({...h,params,preview});const bytes=noisesnifferStreamHeapBytes();assert(bytes>0);held=h.budget.reserve(bytes);const answer=await h.owner.preview({...h,params:{...params,lowFrequencyFraction:.7},preview,accountedHeapBytes:bytes});assert.equal(answer.metrics.proxyStatisticsCached,true);assert.equal(h.budget.active,bytes);held();held=null;assert.equal(h.budget.active,0);}finally{held?.();await h.close();}
});
test('a replacement Original owner cannot reuse a prior cache even with identical transported identifiers',async()=>{
 const h=await fixture();try{await h.owner.preview({...h,params,preview});const replacement={...h.original};const a=await h.owner.preview({...h,original:replacement,params,preview});assert.equal(a.metrics.proxyStatisticsCached,false);const b=await h.owner.preview({...h,original:replacement,params,preview});assert.equal(b.metrics.proxyStatisticsCached,true);}finally{await h.close();}
});
test('a malformed short Original row cannot silently become zero-filled scientific RGB',async()=>{
 const h=await fixture(),inner=h.original.surface;let source,released=0;h.original.surface={...inner,async readWindow(...args){const part=await inner.readWindow(...args);return{...part,pixels:{...part.pixels,data:part.pixels.data.subarray(0,1)},release(){released++;part.release();}};}};
 try{source=await createNoisesnifferProxySource(h.original,h.domain,2,{budget:h.budget});await assert.rejects(source.view.readWindow({x:0,y:0,width:1,height:1}),e=>e.code==='INVALID_INPUT');assert.equal(released,1);assert.equal(h.budget.active,0);}finally{await source?.dispose();await h.close();}
});
