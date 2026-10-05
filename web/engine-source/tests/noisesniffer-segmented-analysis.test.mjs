import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';import {contiguousSurface} from '../src/image-sources.js';import {segmentedNoisesniffer} from '../src/segmented-noisesniffer.js';
const file=f=>readFile(new URL('../fixtures/'+f,import.meta.url)),digest=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const ref=JSON.parse(await file('noisesniffer-reference.json'));
test('global stored selection, ordered growth and three views retain native outputs',async()=>{
 let count=0;
 for(const c of ref.cases){const budget=new Budget(256*1024**2),image={surface:contiguousSurface({width:c.width,height:c.height,data:new Uint8Array(await file(c.input.file))},budget)};let cache;
  for(const a of c.analyses){const [blockSize,cellSize,samplesPerBin,lowFrequencyFraction,lowNoiseFraction]=a.parameters,p={blockSize,cellSize,samplesPerBin,lowFrequencyFraction,lowNoiseFraction};
   for(const [view,key]of [['regions','overlay'],['mask','mask'],['distribution','distribution']]){const result=await segmentedNoisesniffer(image,{...p,view},{budget,cache});cache=result.noisesnifferCache;const r=await result.surface.readWindow();let rgb=r.pixels.data;if(view==='mask')rgb=Uint8Array.from({length:c.width*c.height},(_,i)=>rgb[i*3]);assert.equal(digest(rgb),a.arrays[key].sha256,c.name+'/'+view);r.release();
    if(view==='regions'){const s=result.analysis.selection;for(const name of ['selected','low_noise']){const n=name==='selected'?s.selectedCount:s.lowCount,v=new Uint32Array(n);await s[name].readInto(new Uint8Array(v.buffer));assert.equal(digest(BigInt64Array.from(v,BigInt)),a.arrays[name].sha256,c.name+'/'+name);}for(const name of ['all_blocks','low_noise_blocks'])assert.equal(digest(s[name]),a.arrays[name].sha256,c.name+'/'+name);assert.equal(result.data.metadata.inconclusive,a.inconclusive);assert.deepEqual(result.data.metadata.regions.map(r=>r.cells),a.regions.map(r=>r.cells));}
    else assert.equal(result.metrics.analysisCached,true);await result.surface.dispose();count++;
   }
  }await cache.dispose();assert.equal(budget.total(),0,c.name+' leak');
 }console.log({nativeViews:count});
});
test('cancel stored analysis phases and keep published old view alive across cache replacement',async()=>{
 const c=ref.cases.find(c=>c.name==='patch-8'),budget=new Budget(128*1024**2),image={surface:contiguousSurface({width:c.width,height:c.height,data:new Uint8Array(await file(c.input.file))},budget)};
 for(const phase of ['noisesniffer-sort','noisesniffer-select','noisesniffer-regions','noisesniffer-distribution','noisesniffer-render']){const abort=new AbortController();await assert.rejects(segmentedNoisesniffer(image,{blockSize:8},{budget,signal:abort.signal,onProgress:p=>{if(p.phase===phase)abort.abort();}}),{code:'CANCELLED'});assert.equal(budget.total(),0,phase);}
 const first=await segmentedNoisesniffer(image,{blockSize:8,view:'distribution'},{budget}),next=await segmentedNoisesniffer(image,{blockSize:3},{budget,cache:first.noisesnifferCache});await next.noisesnifferCache.dispose();await next.surface.dispose();const page=await first.surface.readWindow();assert.equal(page.pixels.data.length,c.width*c.height*3);page.release();await first.surface.dispose();assert.equal(budget.total(),0);
});

test('NPZ pages match existing archive bytes, including int64 IDs and BGR distribution',async()=>{
 const {noisesnifferNpz}=await import('../src/npz.js'),c=ref.cases.find(c=>c.name==='patch-8'),budget=new Budget(128*1024**2),image={surface:contiguousSurface({width:c.width,height:c.height,data:new Uint8Array(await file(c.input.file))},budget)},result=await segmentedNoisesniffer(image,{blockSize:8},{budget}),a=result.analysis,s=a.selection,d={...a.data,all_blocks:s.all_blocks,low_noise_blocks:s.low_noise_blocks};
 for(const key of ['mask','distribution']){d[key]=new Uint8Array(a[key].byteLength);await a[key].readInto(d[key]);}
 for(const key of ['selected','low_noise']){d[key]=new Uint32Array(key==='selected'?s.selectedCount:s.lowCount);await s[key].readInto(new Uint8Array(d[key].buffer));}
 const provenance={operation:'noise.noisesniffer',params:{blockSize:8},test:'épreuve'},expected=noisesnifferNpz({data:d,provenance},16*1024**2).bytes;let at=0;const chunks=[];
 while(at<expected.length){const page=await result.readNpz({offset:at,length:997},{provenance});chunks.push(page.bytes);at=page.nextOffset;page.release();assert.equal(page.totalBytes,expected.length);}
 assert.deepEqual(Buffer.concat(chunks),Buffer.from(expected));await result.noisesnifferCache.dispose();await result.surface.dispose();assert.equal(budget.total(),0);
});
