import {noisesnifferOwnerRetirement} from './noisesniffer-owner-retirement.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createFloatPlane} from './segmented-float-plane.js';
import {noisesnifferStreamMath,noisesnifferStreamHeapBytes} from './noisesniffer-stream-math.js';
import {retainResult} from './retained-result.js';
function intersect(a,b){const out=[];let i=0,j=0;while(i<a.length&&j<b.length){const l=Math.max(a[i][0],b[j][0]),r=Math.min(a[i][1],b[j][1]);if(l<r)out.push([l,r]);if(a[i][1]<b[j][1])i++;else j++;}return out;}
export function* sourceRegionNoisesnifferBlockCores(domain,w){
 const cols=domain.width-w+1,rows=domain.height-w+1;let active=new Map();
 for(let y=0;y<rows;y++){let spans=[[0,cols]];for(let dy=0;dy<w&&spans.length;dy++)spans=intersect(spans,domain.rowIntervals(y+dy).map(([a,b])=>[a,b-w+1]).filter(([a,b])=>a<b));const next=new Map();for(const[a,b]of spans)for(let x=a;x<b;x+=64){const width=Math.min(64,b-x),key=x+':'+width,prior=active.get(key);if(prior&&prior.height<32)next.set(key,{...prior,height:prior.height+1});else{if(prior)yield prior;next.set(key,{x,y,width,height:1});}}for(const[key,core]of active)if(!next.has(key))yield core;active=next;}yield*active.values();
}
const reflect=(i,n)=>{while(i<0||i>=n)i=i<0?-i:2*n-i-2;return i;};

