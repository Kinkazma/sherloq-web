import "../../runtime-context.js?v=0.14.5";
import {noisesnifferPagedSelectionWorkspace} from './noisesniffer-paged-selection.js';
import {createNoisesnifferNpzPages} from './noisesniffer-npz-pages.js';
import {noisesnifferParams,noisesnifferRegions} from './noisesniffer.js';
import {segmentedNoisesnifferStatistics} from './segmented-noisesniffer-statistics.js';
import {segmentedNoisesnifferSelection,noisesnifferSelectionWorkspace} from './segmented-noisesniffer-selection.js';
import {noisesnifferStreamMath,noisesnifferStreamHeapBytes} from './noisesniffer-stream-math.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {retainResult} from './retained-result.js';
import {controlCheckpoint,checkAbort} from './errors.js';
const semantics='Corrected IPOL Noisesniffer with global means, native unstable global sorting and ordered region growth. Significant regions are noise-consistency evidence, not a manipulation probability. Empty selections are inconclusive.';
export async function segmentedNoisesniffer(image,params,{budget,signal,onProgress,cache,storage='auto',profile={}}={}){
 const p=noisesnifferParams(params),{width,height}=image.surface.descriptor,w=p.blockSize,key=JSON.stringify([w,p.cellSize,p.samplesPerBin,p.lowFrequencyFraction,p.lowNoiseFraction]),options={budget,signal,storage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,chunkBytes:262144};
 let stats=cache?.stats,createdStats=false,selection,mask,distribution,newAnalysis,lease,surface,output,resident,countsRelease,regionRetained=0;const statsCached=stats?.blockSize===w,analysisCached=statsCached&&cache?.key===key;
 try{
  if(!statsCached){stats=await segmentedNoisesnifferStatistics(image,w,{budget,signal,onProgress,storage,profile,reserveAfter:Math.min(noisesnifferSelectionWorkspace(width,height,p),noisesnifferPagedSelectionWorkspace(width,height,p)+32*1024**2)+8*1024**2});createdStats=true;}
  resident=budget.reserve(Math.max(8*1024**2,noisesnifferStreamHeapBytes()));let analysis=analysisCached?cache.analysis:null;
  if(!analysis){
   selection=await segmentedNoisesnifferSelection(image,p,stats,{budget,signal,onProgress,storage});const countBytes=selection.all_blocks.byteLength+selection.low_noise_blocks.byteLength;budget.retain(countBytes);countsRelease=()=>{budget.retained-=countBytes;};
   const regionAllowance=budget.reserve(Math.min(width*height,selection.gridWidth*selection.gridHeight)*256+8*1024**2);let regions;
   try{regions=await noisesnifferRegions(width,height,w,p.cellSize,p.lowNoiseFraction,selection,{signal,tail:(await noisesnifferStreamMath()).tail,materializeMask:false,retainRegion:n=>{const bytes=128+n*64;budget.retain(bytes);regionRetained+=bytes;}});}finally{regionAllowance();}
   onProgress?.({phase:'noisesniffer-regions',completed:1,total:1});checkAbort(signal);
   // Rectangle union uses a rolling vertical footprint. Global flags preserve
   // all channel/bin selections; no independently segmented region decisions.
   const renderAllowance=budget.reserve(width*(w+32)*32+4*1024**2);
   try{
    mask=await createSegmentedBytes(width*height,options);distribution=await createSegmentedBytes(width*height*3,options);const counts=[new Int32Array(width),new Int32Array(width)],cols=stats.width,rows=stats.height,ring=Array.from({length:w},()=>new Uint8Array(cols));
    for(let top=0;top<height;top+=32){
     await controlCheckpoint(signal);const h=Math.min(32,height-top),part=await image.surface.readWindow({x:0,y:top,width,height:h},{signal});
     try{const rgb=part.pixels.data,m=new Uint8Array(width*h);
      for(let y=top;y<top+h;y++){
       const row=ring[y%w];if(y>=w)for(let x=0;x<cols;x++){if(row[x]&1)counts[0][x]--;if(row[x]&2)counts[1][x]--;}
       row.fill(0);if(y<rows)await selection.flags.readInto(row,y*cols);for(let x=0;x<cols;x++){if(row[x]&1)counts[0][x]++;if(row[x]&2)counts[1][x]++;}
       let selected=0,low=0;for(let x=0;x<width;x++){selected+=counts[0][x];low+=counts[1][x];if(x>=w){selected-=counts[0][x-w];low-=counts[1][x-w];}const i=(y-top)*width+x;if(low>0)rgb.set([255,0,0],i*3);else if(selected>0)rgb.fill(255,i*3,i*3+3);m[i]=regions.grid[Math.floor(y/p.cellSize)*selection.gridWidth+Math.floor(x/p.cellSize)];}
      }
      await mask.write(m,top*width);await distribution.write(rgb,top*width*3);
     }finally{part.release();}
     onProgress?.({phase:'noisesniffer-distribution',completed:top+h,total:height});
    }
    await mask.flush();await distribution.flush();
   }finally{renderAllowance();}
   const regionBytes=regionRetained;regionRetained=0;const freeCounts=countsRelease;countsRelease=null;
   const selected=selection,storedMask=mask,storedDistribution=distribution;selection=mask=distribution=null;let disposed=false;
   analysis={selection:selected,mask:storedMask,distribution:storedDistribution,data:{width,height,gridWidth:selected.gridWidth,gridHeight:selected.gridHeight,numerics:{nearGrowthBoundaries:regions.nearGrowthBoundaries,significanceGuard:1e-9},metadata:{method:'IPOL Noisesniffer',parameters:[w,p.cellSize,p.samplesPerBin,p.lowFrequencyFraction,p.lowNoiseFraction],valid_blocks:stats.validCount,selected_blocks:selected.selectedCount,low_noise_blocks:selected.lowCount,regions:regions.regions,inconclusive:selected.selectedCount===0}},async dispose(){if(disposed)return;disposed=true;try{await Promise.all([selected.dispose(),storedMask.dispose(),storedDistribution.dispose()]);}finally{freeCounts();budget.retained-=regionBytes;}}};
   analysis.owner=retainResult({descriptor:{id:crypto.randomUUID()},dispose:()=>analysis.dispose()});newAnalysis=analysis;
  }
  lease=analysis.owner.lease();
  if(p.view==='distribution')surface=createRgbSurface(analysis.distribution,{width,height,budget,ownsStore:false});
  else{
   const renderAllowance=budget.reserve(width*32*12+262144);try{output=await createSegmentedBytes(width*height*3,options);for(let y=0;y<height;y+=32){await controlCheckpoint(signal);const h=Math.min(32,height-y),m=new Uint8Array(width*h);await analysis.mask.readInto(m,y*width);const part=await image.surface.readWindow({x:0,y,width,height:h},{signal});try{const rgb=part.pixels.data;for(let i=0;i<m.length;i++)if(p.view==='mask')rgb.fill(m[i],i*3,i*3+3);else if(m[i])for(let c=0;c<3;c++)rgb[i*3+c]=Math.trunc(Math.fround(rgb[i*3+c]*Math.fround(.55))+(c===0?255*.45:0));await output.write(rgb,y*width*3);}finally{part.release();}onProgress?.({phase:'noisesniffer-render',completed:y+h,total:height});}await output.flush();surface=createRgbSurface(output,{width,height,budget});output=null;}finally{renderAllowance();}
  }
  checkAbort(signal);if(!analysisCached){const old=cache;if(statsCached){await old.analysis?.owner.dispose();old.analysis=null;}else await old?.dispose();let disposed=false;cache={stats,key,analysis,async dispose(){if(disposed)return;disposed=true;await Promise.all([stats.dispose(),this.analysis?.owner.dispose()]);}};createdStats=false;newAnalysis=null;}
  const held=lease,inner=surface;lease=null;surface=null;let disposed=false,archive;
  return {surface:{...inner,async dispose(){if(disposed)return;disposed=true;try{await inner.dispose();}finally{archive?.dispose();await held.dispose();}}},async readNpz(request,hooks){archive??=await createNoisesnifferNpzPages(analysis,hooks.provenance,{budget,signal:hooks.signal,onProgress:hooks.onProgress});return archive.read(request,hooks);},noisesnifferCache:cache,data:analysis.data,analysis,semantics,metrics:{...stats.metrics,statisticsCached:statsCached,analysisCached}};
 }catch(error){await Promise.allSettled([surface?.dispose(),output?.dispose(),lease?.dispose(),newAnalysis?.owner.dispose(),selection?.dispose(),mask?.dispose(),distribution?.dispose(),...(createdStats?[stats?.dispose()]:[])]);countsRelease?.();budget.retained-=regionRetained;throw error;}finally{resident?.();}
}
