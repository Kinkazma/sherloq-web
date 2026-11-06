import {noisesnifferOwnerRetirement} from './noisesniffer-owner-retirement.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {noisesnifferPackedFlags} from './noisesniffer-packed-flags.js';
import {checkAbort,createCooperator,requireValue} from './errors.js';
const bankers=x=>{const f=Math.floor(x);return x-f===.5?f+f%2:Math.round(x);};
export const noisesnifferBasisKey=p=>JSON.stringify([p.blockSize,p.samplesPerBin,p.lowFrequencyFraction]);
export const noisesnifferSelectionKey=p=>JSON.stringify([p.blockSize,p.samplesPerBin,p.lowFrequencyFraction,p.lowNoiseFraction]);
export async function createNoisesnifferSelectionBasis(image,p,stats,options){
 const count=stats.validCount,b=Math.floor(count/Math.max(1,bankers(count/p.samplesPerBin))),bins=count?bankers(count/b):0,capacity=Math.min(count*3,bins*3*Math.trunc(b*p.lowFrequencyFraction)),owned=[];let offset=0;
 // A channel/bin contributes at most trunc(b*n) candidates; the disjoint
 // bins also contain at most validCount IDs per channel. Both bounds hold
 // before the flat-bin gate, without changing its native decision or order.
 const room=options.budget.limit-options.budget.retained-options.budget.active,candidateOptions=options.storage==='auto'&&(options.temporarySession||options.getTemporarySession)&&capacity*4>room-(options.reserveAfter??0)?{...options,storage:'temporary'}:options;
 try{const candidates=await createSegmentedBytes(capacity*4,candidateOptions);owned.push(candidates);const records=await createSegmentedBytes(bins*3*24,options);owned.push(records);
  return{key:noisesnifferBasisKey(p),b,bins,width:stats.width,height:stats.height,validCount:count,candidates,records,
   async record(index,ids,flat){checkAbort(options.signal);requireValue(index>=0&&index<bins*3&&ids instanceof Uint32Array,'Invalid native selection-basis record.');const meta=Float64Array.of(offset,ids.length,flat);if(ids.length)await candidates.write(new Uint8Array(ids.buffer,ids.byteOffset,ids.byteLength),offset*4);await records.write(new Uint8Array(meta.buffer),index*24);offset+=ids.length;},
   async read(index,{signal}={}){checkAbort(signal);const meta=new Float64Array(3);await records.readInto(new Uint8Array(meta.buffer),index*24);const ids=new Uint32Array(meta[1]);if(ids.length)await candidates.readInto(new Uint8Array(ids.buffer),meta[0]*4);checkAbort(signal);return{ids,flat:meta[2]};},
   async finish(){await Promise.all(owned.map(store=>store.flush()));checkAbort(options.signal);this.candidateCount=offset;return this;},
   dispose:noisesnifferOwnerRetirement(owned.map(store=>()=>store.dispose()))
  };
 }catch(error){await Promise.allSettled(owned.map(store=>store.dispose()));throw error;}
}
// Re-materialize the exact per-channel/bin concatenation. Sorting and patch
// statistics are already in the basis; neither image pixels nor DCT are read.
export async function selectNoisesnifferBasis(image,p,basis,{budget,signal,onProgress,storage='auto'}={}){
 requireValue(basis?.key===noisesnifferBasisKey(p),'The retained native selection basis does not match.');const {width,height}=image.surface.descriptor,N=basis.width*basis.height,gh=Math.floor(height/p.cellSize)+1,gw=Math.floor(width/p.cellSize)+1,workspace=32*1024**2+Math.max(1,basis.b)*24+gh*gw*16,release=budget.reserve(workspace),owned=[];
 const options={budget,signal,storage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,chunkBytes:262144};let packed;
 try{const selected=await createSegmentedBytes(basis.validCount*12,options);owned.push(selected);const low_noise=await createSegmentedBytes(basis.validCount*12,options);owned.push(low_noise);const flags=await createSegmentedBytes(N,options);owned.push(flags);packed=noisesnifferPackedFlags(N,budget);
  const all_blocks=new Float64Array(gh*gw),low_noise_blocks=new Float64Array(gh*gw),pages=new Map(),pageSize=65536,pageCount=256,cooperate=createCooperator(signal);let selectedCount=0,lowCount=0,visited=0;
  const save=async page=>{if(page.dirty)await flags.write(page.bytes,page.offset);};
  const mark=async(ids,bit,counts)=>{for(const id of ids){if((visited++&1023)===0)await cooperate();if(packed)packed.mark(id,bit);else{const pageId=Math.floor(id/pageSize);let page=pages.get(pageId);if(!page){if(pages.size===pageCount){const first=pages.keys().next().value;await save(pages.get(first));pages.delete(first);}const offset=pageId*pageSize,bytes=new Uint8Array(Math.min(pageSize,N-offset));await flags.readInto(bytes,offset);page={offset,bytes,dirty:false};}else pages.delete(pageId);pages.set(pageId,page);page.bytes[id-page.offset]|=bit;page.dirty=true;}counts[Math.floor(Math.floor(id/basis.width)/p.cellSize)*gw+Math.floor(id%basis.width/p.cellSize)]++;}};
  const limit=Math.trunc(basis.b*p.lowFrequencyFraction*p.lowNoiseFraction);
  for(let index=0;index<basis.bins*3;index++){await cooperate();const {ids,flat}=await basis.read(index,{signal});if(flat<limit){const low=ids.subarray(0,limit);await selected.write(new Uint8Array(ids.buffer),selectedCount*4);await low_noise.write(new Uint8Array(low.buffer,low.byteOffset,low.byteLength),lowCount*4);selectedCount+=ids.length;lowCount+=low.length;await mark(ids,1,all_blocks);await mark(low,2,low_noise_blocks);}onProgress?.({phase:'noisesniffer-select-cached',completed:index+1,total:basis.bins*3});}
  if(packed)await packed.flush(flags,{signal});else for(const page of pages.values()){await cooperate();await save(page);}await Promise.all(owned.map(store=>store.flush()));checkAbort(signal);
  return{selected,low_noise,flags,selectedCount,lowCount,gridWidth:gw,gridHeight:gh,all_blocks,low_noise_blocks,metrics:{basisCached:true,statisticsCalls:0,sortCalls:0,patchCalls:0},dispose:noisesnifferOwnerRetirement(owned.map(store=>()=>store.dispose()))};
 }catch(error){await Promise.allSettled(owned.map(store=>store.dispose()));throw error;}finally{packed?.dispose();release();}
}
export async function countNoisesnifferSelection(image,p,selection,{budget,signal,onProgress}={}){
 const {width,height}=image.surface.descriptor,cols=width-p.blockSize+1,gh=Math.floor(height/p.cellSize)+1,gw=Math.floor(width/p.cellSize)+1,release=budget.reserve(gh*gw*16+262144),cooperate=createCooperator(signal);
 try{const result={gridWidth:gw,gridHeight:gh,all_blocks:new Float64Array(gh*gw),low_noise_blocks:new Float64Array(gh*gw)};let visited=0;
  for(const [key,total,counts]of [['selected',selection.selectedCount,result.all_blocks],['low_noise',selection.lowCount,result.low_noise_blocks]])for(let offset=0;offset<total;offset+=65536){await cooperate();const ids=new Uint32Array(Math.min(65536,total-offset));await selection[key].readInto(new Uint8Array(ids.buffer),offset*4);for(const id of ids){if((visited++&1023)===0)await cooperate();counts[Math.floor(Math.floor(id/cols)/p.cellSize)*gw+Math.floor(id%cols/p.cellSize)]++;}onProgress?.({phase:'noisesniffer-counts',completed:Math.min(total,offset+ids.length),total});}
  checkAbort(signal);return result;
 }finally{release();}
}