export async function sourceRegionNoisesnifferStatistics(original,view,domain,w,{budget,signal,onProgress,onRetirementOwner}={}){
 const width=domain.width,height=domain.height,cols=width-w+1,rows=height-w+1,N=cols*rows;requireValue([3,5,7,8].includes(w)&&cols>0&&rows>0&&Number.isSafeInteger(N)&&N<=0xffffffff,'Native Noisesniffer block grid is invalid.');
 const options={budget,signal,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession,chunkBytes:262144},cooperate=createCooperator(signal),owned=[];let extraHeap,staging,valid,means,variance,coverage,coverageOwner,validCount=0,geometryBlocks=0,supportedBlocks=0,sourceReads=0,fftJobs=0,globalFftJobs=0,observedFftContextJobs=0,mean8DftSize=null,fftPlanLease;
 requireValue(onRetirementOwner===undefined||typeof onRetirementOwner==='function','Invalid statistics retirement handoff.');
 let finishConstruction,retirementRequested=false;const constructionDone=new Promise(resolve=>finishConstruction=resolve);
 const retire=noisesnifferOwnerRetirement([()=>constructionDone,()=>valid?.dispose(),()=>means?.dispose(),()=>variance?.dispose(),()=>coverageOwner?coverageOwner.dispose():coverage?.dispose()]);
 const constructionOwner=Object.freeze({dispose(){retirementRequested=true;return retire();}});
 function checkConstruction(){checkAbort(signal);if(retirementRequested)throw new EngineError('DISPOSED','Strict statistics construction is retiring.');}
 async function cover(rect){requireValue(view.includesRectangle(rect),'Native block coverage cannot include a forbidden source observation.');const ones=new Uint8Array(rect.width).fill(1);for(let row=0;row<rect.height;row++)await coverage.write(ones,(rect.y+row)*width+rect.x);}
 try{
  onRetirementOwner?.(constructionOwner);checkConstruction();
  extraHeap=budget.reserve(Math.max(0,12*1024**2-noisesnifferStreamHeapBytes()));staging=budget.reserve(8*1024**2+65536*16+6144);
  valid=await createSegmentedBytes(N,options);owned.push(valid);means=await createFloatPlane(cols*3,rows,options);owned.push(means);variance=await createFloatPlane(cols,rows*3,{...options,ArrayType:Float32Array});owned.push(variance);coverage=await createSegmentedBytes(width*height,options);
  const math=await noisesnifferStreamMath(),extrema=[255,255,255,0,0,0];await view.visitIncluded(async pixels=>{checkConstruction();sourceReads++;for(let i=0;i<pixels.data.length;i++){const c=i%3,value=pixels.data[i];extrema[c]=Math.min(extrema[c],value);extrema[c+3]=Math.max(extrema[c+3],value);}},{signal,windowPixels:65536});
  for(const core of sourceRegionNoisesnifferBlockCores(domain,w)){
   await cooperate();checkConstruction();const rect={x:core.x,y:core.y,width:core.width+w-1,height:core.height+w-1},lease=await view.readWindow(rect,{signal});sourceReads++;let failed=false,primary;
   try{const stats=math.blocks(lease.pixels.data,rect.width,rect.height,w,extrema);checkConstruction();for(let row=0;row<core.height;row++)await valid.write(stats.valid.subarray(row*core.width,(row+1)*core.width),(core.y+row)*cols+core.x);if(w!==8)await means.write(stats.means,core.x*3,core.y,core.width*3,core.height,{signal,cooperate});for(let c=0;c<3;c++)await variance.write(stats.variance.subarray(c*core.width*core.height,(c+1)*core.width*core.height),core.x,c*rows+core.y,core.width,core.height,{signal,cooperate});geometryBlocks+=core.width*core.height;if(w!==8){supportedBlocks+=core.width*core.height;await cover(rect);}onProgress?.({phase:'source-region-noisesniffer-statistics',completed:geometryBlocks,total:N});}catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners([()=>lease.release()],failed?{primary}:{});}checkConstruction();
  }
  if(w===8){const dw=math.optimal(Math.min(249,width)+7),dh=math.optimal(Math.min(249,height)+7),bw=Math.min(dw-7,width),bh=Math.min(dh-7,height),tileCols=Math.ceil(width/bw),tileRows=Math.ceil(height/bh);mean8DftSize=[dw,dh];requireValue(Number.isSafeInteger(tileCols*tileRows),'Native Noisesniffer FFT tile addressing is invalid.');fftPlanLease=budget.reserve(tileCols*tileRows);const completeTiles=new Uint8Array(tileCols*tileRows);let needsContexts=false;
   for(let y=0;y<height;y+=bh)for(let x=0;x<width;x+=bw){await cooperate();checkConstruction();const tw=Math.min(bw,width-x),th=Math.min(bh,height-y),left=Math.max(x,4),top=Math.max(y,4),right=Math.min(x+tw,cols+4),bottom=Math.min(y+th,rows+4);if(left>=right||top>=bottom)continue;const xs=Array.from({length:tw+7},(_,k)=>reflect(x+k-4,width)),ys=Array.from({length:th+7},(_,k)=>reflect(y+k-4,height)),sx=Math.min(...xs),sy=Math.min(...ys),sw=Math.max(...xs)-sx+1,sh=Math.max(...ys)-sy+1,rect={x:sx,y:sy,width:sw,height:sh};
    if(!view.includesRectangle(rect)){needsContexts=true;continue;}completeTiles[Math.floor(y/bh)*tileCols+Math.floor(x/bw)]=1;
    const lease=await view.readWindow(rect,{signal});sourceReads++;let failed=false,primary;try{const rgb=new Uint8Array((tw+7)*(th+7)*3);for(let yy=0;yy<th+7;yy++)for(let xx=0;xx<tw+7;xx++){const at=((ys[yy]-sy)*sw+xs[xx]-sx)*3;rgb.set(lease.pixels.data.subarray(at,at+3),(yy*(tw+7)+xx)*3);}const result=math.mean8(rgb,tw,th,dw,dh,bh);checkConstruction();const values=new Float64Array((right-left)*(bottom-top)*3);for(let yy=top;yy<bottom;yy++)values.set(result.means.subarray(((yy-y)*tw+left-x)*3,((yy-y)*tw+right-x)*3),(yy-top)*(right-left)*3);await means.write(values,(left-4)*3,top-4,(right-left)*3,bottom-top,{signal,cooperate});supportedBlocks+=(right-left)*(bottom-top);fftJobs++;globalFftJobs++;await cover({x:left-4,y:top-4,width:right-left+7,height:bottom-top+7});}catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners([()=>lease.release()],failed?{primary}:{});}checkConstruction();
   }
   // Only the old whole tile's memory admission changes. Each fallback input
   // is a REAL rectangular set of complete8x8 blocks. FFT dimensions, kernel,
   // global IDs/population and NFA area remain the encompassing native grid.
   // The native zero padding is outside this input context, never a source RGB.
   if(needsContexts)for(const core of sourceRegionNoisesnifferBlockCores(domain,w))for(let y=core.y;y<core.y+core.height;){const ty=Math.floor((y+4)/bh),bottom=Math.min(core.y+core.height,(ty+1)*bh-4);
    for(let x=core.x;x<core.x+core.width;){const tx=Math.floor((x+4)/bw),right=Math.min(core.x+core.width,(tx+1)*bw-4),cw=right-x,ch=bottom-y;
     if(!completeTiles[ty*tileCols+tx]){await cooperate();checkConstruction();const rect={x,y,width:cw+7,height:ch+7};requireValue(view.includesRectangle(rect),'An observed FFT context includes a forbidden source observation.');const lease=await view.readWindow(rect,{signal});sourceReads++;let failed=false,primary;
      try{const result=math.mean8(lease.pixels.data,cw,ch,dw,dh,bh);checkConstruction();await means.write(result.means,x*3,y,cw*3,ch,{signal,cooperate});supportedBlocks+=cw*ch;fftJobs++;observedFftContextJobs++;await cover(rect);onProgress?.({phase:'source-region-noisesniffer-mean8-context',rect,output:{x,y,width:cw,height:ch},dftSize:[dw,dh],nativeBlockHeight:bh,completed:supportedBlocks,total:geometryBlocks});}catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners([()=>lease.release()],failed?{primary}:{});}checkConstruction();
     }x=right;
    }y=bottom;
   }

  }
  await valid.flush();await coverage.flush();let coveragePixels=0;await valid.visit(bytes=>{for(const value of bytes)validCount+=value;},{signal,blockBytes:65536,cooperate});await coverage.visit(bytes=>{for(const value of bytes)coveragePixels+=value;},{signal,blockBytes:65536,cooperate});checkConstruction();
  const ownedCoverage=coverage;coverageOwner=retainResult({descriptor:{id:crypto.randomUUID()},dispose:()=>ownedCoverage.dispose()});coverage=null;
  return{width:cols,height:rows,blockSize:w,validCount,valid,means,variance,extrema,coverage:ownedCoverage,coverageOwner,metrics:{sourceRegionStatistics:true,selectedPixels:domain.countIncluded,geometryBlocks,supportedBlocks,validBlocks:validCount,coveragePixels,sourceReads,fftJobs,...(w===8?{globalFftJobs,observedFftContextJobs,mean8DftSize}:{}),mean8Policy:w===8?observedFftContextJobs?'unchanged-global-FFT-size-observed-rectangular-contexts':'unchanged-global-FFT-tiles-with-complete-admitted-input':'native-global-extrema-local-block-kernel'},dispose:constructionOwner.dispose};
 }catch(error){finishConstruction();await retireCompositeOwners([retire],{primary:error});throw error;}
 finally{finishConstruction();fftPlanLease?.();staging?.();extraHeap?.();}
}
