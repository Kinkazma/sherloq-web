import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {contiguousSurface} from '../src/image-sources.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {createSourceRegionRecord} from '../src/source-region-record.js';
import {sourceRegionNoisesnifferStatistics} from '../src/source-region-noisesniffer-statistics.js';
import {segmentedNoisesnifferSelection} from '../src/segmented-noisesniffer-selection.js';
import {pagedNoisesnifferSelection} from '../src/noisesniffer-paged-selection.js';
import {noisesnifferScientificPatches} from '../src/noisesniffer-scientific-patches.js';
import {createIndexedDbSession} from '../src/indexeddb-storage.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {createStrictColdNoisesnifferPreview} from '../src/noisesniffer-strict-cold-preview.js';
import {noisesnifferStreamHeapBytes} from '../src/noisesniffer-stream-math.js';
import {sourceRegionNoisesniffer} from '../src/source-region-general-noisesniffer.js';
import {segmentedNoisesniffer} from '../src/segmented-noisesniffer.js';
import {createResultSurfaces} from '../src/segmented-results.js';

async function fixture(w,paged){
 const width=55,height=41,budget=new Budget(192*1024**2),heap=budget.reserve(12*1024**2),sha256='c'.repeat(64),pixels={width,height,format:'rgb8',data:Uint8Array.from({length:width*height*3},(_,i)=>80+(i*73+Math.floor(i/11)*19)%80)},state=await createOriginalSourceRegionsState({width,height,sourceSha256:sha256});
 await state.add('acquisition',{x0:3,y0:4,x1:23,y1:38});await state.add('acquisition',{x0:30,y0:7,x1:52,y1:36});await state.add('exclusion',{x0:8,y0:14,x1:10,y1:17});pixels.data.set([10,10,10],(4*width+3)*3);pixels.data.set([240,240,240],(35*width+51)*3);const domain=await compileOriginalSourceRegions(state.snapshot()),inner=contiguousSurface(pixels,budget);let scientific=false,reads=0;
 const check=rect=>{if(scientific){for(let y=rect.y;y<rect.y+rect.height;y++)for(let x=rect.x;x<rect.x+rect.width;x++)assert(domain.containsOriginal(x,y),'A scientific Native read requested excluded RGB');reads++;}};const surface={...inner,async readWindow(rect,hooks){check(rect);return inner.readWindow(rect,hooks);},async readWindowInto(rect,target,hooks){check(rect);return inner.readWindowInto(rect,target,hooks);}},original={sha256,surface},view=await createSourceRegionView({...surface,sha256},domain.descriptor,{budget}),derived=createSourceRegionRecord(original,domain,{budget}),stats=await sourceRegionNoisesnifferStatistics(original,view,domain,w,{budget});
 assert(stats.validCount>0,'Fixture needs actual valid native candidates');const session=paged&&globalThis.indexedDB?await createIndexedDbSession({budget}):null;
 return{budget,domain,view,derived,stats,session,original,get reads(){return reads;},set scientific(v){scientific=v;},async close(){await stats.dispose();await derived.surface.dispose();await view.dispose();await surface.dispose();await session?.dispose();heap();assert.equal(budget.total(),0);}};
}
async function collect(result,records){const selected=new Uint8Array(result.selectedCount*4),low=new Uint8Array(result.lowCount*4),flags=new Uint8Array(result.flags.byteLength);await result.selected.readInto(selected);await result.low_noise.readInto(low);await result.flags.readInto(flags);return{selected,low,flags,selectedCount:result.selectedCount,lowCount:result.lowCount,gridWidth:result.gridWidth,gridHeight:result.gridHeight,all:result.all_blocks.slice(),lowCounts:result.low_noise_blocks.slice(),records};}
for(const w of [3,5,7,8])for(const paged of [false,true])test('strict '+(paged?'paged':'in-memory')+' block'+w+' preserves exact native IDs, bins, std order and counts without forbidden RGB reads',async()=>{
 const h=await fixture(w,paged),p={blockSize:w,samplesPerBin:100,lowFrequencyFraction:.7,lowNoiseFraction:.5,cellSize:10};let baseline,candidate;
 const execute=paged?pagedNoisesnifferSelection:segmentedNoisesnifferSelection,recordsA=[],recordsB=[],recorder=records=>({record(index,ids,flat){records.push({index,ids:ids.slice(),flat});}}),image={...h.derived,...(h.session?{session:h.session}:{})},options={budget:h.budget,storage:h.session?'temporary':'memory'};
 try{baseline=await execute(image,p,h.stats,{...options,basisRecorder:recorder(recordsA)});const expected=await collect(baseline,recordsA);await baseline.dispose();baseline=null;h.scientific=true;candidate=await execute({...image,readScientificPatch:(rect,hooks)=>h.view.readWindow(rect,hooks)},p,h.stats,{...options,basisRecorder:recorder(recordsB)});h.scientific=false;const actual=await collect(candidate,recordsB);assert.deepEqual(actual,expected);assert(h.reads>0);assert(actual.selectedCount>0);await candidate.dispose();candidate=null;if(h.session){assert.equal(h.session.backend,'indexeddb');assert.equal(h.session.snapshot().arrays,0);}}finally{h.scientific=false;await candidate?.dispose();await baseline?.dispose();await h.close();}
});
test('scientific std output waits for a refused real RAM/IndexedDB source frame ACK and preserves retry',async()=>{
 for(const temporary of (globalThis.indexedDB?[false,true]:[false])){
  const budget=new Budget(8*1024**2),session=temporary?await createIndexedDbSession({budget,pageBytes:128,readCache:false}):null,store=await createSegmentedBytes(27,{budget,storage:temporary?'temporary':'memory',temporarySession:session});await store.write(Uint8Array.from({length:27},(_,i)=>i));await store.flush();const surface=createRgbSurface(store,{width:3,height:3,budget});
  const failure=Object.freeze(new Error('Source ACK refused'));let unblock,refuse=true,calls=0,published=false;const gate=new Promise(r=>unblock=r),patches=noisesnifferScientificPatches({async readScientificPatch(rect){const frame=await surface.readWindow(rect);return{...frame,async release(){calls++;await gate;if(refuse)throw failure;frame.release();}};}},3);
  try{const answer=patches.std(Uint32Array.of(0),1,0).then(value=>{published=true;return value;});await Promise.resolve();await Promise.resolve();assert.equal(published,false);unblock();await assert.rejects(answer,e=>e===failure);assert.equal(budget.active,27);await assert.rejects(patches.dispose(),e=>e===failure);refuse=false;const a=patches.dispose(),b=patches.dispose();assert.equal(a,b);await a;assert.equal(calls,3);assert.equal(budget.active,0);if(session)assert.equal(session.snapshot().arrays,1);}finally{unblock();refuse=false;await patches.dispose();await surface.dispose();if(session){assert.equal(session.snapshot().arrays,0);await session.dispose();}assert.equal(budget.total(),0);}
 }
});
test('scientific reader disposal waits for an in-flight source and prevents publication',async()=>{
 let enter,open,released=0;const entered=new Promise(r=>enter=r),gate=new Promise(r=>open=r),patches=noisesnifferScientificPatches({async readScientificPatch(){enter();await gate;return{pixels:{width:3,height:3,format:'rgb8',data:new Uint8Array(27)},release(){released++;}};}},3);
 try{const answer=patches.std(Uint32Array.of(0),1,0);await entered;let retired=false;const retiring=patches.dispose().then(()=>retired=true);await Promise.resolve();assert.equal(retired,false);open();await assert.rejects(answer,e=>e.code==='DISPOSED');await retiring;assert.equal(released,1);}finally{open();await patches.dispose();}
});
test('native patch arithmetic preserves primary cancellation even when its source ACK is frozen and refused',async()=>{
 const controller=new AbortController(),ack=Object.freeze(new Error('ACK refused'));let refuse=true,released=0;const patches=noisesnifferScientificPatches({async readScientificPatch(){controller.abort();return{pixels:{width:3,height:3,format:'rgb8',data:new Uint8Array(27)},release(){released++;if(refuse)throw ack;}};}},3,{signal:controller.signal});
 try{await assert.rejects(patches.std(Uint32Array.of(0),1,0),e=>e.code==='CANCELLED');await assert.rejects(patches.dispose(),e=>e===ack);refuse=false;await patches.dispose();assert.equal(released,3);}finally{refuse=false;await patches.dispose();}
});
for(const w of [7,8])test('complete cold block'+w+' pipeline reads only admitted RGB before region presentation with real nonempty candidates',async()=>{
 const h=await fixture(w,false),owner=createStrictColdNoisesnifferPreview({budget:h.budget});
 try{h.scientific=true;const answer=await owner.preview({original:h.original,domain:h.domain,params:{blockSize:w,cellSize:10,samplesPerBin:100,lowFrequencyFraction:.7,lowNoiseFraction:.5,view:'regions'},preview:{maxSide:64,maxPixels:10000,maxWorkingBytes:128*1024**2},accountedHeapBytes:noisesnifferStreamHeapBytes(),onProgress:event=>{if(event.phase==='noisesniffer-regions')h.scientific=false;}});assert(answer.preview.nativeValidBlocks>0);assert(answer.preview.nativeSelectedBlocks>0);assert.equal(answer.preview.inconclusive,false);assert(h.reads>0);assert.equal(answer.exact,false);}finally{h.scientific=false;await owner.dispose();await h.close();}
});
for(const w of [3,5,7,8])test('real strict native block'+w+' wrapper preserves native selection and analysed pixels without reading excluded RGB upstream',async()=>{
 const h=await fixture(w,false),p={blockSize:w,cellSize:10,samplesPerBin:100,lowFrequencyFraction:.7,lowNoiseFraction:.5,view:'regions'},surfaces=new Map(),registry=createResultSurfaces(surfaces);let baseline;
 try{
  // Independent reference: the existing unhooked native selection path, with
  // the same admitted statistics, encompassing cell grid and native NFA area.
  baseline=await segmentedNoisesniffer({...h.derived},p,{budget:h.budget,cache:{stats:h.stats},accountedHeapBytes:noisesnifferStreamHeapBytes()});
  const expected=await collect(baseline.analysis.selection),expectedFrame=await baseline.surface.readWindow({x:0,y:0,width:h.domain.width,height:h.domain.height});
  const expectedRgb=expectedFrame.pixels.data.slice();await expectedFrame.release();
  h.scientific=true;
  const answer=await sourceRegionNoisesniffer({task:{id:'strict-native-'+w,imageId:'strict-source',operation:'noise.noisesniffer',params:p},original:h.original,derived:h.derived,view:h.view,domain:h.domain,budget:h.budget,profile:{},onProgress:event=>{if(event.phase==='noisesniffer-regions')h.scientific=false;},publishResult:(id,record)=>registry.publishBundle(id,record)});
  h.scientific=false;assert(h.reads>0);assert.equal(answer.metrics.sourceRegionStatistics,true);
  assert.deepEqual(await collect(h.derived.noisesnifferCache.analysis.selection),expected);
  assert.deepEqual(answer.data.metadata.regions,baseline.data.metadata.regions);
  const rect={x:0,y:0,width:h.domain.width,height:h.domain.height},frame=await surfaces.get(answer.surface.id).record.surface.readWindow(rect),coverage=await surfaces.get(answer.maskSurfaces.analysis_scope.id).record.surface.readWindow(rect),original=await h.derived.surface.readWindow(rect);
  try{let analysed=0;for(let i=0;i<coverage.pixels.data.length;i++){const admitted=coverage.pixels.data[i]!==0;if(admitted)analysed++;for(let c=0;c<3;c++)assert.equal(frame.pixels.data[i*3+c],admitted?expectedRgb[i*3+c]:original.pixels.data[i*3+c]);}assert(analysed>0);assert.equal(analysed,answer.metrics.analysedPixels);}finally{await frame.release();await coverage.release();await original.release();}
 }finally{h.scientific=false;await registry.clear();await h.derived.noisesnifferCache?.dispose();await baseline?.surface.dispose();await baseline?.noisesnifferCache.dispose();await h.close();}
});
