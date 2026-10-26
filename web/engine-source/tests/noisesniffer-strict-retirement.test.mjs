import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {contiguousSurface} from '../src/image-sources.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {segmentedNoisesniffer as nativeNoisesniffer} from '../src/segmented-noisesniffer.js';
import {noisesnifferStreamHeapBytes} from '../src/noisesniffer-stream-math.js';

async function fixture(){const width=41,height=33,budget=new Budget(192*1024**2),pixels={width,height,format:'rgb8',data:Uint8Array.from({length:width*height*3},(_,i)=>32+(i*73+Math.floor(i/7)*19)%192)},original={sha256:'d'.repeat(64),surface:contiguousSurface(pixels,budget)},derived={surface:original.surface},state=await createOriginalSourceRegionsState({width,height,sourceSha256:original.sha256});await state.add('acquisition',{x0:0,y0:0,x1:18,y1:33});await state.add('acquisition',{x0:25,y0:0,x1:41,y1:33});await state.add('exclusion',{x0:7,y0:13,x1:10,y1:16});const domain=await compileOriginalSourceRegions(state.snapshot()),view=await createSourceRegionView(original.surface,domain.descriptor,{budget});return{budget,original,derived,domain,view,async close(){await derived.noisesnifferCache?.dispose();await view.dispose();await original.surface.dispose();assert.equal(budget.total(),0);}};}
const task={id:'strict',imageId:'source',operation:'noise.noisesniffer',params:{blockSize:3,samplesPerBin:100,lowFrequencyFraction:1,cellSize:10}};
test('published strict RGB retains a refused native child and coalesces its retry before releasing its credit',async t=>{
 const ack=Object.freeze(new Error('Native result ACK refused')),h=await fixture();let refused=true,attempts=0,captured,nativeResult;
 t.mock.module(new URL('../src/segmented-noisesniffer.js',import.meta.url).href,{namedExports:{segmentedNoisesniffer:async(...args)=>{const r=nativeResult=await nativeNoisesniffer(...args),inner=r.surface;return{...r,surface:{...inner,async dispose(){attempts++;if(refused){refused=false;throw ack;}await inner.dispose();}}};}}});
 const {sourceRegionNoisesniffer}=await import('../src/source-region-general-noisesniffer.js?published-ack'),held=h.budget.reserve(noisesnifferStreamHeapBytes());try{
  await sourceRegionNoisesniffer({...h,task,publishResult(id,r){captured=r;return{surface:r.surface.descriptor};}});await assert.rejects(captured.surface.dispose(),e=>e===ack);assert(h.budget.retained>0);const a=captured.surface.dispose(),b=captured.surface.dispose();assert.equal(a,b);await a;assert.equal(attempts,2);for(const r of Object.values(captured.maskRecords))await r.surface.dispose();await assert.rejects(captured.readNpz({offset:0,length:100}),e=>e.code==='DISPOSED');
 }finally{held();await nativeResult?.surface.dispose();await h.close();}
});
test('cold publication failure keeps the frozen primary and a refused real native cache reachable for retry',async t=>{
 t.mock.restoreAll();const h=await fixture(),primary=Object.freeze(Object.assign(new Error('Publication refused'),{code:'TEST_PRIMARY'})),ack=Object.freeze(new Error('Cache ACK refused'));let cache,attempts=0;
 const {sourceRegionNoisesniffer}=await import('../src/source-region-general-noisesniffer.js?cold-ack'),held=h.budget.reserve(noisesnifferStreamHeapBytes());try{
  await assert.rejects(sourceRegionNoisesniffer({...h,task,publishResult(){cache=h.derived.noisesnifferCache;const dispose=cache.dispose.bind(cache);cache.dispose=async()=>{attempts++;if(attempts===1)throw ack;await dispose();};throw primary;}}),e=>e===primary);assert.equal(h.derived.noisesnifferCache?.retirementOnly,true);assert(h.budget.retained>0);await h.derived.noisesnifferCache.dispose();assert.equal(attempts,2);
 }finally{held();await cache?.dispose();await h.close();}
});
