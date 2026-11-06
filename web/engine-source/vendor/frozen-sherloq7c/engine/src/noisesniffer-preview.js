import {noisesnifferParams,noisesnifferRegions} from './noisesniffer.js';
import {noisesnifferBasisKey} from './noisesniffer-selection-basis.js';
import {noisesnifferStreamMath} from './noisesniffer-stream-math.js';
import {cachedPreviewGeometry,reservePreview,sampleCachedSource,previewUnavailable} from './cached-parameter-preview.js';
import {sampleStoredPixels} from './display-sampling.js';
import {checkAbort,createCooperator,EngineError} from './errors.js';
const prepaidBudget={reserve:()=>()=>{}};
const parameters=p=>[p.blockSize,p.cellSize,p.samplesPerBin,p.lowFrequencyFraction,p.lowNoiseFraction];
const same=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((value,index)=>value===b[index]);
async function stored(store,format,width,height,g,signal){const part=await sampleStoredPixels(store,{width,height,format},g,{budget:prepaidBudget,signal});try{return{...part.pixels,data:part.pixels.data.slice()};}finally{part.release();}}
/** Presentation draft only. Matching views sample the exact native stores;
 * changed grouping borrows native sorted candidates without DCT, sorting or
 * patch extraction. A cold basis is rejected so its caller can explicitly use
 * a distinct derived source rather than mislabel stale statistics as current. */
