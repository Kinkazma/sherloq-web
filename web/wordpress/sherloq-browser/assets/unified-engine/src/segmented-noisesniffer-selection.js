import "../../runtime-context.js?v=0.14.5";
import {pagedNoisesnifferSelection} from './noisesniffer-paged-selection.js';
import {numpyArgsort} from './numpy-argsort.js';
import {numpySum} from './numpy-sum.js';
import {controlCheckpoint,checkAbort} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
const bankers=x=>{const f=Math.floor(x);return x-f===.5?f+f%2:Math.round(x);};
export function noisesnifferSelectionWorkspace(width,height,p,validCount=(width-p.blockSize+1)*(height-p.blockSize+1)){
 const n=(width-p.blockSize+1)*(height-p.blockSize+1),b=Math.floor(validCount/Math.max(1,bankers(validCount/p.samplesPerBin)));
 // Global native unstable argsort: valid IDs, means and order; one variance
 // channel, flags, bin buffers, RGB gathering, and region-growth cell objects.
 return validCount*16+n*5+Math.max(1,b)*96+width*(p.blockSize+256)*12+Math.min(width*height,(Math.floor(width/p.cellSize)+1)*(Math.floor(height/p.cellSize)+1))*256+4*1024**2;
}
export async function segmentedNoisesnifferSelection(image,p,stats,{budget,signal,onProgress,storage='auto'}={}){
 const shape=image.surface.descriptor;if(noisesnifferSelectionWorkspace(shape.width,shape.height,p,stats.validCount)>budget.limit-budget.retained-budget.active)return pagedNoisesnifferSelection(image,p,stats,{budget,signal,onProgress,storage});
 const {width,height}=image.surface.descriptor,w=p.blockSize,cols=stats.width,rows=stats.height,N=cols*rows,count=stats.validCount,owned=[],release=budget.reserve(noisesnifferSelectionWorkspace(width,height,p,count));
 const options={budget,signal,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,storage:storage==='auto'&&(image.session||image.ensureTemporarySession)&&count*24+N+width*height*7+8*1024**2>budget.limit-budget.retained-budget.active?'temporary':storage,chunkBytes:262144};
 try{
  const selected=await createSegmentedBytes(count*12,options);owned.push(selected);const low=await createSegmentedBytes(count*12,options);owned.push(low);const flagStore=await createSegmentedBytes(N,options);owned.push(flagStore);
  const valid=new Uint32Array(count),values=new Float64Array(count),flags=new Uint8Array(N),channel=new Float32Array(N),gh=Math.floor(height/p.cellSize)+1,gw=Math.floor(width/p.cellSize)+1,all_blocks=new Float64Array(gh*gw),low_noise_blocks=new Float64Array(gh*gw);let offset=0,selectedCount=0,lowCount=0;
  for(let y=0;y<rows;y+=32){await controlCheckpoint(signal);const h=Math.min(32,rows-y),v=new Uint8Array(cols*h);await stats.valid.readInto(v,y*cols);for(let i=0;i<v.length;i++)if(v[i])valid[offset++]=y*cols+i;}
  const b=Math.floor(count/Math.max(1,bankers(count/p.samplesPerBin))),bins=count?bankers(count/b):0,block=new Float64Array(w*w),squares=new Float64Array(w*w);
  const mark=(ids,bit,counts)=>{for(const id of ids){flags[id]|=bit;counts[Math.floor(Math.floor(id/cols)/p.cellSize)*gw+Math.floor(id%cols/p.cellSize)]++;}};
  for(let c=0;c<3&&count;c++){
   offset=0;
   for(let y=0;y<rows;y+=32){await controlCheckpoint(signal);const h=Math.min(32,rows-y),means=await stats.means.read(0,y,cols*3,h,{signal});while(offset<count&&valid[offset]<(y+h)*cols){values[offset]=means[(valid[offset]-y*cols)*3+c];offset++;}const variance=await stats.variance.read(0,c*rows+y,cols,h,{signal});channel.set(variance,y*cols);}
   const order=numpyArgsort(values);for(let i=0;i<order.length;i++)order[i]=valid[order[i]];
   onProgress?.({phase:'noisesniffer-sort',completed:c* bins,total:3*bins});
   for(let bin=0;bin<bins;bin++){
    await controlCheckpoint(signal);const ids=order.subarray(bin*b,bin===bins-1?count:(bin+1)*b),v=Float32Array.from(ids,id=>channel[id]),chosen=Uint32Array.from(numpyArgsort(v).subarray(0,Math.trunc(b*p.lowFrequencyFraction)),i=>ids[i]),std=new Float64Array(chosen.length),spatial=Uint32Array.from({length:chosen.length},(_,i)=>i);spatial.sort((a,b)=>chosen[a]-chosen[b]);let flat=0;
    // Gather spatially adjacent patches once, retaining their original bin order.
    for(let at=0;at<spatial.length;){checkAbort(signal);const y=Math.floor(chosen[spatial[at]]/cols),last=Math.min(rows,y+256);let end=at+1;while(end<spatial.length&&Math.floor(chosen[spatial[end]]/cols)<last)end++;const part=await image.surface.readWindow({x:0,y,width,height:last-y+w-1},{signal});try{for(let k=at;k<end;k++){const i=spatial[k],id=chosen[i],py=Math.floor(id/cols)-y,px=id%cols;for(let dy=0;dy<w;dy++)for(let dx=0;dx<w;dx++)block[dy*w+dx]=part.pixels.data[((py+dy)*width+px+dx)*3+c];const mean=numpySum(block)/block.length;for(let j=0;j<block.length;j++){const d=block[j]-mean;squares[j]=d*d;}std[i]=Math.sqrt(numpySum(squares)/squares.length);if(std[i]===0)flat++;}}finally{part.release();}at=end;}
    const limit=Math.trunc(b*p.lowFrequencyFraction*p.lowNoiseFraction);
    if(flat<limit){const sorted=numpyArgsort(std),V=Uint32Array.from(sorted,i=>chosen[i]),S=V.subarray(0,limit);await selected.write(new Uint8Array(V.buffer),selectedCount*4);await low.write(new Uint8Array(S.buffer,S.byteOffset,S.byteLength),lowCount*4);selectedCount+=V.length;lowCount+=S.length;mark(V,1,all_blocks);mark(S,2,low_noise_blocks);}
    onProgress?.({phase:'noisesniffer-select',completed:c*bins+bin+1,total:3*bins});
   }
  }
  await flagStore.write(flags);await Promise.all(owned.map(s=>s.flush()));checkAbort(signal);let disposed=false;
  return {selected,low_noise:low,flags:flagStore,selectedCount,lowCount,gridWidth:gw,gridHeight:gh,all_blocks,low_noise_blocks,async dispose(){if(disposed)return;disposed=true;await Promise.all(owned.map(s=>s.dispose()));}};
 }catch(error){await Promise.allSettled(owned.map(s=>s.dispose()));throw error;}finally{release();}
}
