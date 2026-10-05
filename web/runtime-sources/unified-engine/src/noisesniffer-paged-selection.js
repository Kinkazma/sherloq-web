import "../../runtime-context.js?v=0.14.5";
import {noisesnifferStd8} from './noisesniffer-std8.js';
import {noisesnifferPackedFlags} from './noisesniffer-packed-flags.js';
import {noisesnifferStoredPatches} from './noisesniffer-stored-patches.js';
import {numpyPagedSort} from './numpy-paged-sort.js';
import {gatherDenseValues} from './dense-paged-links.js';
import {numpyArgsort} from './numpy-argsort.js';
import {numpySum} from './numpy-sum.js';
import {controlCheckpoint,checkAbort} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
const bankers=x=>{const f=Math.floor(x);return x-f===.5?f+f%2:Math.round(x);};
export function noisesnifferPagedSelectionWorkspace(width,height,p,validCount=(width-p.blockSize+1)*(height-p.blockSize+1)){
 const b=Math.floor(validCount/Math.max(1,bankers(validCount/p.samplesPerBin))),cells=(Math.floor(width/p.cellSize)+1)*(Math.floor(height/p.cellSize)+1);
 return 20*1024**2+Math.max(1,b)*160+width*(p.blockSize+256)*12+width*32*40+cells*16;
}
export async function pagedNoisesnifferSelection(image,p,stats,{budget,signal,onProgress,storage='auto'}={}){
 const {width,height}=image.surface.descriptor,w=p.blockSize,cols=stats.width,rows=stats.height,N=cols*rows,count=stats.validCount,owned=[],scratch=[],release=budget.reserve(noisesnifferPagedSelectionWorkspace(width,height,p,count));
 const options={budget,signal,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,storage:storage==='auto'?'temporary':storage,chunkBytes:262144};let packed;
 try{
  const selected=await createSegmentedBytes(count*12,options);owned.push(selected);const low=await createSegmentedBytes(count*12,options);owned.push(low);const flagStore=await createSegmentedBytes(N,options);owned.push(flagStore);
  const keys=await createSegmentedBytes(count*8,options);scratch.push(keys);const order=await createSegmentedBytes(count*4,options);scratch.push(order);
  packed=noisesnifferPackedFlags(N,budget);
  const gh=Math.floor(height/p.cellSize)+1,gw=Math.floor(width/p.cellSize)+1,all_blocks=new Float64Array(gh*gw),low_noise_blocks=new Float64Array(gh*gw);let selectedCount=0,lowCount=0;
  const pages=new Map(),pageSize=65536,pageCount=256;let stamp=performance.now();
  const save=async page=>{if(page.dirty)await flagStore.write(page.bytes,page.offset);};
  const mark=async(ids,bit,counts)=>{for(const id of ids){checkAbort(signal);if(packed)packed.mark(id,bit);else{const pageId=Math.floor(id/pageSize);let page=pages.get(pageId);if(!page){if(pages.size===pageCount){const first=pages.keys().next().value;await save(pages.get(first));pages.delete(first);}const offset=pageId*pageSize,bytes=new Uint8Array(Math.min(pageSize,N-offset));await flagStore.readInto(bytes,offset);page={offset,bytes,dirty:false};}else pages.delete(pageId);pages.set(pageId,page);page.bytes[id-page.offset]|=bit;page.dirty=true;}counts[Math.floor(Math.floor(id/cols)/p.cellSize)*gw+Math.floor(id%cols/p.cellSize)]++;if(performance.now()-stamp>=20){await controlCheckpoint(signal);stamp=performance.now();}}};
  const b=Math.floor(count/Math.max(1,bankers(count/p.samplesPerBin))),bins=count?bankers(count/b):0,block=new Float64Array(w*w),squares=new Float64Array(w*w);
  const sortMetrics=[],standard=w===8?await noisesnifferStd8(image,{...options,onProgress}):null,patches=standard?null:noisesnifferStoredPatches(image,w,{signal});if(standard)scratch.push(standard);
  for(let c=0;c<3&&count;c++){
   let offset=0;
   for(let y=0;y<rows;y+=32){await controlCheckpoint(signal);const h=Math.min(32,rows-y),valid=new Uint8Array(cols*h),means=await stats.means.read(0,y,cols*3,h,{signal}),values=new Float64Array(cols*h),ids=new Uint32Array(cols*h);await stats.valid.readInto(valid,y*cols);let length=0;for(let i=0;i<valid.length;i++)if(valid[i]){values[length]=means[i*3+c];ids[length++]=y*cols+i;}await keys.write(new Uint8Array(values.buffer,0,length*8),offset*8);await order.write(new Uint8Array(ids.buffer,0,length*4),offset*4);offset+=length;}
   sortMetrics.push(await numpyPagedSort(keys,order,{budget,signal,onProgress}));
   onProgress?.({phase:'noisesniffer-sort',completed:c* bins,total:3*bins});
   for(let bin=0;bin<bins;bin++){
    await controlCheckpoint(signal);const ids=new Int32Array((bin===bins-1?count:(bin+1)*b)-bin*b);await order.readInto(new Uint8Array(ids.buffer),bin*b*4);const v=await gatherDenseValues({byteLength:N*4,readInto:(bytes,offset)=>stats.variance.store.readInto(bytes,c*N*4+offset)},ids,Float32Array,{signal}),chosen=Uint32Array.from(numpyArgsort(v).subarray(0,Math.trunc(b*p.lowFrequencyFraction)),i=>ids[i]),std=new Float64Array(chosen.length),spatial=Uint32Array.from({length:chosen.length},(_,i)=>i);spatial.sort((a,b)=>chosen[a]-chosen[b]);let flat=0;
    // Gather spatially adjacent patches once, retaining their original bin order.
    if(standard){std.set(await gatherDenseValues(standard.store,Int32Array.from(chosen,i=>i*3+c),Float64Array,{signal}));for(const value of std)if(value===0)flat++;}
    else if(patches){std.set(await patches.std(chosen,cols,c));for(const value of std)if(value===0)flat++;}
    else for(let at=0;at<spatial.length;){checkAbort(signal);const y=Math.floor(chosen[spatial[at]]/cols),last=Math.min(rows,y+256);let end=at+1;while(end<spatial.length&&Math.floor(chosen[spatial[end]]/cols)<last)end++;const part=await image.surface.readWindow({x:0,y,width,height:last-y+w-1},{signal});try{for(let k=at;k<end;k++){const i=spatial[k],id=chosen[i],py=Math.floor(id/cols)-y,px=id%cols;for(let dy=0;dy<w;dy++)for(let dx=0;dx<w;dx++)block[dy*w+dx]=part.pixels.data[((py+dy)*width+px+dx)*3+c];const mean=numpySum(block)/block.length;for(let j=0;j<block.length;j++){const d=block[j]-mean;squares[j]=d*d;}std[i]=Math.sqrt(numpySum(squares)/squares.length);if(std[i]===0)flat++;}}finally{part.release();}at=end;}
    const limit=Math.trunc(b*p.lowFrequencyFraction*p.lowNoiseFraction);
    if(flat<limit){const sorted=numpyArgsort(std),V=Uint32Array.from(sorted,i=>chosen[i]),S=V.subarray(0,limit);await selected.write(new Uint8Array(V.buffer),selectedCount*4);await low.write(new Uint8Array(S.buffer,S.byteOffset,S.byteLength),lowCount*4);selectedCount+=V.length;lowCount+=S.length;await mark(V,1,all_blocks);await mark(S,2,low_noise_blocks);}
    onProgress?.({phase:'noisesniffer-select',completed:c*bins+bin+1,total:3*bins});
   }
  }
  patches?.clear();
  if(packed)await packed.flush(flagStore,{signal});else for(const page of pages.values()){await controlCheckpoint(signal);await save(page);}pages.clear();await Promise.all(owned.map(s=>s.flush()));checkAbort(signal);let disposed=false;
  return {metrics:{sorts:sortMetrics,layout:'paged-global',membershipStorage:packed?'packed-two-bit':'paged-byte',membershipPackedBytes:packed?.byteLength??0,standardDeviation:standard?.metrics??{method:'native-patch-sums'}},selected,low_noise:low,flags:flagStore,selectedCount,lowCount,gridWidth:gw,gridHeight:gh,all_blocks,low_noise_blocks,async dispose(){if(disposed)return;disposed=true;await Promise.all(owned.map(s=>s.dispose()));}};
 }catch(error){await Promise.allSettled(owned.map(s=>s.dispose()));throw error;}finally{packed?.dispose();await Promise.allSettled(scratch.map(s=>s.dispose()));release();}
}
