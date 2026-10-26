import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {contiguousSurface} from '../src/image-sources.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {createSourceRegionRecord} from '../src/source-region-record.js';
import {sourceRegionNoisesnifferStatistics} from '../src/source-region-noisesniffer-statistics.js';
import {createStrictColdNoisesnifferPreview} from '../src/noisesniffer-strict-cold-preview.js';
import {sourceRegionNoisesniffer} from '../src/source-region-general-noisesniffer.js';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function rejection(p,expected){let failed=false,error;try{await p;}catch(e){failed=true;error=e;}assert(failed);assert(Object.is(error,expected),'A secondary ACK replaced the primary');}
async function fixture({disk=false}={}){
 const width=17,height=13,budget=new Budget(128*1024**2),sourceBytes=width*height*3,sha256='d'.repeat(64),state=await createOriginalSourceRegionsState({width,height,sourceSha256:sha256}),domain=await compileOriginalSourceRegions(state.snapshot()),surface=contiguousSurface({width,height,format:'rgb8',data:Uint8Array.from({length:sourceBytes},(_,i)=>i*73)},budget),original={sha256,surface},view=await createSourceRegionView({...surface,sha256},domain.descriptor,{budget}),derived=createSourceRegionRecord(original,domain,{budget});
 const arrays=new Set(),fault={refuse:true,calls:0,error:Object.freeze(new Error('controlled temporary backing ACK refused'))};let created=0;
 if(disk){budget.isBackingUnderPressure=()=>true;original.session={backend:'controlled-memory-temporary',async create(length){const store=await createSegmentedBytes(length,{budget,storage:'memory',chunkBytes:256}),target=++created===2,entry={write:(...args)=>store.write(...args),readInto:(...args)=>store.readInto(...args),flush:()=>store.flush(),async dispose(){if(target){fault.calls++;if(fault.refuse)throw fault.error;}await store.dispose();arrays.delete(entry);}};arrays.add(entry);return entry;}};}
 return{budget,original,view,domain,derived,sourceCredits:budget.total(),arrays,fault,async close(){fault.refuse=false;await derived.noisesnifferCache?.dispose();for(const a of [...arrays])await a.dispose();await derived.surface.dispose();await view.dispose();await surface.dispose();assert.equal(budget.total(),0);}};
}
const params={blockSize:3,cellSize:10,samplesPerBin:100,lowFrequencyFraction:.7,lowNoiseFraction:.5,view:'regions'},preview={maxSide:64,maxPixels:10000,maxWorkingBytes:128*1024**2};

test('construction hands an opaque owner to its parent synchronously and retries only its refused backing',async()=>{
 const h=await fixture({disk:true}),primary=Object.freeze(new Error('native progress failed'));let owner,result;
 try{const operation=sourceRegionNoisesnifferStatistics(h.original,h.view,h.domain,3,{budget:h.budget,onRetirementOwner:o=>owner=o,onProgress(){throw primary;}});assert(owner,'Owner must exist before awaiting construction');assert.deepEqual(Object.keys(owner),['dispose']);await rejection(operation,primary);assert.equal(result,undefined);assert.equal(h.fault.calls,1);assert.equal(h.arrays.size,1);assert(h.budget.total()>h.sourceCredits);h.fault.refuse=false;await owner.dispose();assert.equal(h.fault.calls,2);assert.equal(h.arrays.size,0);assert.equal(h.budget.total(),h.sourceCredits);}finally{h.fault.refuse=false;await owner?.dispose();await h.close();}
});
test('the actual cold-preview parent keeps refused construction stores reachable until close retry',async()=>{
 for(const primary of [Object.freeze(new Error('cold construction failed')),0,undefined]){
  const h=await fixture({disk:true}),parent=createStrictColdNoisesnifferPreview({budget:h.budget});let result;
  try{await rejection(parent.preview({...h,params,preview,onProgress:e=>{if(e.phase==='source-region-noisesniffer-statistics')throw primary;}}).then(value=>{result=value;return value;}),primary);assert.equal(result,undefined);assert.equal(parent.cacheEntries,1);assert(h.budget.total()>h.sourceCredits);await rejection(parent.dispose(),h.fault.error);assert.equal(parent.cacheEntries,1);h.fault.refuse=false;await parent.dispose();assert.equal(parent.cacheEntries,0);assert.equal(h.arrays.size,0);assert.equal(h.budget.total(),h.sourceCredits);}finally{h.fault.refuse=false;await parent.dispose();await h.close();}
 }
});
test('the actual native parent records failed construction in its existing retirement-only cache',async()=>{
 for(const primary of [Object.freeze(new Error('native construction failed')),0,undefined]){
  const h=await fixture({disk:true});let publications=0;
  try{await rejection(sourceRegionNoisesniffer({task:{id:'native',imageId:'source',operation:'noise.noisesniffer',params},...h,onProgress:e=>{if(e.phase==='source-region-noisesniffer-statistics')throw primary;},publishResult(){publications++;assert.fail('Failed statistics must not publish');}}),primary);assert.equal(publications,0);const ledger=h.derived.noisesnifferCache;assert.equal(ledger?.retirementOnly,true);assert.equal(ledger.pending,true);assert(h.budget.total()>h.sourceCredits);await rejection(ledger.dispose(),h.fault.error);h.fault.refuse=false;await ledger.dispose();assert.equal(ledger.pending,false);assert.equal(h.arrays.size,0);assert.equal(h.budget.total(),h.sourceCredits);}finally{await h.close();}
 }
});
test('a construction owner closed during a held source ACK waits and prevents all statistics publication',async()=>{
 const h=await fixture(),entered=deferred(),gate=deferred(),read=h.view.readWindow.bind(h.view);let owner,closing,stats,operation,settled=false;const view={...h.view,async readWindow(...args){const frame=await read(...args);return{...frame,release(){entered.resolve();return gate.promise.then(()=>frame.release());}};}};
 try{operation=sourceRegionNoisesnifferStatistics(h.original,view,h.domain,3,{budget:h.budget,onRetirementOwner:o=>owner=o,onProgress(){closing=owner.dispose();}}).then(value=>{stats=value;return value;});void operation.catch(()=>{});await entered.promise;assert.equal(closing,owner.dispose());void closing.then(()=>settled=true);for(let i=0;i<16;i++)await Promise.resolve();assert.equal(settled,false);assert.equal(stats,undefined);gate.resolve();await assert.rejects(operation,e=>e.code==='DISPOSED');await closing;assert.equal(stats,undefined);assert.equal(h.budget.total(),h.sourceCredits);}finally{gate.resolve();await operation?.catch(()=>{});await owner?.dispose();await h.close();}
});
test('a parent can close the provisional owner before the first await without reading or publishing RGB',async()=>{
 const h=await fixture();let owner,closing,reads=0,stats;const view={...h.view,async visitIncluded(...args){reads++;return h.view.visitIncluded(...args);}};
 try{await assert.rejects(sourceRegionNoisesnifferStatistics(h.original,view,h.domain,3,{budget:h.budget,onRetirementOwner:o=>{owner=o;closing=o.dispose();}}).then(value=>{stats=value;return value;}),e=>e.code==='DISPOSED');assert(owner);await closing;assert.equal(reads,0);assert.equal(stats,undefined);assert.equal(h.budget.total(),h.sourceCredits);}finally{await owner?.dispose();await h.close();}
});
