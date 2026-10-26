import {noisesnifferOwnerRetirement} from './noisesniffer-owner-retirement.js';
import {noisesnifferPagedSelectionWorkspace} from './noisesniffer-paged-selection.js';
import {createNoisesnifferNpzPages} from './noisesniffer-npz-pages.js';
import {noisesnifferParams,noisesnifferRegions} from './noisesniffer.js';
import {segmentedNoisesnifferStatistics} from './segmented-noisesniffer-statistics.js';
import {segmentedNoisesnifferSelection,noisesnifferSelectionWorkspace} from './segmented-noisesniffer-selection.js';
import {noisesnifferBasisKey,noisesnifferSelectionKey,countNoisesnifferSelection} from './noisesniffer-selection-basis.js';
import {noisesnifferStreamMath,noisesnifferStreamHeapBytes} from './noisesniffer-stream-math.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {retainResult} from './retained-result.js';
import {EngineError,createCooperator,checkAbort,requireValue} from './errors.js';
const semantics='Corrected IPOL Noisesniffer with global means, native unstable global sorting and ordered region growth. Significant regions are noise-consistency evidence, not a manipulation probability. Empty selections are inconclusive.';
export async function segmentedNoisesniffer(image,params,{budget,signal,onProgress,cache,storage='auto',profile={},accountedHeapBytes=0}={}){
 requireValue(Number.isSafeInteger(accountedHeapBytes)&&accountedHeapBytes>=0&&accountedHeapBytes<=noisesnifferStreamHeapBytes(),'Invalid already-accounted native Noisesniffer heap.');
 const cooperate=createCooperator(signal);
 const started=performance.now(),p=noisesnifferParams(params),{width,height}=image.surface.descriptor,w=p.blockSize,selectionKey=noisesnifferSelectionKey(p),key=JSON.stringify([selectionKey,p.cellSize]),options={budget,signal,storage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,chunkBytes:262144};
 let stats=cache?.stats,basis=cache?.basis,stage=cache?.selectionStage,createdStats=false,createdBasis=false,createdStage=false,mask,distribution,newAnalysis,lease,surface,output,resident,countsRelease,regionRetained=0;
 const statsCached=stats?.blockSize===w,analysisCached=statsCached&&cache?.key===key&&!!cache.analysis,selectionCached=statsCached&&stage?.key===selectionKey,basisCached=statsCached&&basis?.key===noisesnifferBasisKey(p),stages={};
 try{
  if(!statsCached){const t=performance.now();stats=await segmentedNoisesnifferStatistics(image,w,{budget,signal,onProgress,storage,profile,reserveAfter:Math.min(noisesnifferSelectionWorkspace(width,height,p),noisesnifferPagedSelectionWorkspace(width,height,p)+32*1024**2)+8*1024**2});createdStats=true;stages.statisticsMs=performance.now()-t;}
  if(!basisCached)basis=null;if(!selectionCached)stage=null;
  resident=budget.reserve(Math.max(0,Math.max(8*1024**2,noisesnifferStreamHeapBytes())-accountedHeapBytes));let analysis=analysisCached?cache.analysis:null;
  if(!analysis){
   let counts;const t=performance.now();
   if(!stage){
    const selected=await segmentedNoisesnifferSelection(image,p,stats,{budget,signal,onProgress,storage,basis,keepBasis:true});if(selected.basis){basis=selected.basis;delete selected.basis;createdBasis=true;}
    counts={gridWidth:selected.gridWidth,gridHeight:selected.gridHeight,all_blocks:selected.all_blocks,low_noise_blocks:selected.low_noise_blocks};delete selected.gridWidth;delete selected.gridHeight;delete selected.all_blocks;delete selected.low_noise_blocks;
    stage={key:selectionKey,selection:selected,distribution:null};const ownedStage=stage;stage.dispose=noisesnifferOwnerRetirement([()=>selected.dispose(),()=>ownedStage.distribution?.dispose()]);stage.owner=retainResult({descriptor:{id:crypto.randomUUID()},dispose:()=>ownedStage.dispose()});createdStage=true;
   }else counts=await countNoisesnifferSelection(image,p,stage.selection,{budget,signal,onProgress});
   stages.selectionCountsMs=performance.now()-t;const selection={...stage.selection,...counts},countBytes=counts.all_blocks.byteLength+counts.low_noise_blocks.byteLength;budget.retain(countBytes);countsRelease=()=>{budget.retained-=countBytes;};
   const regionAllowance=budget.reserve(Math.min(width*height,selection.gridWidth*selection.gridHeight)*256+8*1024**2);let regions;const regionStarted=performance.now();
   try{regions=await noisesnifferRegions(width,height,w,p.cellSize,p.lowNoiseFraction,selection,{signal,tail:(await noisesnifferStreamMath()).tail,materializeMask:false,retainRegion:n=>{const bytes=128+n*64;budget.retain(bytes);regionRetained+=bytes;}});}finally{regionAllowance();}
   stages.regionsMs=performance.now()-regionStarted;onProgress?.({phase:'noisesniffer-regions',completed:1,total:1});checkAbort(signal);
   const renderAllowance=budget.reserve(width*(w+32)*32+4*1024**2),renderDistribution=!stage.distribution,distributionStarted=performance.now();
   try{
    mask=await createSegmentedBytes(width*height,options);if(renderDistribution)distribution=await createSegmentedBytes(width*height*3,options);const countsRows=renderDistribution?[new Int32Array(width),new Int32Array(width)]:null,cols=stats.width,rows=stats.height,ring=renderDistribution?Array.from({length:w},()=>new Uint8Array(cols)):null;
    for(let top=0;top<height;top+=32){
     await cooperate();checkAbort(signal);const h=Math.min(32,height-top),part=renderDistribution?await image.surface.readWindow({x:0,y:top,width,height:h},{signal}):null;
     try{const rgb=part?.pixels.data,m=new Uint8Array(width*h);
      for(let y=top;y<top+h;y++){
       if(renderDistribution){const row=ring[y%w];if(y>=w)for(let x=0;x<cols;x++){if(row[x]&1)countsRows[0][x]--;if(row[x]&2)countsRows[1][x]--;}row.fill(0);if(y<rows)await selection.flags.readInto(row,y*cols);for(let x=0;x<cols;x++){if(row[x]&1)countsRows[0][x]++;if(row[x]&2)countsRows[1][x]++;}}
       let selected=0,low=0;for(let x=0;x<width;x++){const i=(y-top)*width+x;if(renderDistribution){selected+=countsRows[0][x];low+=countsRows[1][x];if(x>=w){selected-=countsRows[0][x-w];low-=countsRows[1][x-w];}if(low>0)rgb.set([255,0,0],i*3);else if(selected>0)rgb.fill(255,i*3,i*3+3);}m[i]=regions.grid[Math.floor(y/p.cellSize)*selection.gridWidth+Math.floor(x/p.cellSize)];}
      }
      await mask.write(m,top*width);if(renderDistribution)await distribution.write(rgb,top*width*3);
     }finally{part?.release();}
     onProgress?.({phase:renderDistribution?'noisesniffer-distribution':'noisesniffer-mask-cached',completed:top+h,total:height});
    }
    await mask.flush();if(renderDistribution){await distribution.flush();stage.distribution=distribution;distribution=null;}
   }finally{renderAllowance();}stages.distributionMaskMs=performance.now()-distributionStarted;
   const regionBytes=regionRetained;regionRetained=0;const freeCounts=countsRelease;countsRelease=null;const storedMask=mask;mask=null;const stageLease=stage.owner.lease();
   analysis={selection,mask:storedMask,distribution:stage.distribution,data:{width,height,gridWidth:selection.gridWidth,gridHeight:selection.gridHeight,numerics:{nearGrowthBoundaries:regions.nearGrowthBoundaries,significanceGuard:1e-9},metadata:{method:'IPOL Noisesniffer',parameters:[w,p.cellSize,p.samplesPerBin,p.lowFrequencyFraction,p.lowNoiseFraction],valid_blocks:stats.validCount,selected_blocks:selection.selectedCount,low_noise_blocks:selection.lowCount,regions:regions.regions,inconclusive:selection.selectedCount===0}},dispose:noisesnifferOwnerRetirement([()=>storedMask.dispose(),()=>stageLease.dispose()],{onRetired(){freeCounts();budget.retained-=regionBytes;}})};
   const ownedAnalysis=analysis;analysis.owner=retainResult({descriptor:{id:crypto.randomUUID()},dispose:()=>ownedAnalysis.dispose()});newAnalysis=analysis;
  }
  lease=analysis.owner.lease();const viewStarted=performance.now();
  if(p.view==='distribution')surface=createRgbSurface(analysis.distribution,{width,height,budget,ownsStore:false});
  else{
   const renderAllowance=budget.reserve(width*32*12+262144);try{output=await createSegmentedBytes(width*height*3,options);for(let y=0;y<height;y+=32){await cooperate();checkAbort(signal);const h=Math.min(32,height-y),m=new Uint8Array(width*h);await analysis.mask.readInto(m,y*width);const part=p.view==='mask'?null:await image.surface.readWindow({x:0,y,width,height:h},{signal});try{const rgb=part?.pixels.data??new Uint8Array(width*h*3);for(let i=0;i<m.length;i++)if(p.view==='mask')rgb.fill(m[i],i*3,i*3+3);else if(m[i])for(let c=0;c<3;c++)rgb[i*3+c]=Math.trunc(Math.fround(rgb[i*3+c]*Math.fround(.55))+(c===0?255*.45:0));await output.write(rgb,y*width*3);}finally{part?.release();}onProgress?.({phase:'noisesniffer-render',completed:y+h,total:height});}await output.flush();surface=createRgbSurface(output,{width,height,budget});output=null;}finally{renderAllowance();}
  }stages.viewMs=performance.now()-viewStarted;
  checkAbort(signal);if(!analysisCached){const old=cache;const next={cacheVersion:2,stats,basis,selectionStage:stage,key,analysis};next.dispose=noisesnifferOwnerRetirement([()=>next.stats?.dispose(),()=>next.basis?.dispose(),()=>next.selectionStage?.owner.dispose(),()=>next.analysis?.owner.dispose()],{onRetired(){next.stats=next.basis=next.selectionStage=next.analysis=null;}});
   if(old){await old.analysis?.owner.dispose();old.analysis=null;if(old.selectionStage!==stage)await old.selectionStage?.owner.dispose();old.selectionStage=null;if(old.basis!==basis)await old.basis?.dispose();old.basis=null;if(old.stats!==stats)await old.stats?.dispose();old.stats=null;}cache=next;createdStats=createdBasis=createdStage=false;newAnalysis=null;
  }
  const held=lease,inner=surface;lease=null;surface=null;let archive;const retireSurface=noisesnifferOwnerRetirement([()=>inner.dispose(),()=>archive?.dispose(),()=>held.dispose()]);
  return {surface:{...inner,dispose:retireSurface},async readNpz(request,hooks){if(retireSurface.started)throw new EngineError('DISPOSED','Noisesniffer result is retiring or released.');archive??=await createNoisesnifferNpzPages(analysis,hooks.provenance,{budget,signal:hooks.signal,onProgress:hooks.onProgress});return archive.read(request,hooks);},noisesnifferCache:cache,data:analysis.data,analysis,semantics,metrics:{...stats.metrics,statisticsCached:statsCached,selectionBasisCached:basisCached,selectionCached,distributionCached:selectionCached,analysisCached,stages,totalMs:performance.now()-started}};
 }catch(error){await Promise.allSettled([surface?.dispose(),output?.dispose(),lease?.dispose(),newAnalysis?.owner.dispose(),mask?.dispose(),distribution?.dispose(),...(createdStage?[stage?.owner.dispose()]:[]),...(createdBasis?[basis?.dispose()]:[]),...(createdStats?[stats?.dispose()]:[])]);countsRelease?.();budget.retained-=regionRetained;throw error;}finally{resident?.();}
}