export async function previewCachedNoisesniffer(image,cache,input,preview,{budget,signal,onProgress,sourceRegion}={}){
 const p=noisesnifferParams(input),analysis=cache?.analysis,descriptor=image.surface?.descriptor??image.pixels,width=descriptor?.width,height=descriptor?.height,basis=cache?.basis,exactNative=same(analysis?.data?.metadata?.parameters,parameters(p));
 if(!analysis||!exactNative&&basis?.key!==noisesnifferBasisKey(p))previewUnavailable('The requested native Noisesniffer selection basis is not retained.');
 const domain=sourceRegion?.domain,original=sourceRegion?.original;
 if(cache.sourceRegionIdentity){const expected=domain&&JSON.stringify(p.blockSize===8?[domain.sourceSha256,domain.fingerprint,'observed-native-FFT-contexts-v1']:[domain.sourceSha256,domain.fingerprint]);if(!domain||!original||cache.sourceRegionIdentity!==expected||!cache.stats?.coverage||domain.width!==width||domain.height!==height)previewUnavailable('The retained Noisesniffer coverage belongs to another source domain.');}
 const g=cachedPreviewGeometry(width,height,preview,budget,{bytesPerPixel:512,fixedBytes:8*1024**2+Math.max(width*32,(basis?.b??0)*12)}),release=reservePreview(budget,g.reservedBytes),cooperate=createCooperator(signal);let held,pixels,details;
 try{
  checkAbort(signal);held=analysis.owner.lease();
  if(exactNative){
   if(p.view==='distribution')pixels=await stored(analysis.distribution,'rgb8',width,height,g,signal);
   else{const mask=await stored(analysis.mask,'mask8',width,height,g,signal);pixels=p.view==='mask'?{width:g.width,height:g.height,format:'rgb8',data:new Uint8Array(g.pixels*3)}:await sampleCachedSource(image,g,{signal});for(let i=0;i<g.pixels;i++){if((i&4095)===0)await cooperate();if(p.view==='mask')pixels.data.fill(mask.data[i],i*3,i*3+3);else if(mask.data[i])for(let c=0;c<3;c++)pixels.data[i*3+c]=Math.trunc(Math.fround(pixels.data[i*3+c]*Math.fround(.55))+(c===0?255*.45:0));}}
   details={exactNativeSamples:true,groupingApproximate:false,sampledCandidateCount:0};
  }else{
   const cellSize=Math.max(p.cellSize,Math.ceil(Math.max(width,height)/Math.max(g.width,g.height))),gw=Math.floor(width/cellSize)+1,gh=Math.floor(height/cellSize)+1,all_blocks=new Float64Array(gw*gh),low_noise_blocks=new Float64Array(gw*gh),marks=new Uint8Array(g.pixels),binStep=Math.max(1,Math.ceil((basis.candidateCount??basis.validCount*3)/(g.pixels*4)),Math.ceil(basis.bins*3/Math.max(1,g.pixels))),bins=Math.ceil(basis.bins*3/binStep),perBin=Math.max(1,Math.floor(g.pixels*4/Math.max(1,bins))),limit=Math.trunc(basis.b*p.lowFrequencyFraction*p.lowNoiseFraction);let sampled=0,approximate=binStep>1||cellSize!==p.cellSize;
   const add=(id,weight,low)=>{const y=Math.floor(id/basis.width),x=id%basis.width,cell=Math.floor(y/cellSize)*gw+Math.floor(x/cellSize);all_blocks[cell]+=weight;if(low)low_noise_blocks[cell]+=weight;const left=Math.floor(x/g.step),top=Math.floor(y/g.step),right=Math.min(g.width,Math.max(left+1,Math.ceil((x+p.blockSize)/g.step))),bottom=Math.min(g.height,Math.max(top+1,Math.ceil((y+p.blockSize)/g.step)));for(let yy=top;yy<bottom;yy++)for(let xx=left;xx<right;xx++)marks[yy*g.width+xx]|=low?3:1;};
   for(let index=0;index<basis.bins*3;index+=binStep){await cooperate();const {ids,flat}=await basis.read(index,{signal});if(flat<limit){const stride=Math.max(1,Math.ceil(ids.length/perBin));approximate||=stride>1;for(let i=0;i<ids.length;i+=stride){if((sampled&1023)===0)await cooperate();add(ids[i],stride*binStep,i<limit);sampled++;}}}
   if(p.view==='distribution'){pixels=await sampleCachedSource(image,g,{signal});for(let i=0;i<marks.length;i++)if(marks[i]&2)pixels.data.set([255,0,0],i*3);else if(marks[i]&1)pixels.data.fill(255,i*3,i*3+3);}
   else{let retainedCells=0;const regions=await noisesnifferRegions(width,height,p.blockSize,cellSize,p.lowNoiseFraction,{gridWidth:gw,gridHeight:gh,all_blocks,low_noise_blocks},{signal,tail:(await noisesnifferStreamMath()).tail,materializeMask:false,retainRegion:n=>{retainedCells+=n;if(retainedCells>Math.max(4,g.pixels*4))throw new EngineError('MEMORY_LIMIT','The provisional Noisesniffer region list exceeds its admitted preview workspace.');}});pixels=p.view==='mask'?{width:g.width,height:g.height,format:'rgb8',data:new Uint8Array(g.pixels*3)}:await sampleCachedSource(image,g,{signal});for(let y=0;y<g.height;y++){await cooperate();for(let x=0;x<g.width;x++){const at=(y*g.width+x)*3,on=regions.grid[Math.floor(y*g.step/cellSize)*gw+Math.floor(x*g.step/cellSize)]!==0;if(p.view==='mask')pixels.data.fill(on?255:0,at,at+3);else if(on)for(let c=0;c<3;c++)pixels.data[at+c]=Math.trunc(Math.fround(pixels.data[at+c]*Math.fround(.55))+(c===0?255*.45:0));}}}
   details={exactNativeSamples:!approximate,groupingApproximate:approximate,nativeBlockSize:p.blockSize,previewCellSize:cellSize,nativeCellSize:p.cellSize,sampledCandidateCount:sampled,nativeCandidateCount:basis.candidateCount,binStep};
  }
  // Coverage belongs to the native statistics, not to the provisional cell
  // grid. Presentation may read Original outside coverage; those observations
  // never enter candidates, bins, DCT, FFT or region growth above.
  if(cache.sourceRegionIdentity){
   const coverage=await stored(cache.stats.coverage,'mask8',width,height,g,signal),background=await sampleCachedSource(original,{...g,x:domain.origin[0],y:domain.origin[1]},{signal});let admitted=0;
   for(let i=0;i<g.pixels;i++){if((i&4095)===0)await cooperate();if(coverage.data[i])admitted++;else pixels.data.set(background.data.subarray(i*3,i*3+3),i*3);}
   details={...details,strictSourceRegions:true,sourceRegionFingerprint:domain.fingerprint,sampledAnalysedPixels:admitted,sampledOriginalPixels:g.pixels-admitted};
  }
  checkAbort(signal);onProgress?.({phase:'noisesniffer-preview',completed:1,total:1});checkAbort(signal);return{pixels:{...pixels,logicalWidth:width,logicalHeight:height},exact:false,metrics:{cacheOnly:true,nativeAnalysisCalls:0,inferenceCalls:0,statisticsCalls:0,sortCalls:0,patchCalls:0,scientificFinalChanged:false,admittedPreviewBytes:g.bytes,sampleDimensions:[g.width,g.height],...details},preview:{provisional:true,...details}};
 }finally{try{await held?.dispose();}finally{release();}}
}
