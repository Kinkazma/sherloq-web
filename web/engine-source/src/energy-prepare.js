import {selectFloat32Ranks} from './float32-ranks-stream.js';
import {energyArrayPairwise} from './energy-statistics.js';
// Exact numerical preparation; full ELA-energy API qualification is separate.
import {detectPanels} from './auto-zones.js';
import {gray} from './pixel-utils.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
const f=Math.fround;
// NumPy float32 pairwise reductions preserve input order, within 8192-value chunks.
function pairwise(get,start,n,cast){
 if(n<8){let s=-0;for(let i=0;i<n;i++)s=cast(s+get(start+i));return s;}
 if(n<=128){const r=new Float64Array(8);for(let j=0;j<8;j++)r[j]=get(start+j);let i=8;for(;i<n-n%8;i+=8)for(let j=0;j<8;j++)r[j]=cast(r[j]+get(start+i+j));let s=cast(cast(cast(r[0]+r[1])+cast(r[2]+r[3]))+cast(cast(r[4]+r[5])+cast(r[6]+r[7])));for(;i<n;i++)s=cast(s+get(start+i));return s;}
 let cut=Math.floor(n/2);cut-=cut%8;return cast(pairwise(get,start,cut,cast)+pairwise(get,start+cut,n-cut,cast));
}
export function energyQuantile(sorted,count,q){const at=(count-1)*q,lo=Math.floor(at),t=at-lo,a=sorted[lo],b=sorted[Math.min(lo+1,count-1)],d=f(b-a);return t>=.5?b-d*(1-t):a+d*t;}
export async function prepareEnergy(image,planes,quantiles,log,{signal,onProgress,account=()=>{},panelDetector=detectPanels,minimumPanelSamples=64,draftSourceScope,panelIds,onTiming,scoreGpu,scoreBackend='webgpu',onGpuSubmitted,rankSelection=true,arrayStatistics=true}={}){
 const {width:w,height:h,data}=image,n=w*h;
 requireValue(image.format==='rgb8'&&Number.isInteger(w)&&Number.isInteger(h)&&w>0&&h>0&&Number.isSafeInteger(n)&&n<2**31&&data instanceof Uint8Array&&data.length===3*n,'RGB8 image required');
 requireValue(planes instanceof Float32Array&&planes.length===3*n&&typeof log==='function','Three energy planes and qualified logarithm required');
 requireValue(Array.isArray(quantiles)&&quantiles.length===2&&Number.isFinite(quantiles[0])&&Number.isFinite(quantiles[1])&&quantiles[0]>=0&&quantiles[0]<=.5&&quantiles[1]>=.5&&quantiles[1]<=1,'Energy histogram bounds must lie in [0,.5] and [.5,1]');
 requireValue(Number.isSafeInteger(minimumPanelSamples)&&minimumPanelSamples>=1&&minimumPanelSamples<=64&&(!draftSourceScope||draftSourceScope instanceof Int32Array&&draftSourceScope.length===n),'Invalid draft panel support');
 const scoreProvider=scoreGpu;let scoreCpuMs=0;if(scoreGpu?.selectBackend&&scoreGpu.selectBackend(n,scoreBackend)!=='webgpu')scoreGpu=null;
 const mark=(key,start)=>onTiming?.(key,performance.now()-start);let phaseStart=performance.now();
 checkAbort(signal);let lastYield=performance.now();const checkpoint=async()=>{checkAbort(signal);if(performance.now()-lastYield>=8){await controlCheckpoint(signal);lastYield=performance.now();}};
 for(let i=0;i<planes.length;i++){requireValue(Number.isFinite(planes[i])&&planes[i]>=0&&planes[i]<=255,'Energy outside RGB8 residual domain');if((i&8191)===0)await checkpoint();}
 mark('energyInputValidationMs',phaseStart);phaseStart=performance.now();
 let polygons=await panelDetector(image,{signal,account});if(!polygons.length)polygons=[[[0,0],[w-1,0],[w-1,h-1],[0,h-1]]];
 mark('energyPanelGeometryMs',phaseStart);phaseStart=performance.now();
 requireValue(panelIds===undefined||Array.isArray(panelIds)&&panelIds.length===polygons.length&&new Set(panelIds).size===panelIds.length&&panelIds.every(id=>Number.isSafeInteger(id)&&id>0&&id<2**31),'Invalid draft panel identity');
 account((45-(rankSelection?8:0)-(scoreGpu?12:0))*n+8192+polygons.length*2048);const valid=new Uint8Array(n),scope=new Int32Array(n),ids=new Uint32Array(n),values=new Float32Array(n),sorted=rankSelection?null:new Float32Array(n),scratch=rankSelection?null:new Float32Array(n),subset=new Float32Array(n),scores=scoreGpu?null:new Float32Array(3*n),low=new Float32Array(n),high=new Float32Array(n),hist=new Uint32Array(256),positions=new Uint32Array(256),summaries=[];
 for(let i=0;i<n;i++){const g=gray(data[i*3],data[i*3+1],data[i*3+2]);valid[i]=g>3&&g<252?1:0;if((i&8191)===0)await checkpoint();}
 mark('energyValidMaskMs',phaseStart);
 const statistics=async(count)=>{let total=0;for(let start=0;start<count;start+=8192){const length=Math.min(8192,count-start);total=f(total+(arrayStatistics?energyArrayPairwise(subset,start,length,0):pairwise(i=>subset[i],start,length,f)));await checkpoint();}const mean=f(total/count);total=0;for(let start=0;start<count;start+=8192){const length=Math.min(8192,count-start);total=f(total+(arrayStatistics?energyArrayPairwise(subset,start,length,mean,true):pairwise(i=>{const d=f(subset[i]-mean);return f(d*d);},start,length,f)));await checkpoint();}return{mean,variance:f(total/count)};};
 async function sort(count){
  // Residual energies are finite nonnegative float32: unsigned bits sort numerically.
  const a=new Uint32Array(sorted.buffer),b=new Uint32Array(scratch.buffer);a.set(new Uint32Array(values.buffer,0,count));let source=a,destination=b;
  for(let shift=0;shift<32;shift+=8){hist.fill(0);for(let i=0;i<count;i++){hist[(source[i]>>>shift)&255]++;if((i&8191)===0)await checkpoint();}let total=0;for(let j=0;j<256;j++){positions[j]=total;total+=hist[j];}for(let i=0;i<count;i++){const word=source[i];destination[positions[(word>>>shift)&255]++]=word;if((i&8191)===0)await checkpoint();}[source,destination]=[destination,source];}
 }
 for(let index=0;index<polygons.length;index++){
  const polygon=polygons[index],x0=polygon[0][0],y0=polygon[0][1],x1=polygon[2][0],y1=polygon[2][1],panelId=panelIds?.[index]??index+1;let count=0;const selectionStart=performance.now();
  for(let y=y0;y<=y1;y++){for(let x=x0;x<=x1;x++){const i=y*w+x;if(valid[i]&&(!draftSourceScope||draftSourceScope[i]===panelId))ids[count++]=i;if((x&8191)===0)await checkpoint();}await checkpoint();}
  if(count<minimumPanelSamples){mark('energySelectionMs',selectionStart);continue;}
  for(let y=y0;y<=y1;y++){for(let x=x0;x<=x1;x++){const i=y*w+x;if(!draftSourceScope||draftSourceScope[i]===panelId)scope[i]=valid[i]?panelId:0;if((x&8191)===0)await checkpoint();}await checkpoint();}
  mark('energySelectionMs',selectionStart);const probes=[];
  for(let q=0;q<3;q++){
   phaseStart=performance.now();
   for(let j=0;j<count;j++){values[j]=planes[q*n+ids[j]];if((j&8191)===0)await checkpoint();}
   let q10,q90;
   if(rankSelection){
    const store={byteLength:count*4,readInto(target,offset=0){target.set(new Uint8Array(values.buffer,values.byteOffset+offset,target.byteLength));return target;}};
    const ranks=quantiles.flatMap(value=>{const lo=Math.floor((count-1)*value);return[lo,Math.min(lo+1,count-1)];});
    const endpoints=await selectFloat32Ranks(store,count,ranks,{budget:{reserve:bytes=>{const free=account(bytes);return typeof free==='function'?free:()=>{};}},signal,maximum:255});
    [q10,q90]=quantiles.map((value,index)=>{const at=(count-1)*value;return energyQuantile(Float32Array.of(endpoints[index*2],endpoints[index*2+1]),2,at-Math.floor(at));});
   }else{await sort(count);q10=energyQuantile(sorted,count,quantiles[0]);q90=energyQuantile(sorted,count,quantiles[1]);}
   mark('energyGatherSortMs',phaseStart);phaseStart=performance.now();
   const l=f(q10),u=f(q90);let size=0;
   for(let j=0;j<count;j++){if(values[j]>=l&&values[j]<=u)subset[size++]=values[j];if((j&8191)===0)await checkpoint();}
   const center=size?await statistics(size):{mean:(q10+q90)/2,variance:0};size=0;
   for(let j=0;j<count;j++){if(values[j]<=l)subset[size++]=values[j];if((j&8191)===0)await checkpoint();}const dark=await statistics(size);size=0;
   for(let j=0;j<count;j++){if(values[j]>=u)subset[size++]=values[j];if((j&8191)===0)await checkpoint();}const bright=await statistics(size);mark('energyStatisticsMs',phaseStart);phaseStart=performance.now();
   if(!scoreGpu)for(let y=y0;y<=y1;y++){for(let x=x0;x<=x1;x++){const i=y*w+x;if(!draftSourceScope||draftSourceScope[i]===panelId)scores[q*n+i]=valid[i]?f(log(f(f(center.mean+.25)/f(planes[q*n+i]+.25)))/f(.2)):0;if((x&8191)===0)await checkpoint();}await checkpoint();}
   scoreCpuMs+=performance.now()-phaseStart;mark('energyScoreMapMs',phaseStart);probes.push({q10,q90,central_mean:center.mean,central_variance:center.variance,low_mean:dark.mean,low_variance:dark.variance,high_mean:bright.mean,high_variance:bright.variance});
  }
  summaries.push({id:panelId,bbox:[x0,y0,x1+1,y1+1],probes});onProgress?.((index+1)/polygons.length);
 }
 if(scoreGpu){
  const runtime=await (scoreGpu.runScores??scoreGpu.run).call(scoreGpu,planes,scope,summaries,{low,high,log,signal,backend:scoreBackend,onSubmitted:detail=>onGpuSubmitted?.({phase:'energy-score-gpu-submitted',...detail})});
  mark('energyGpuScoresMs',phaseStart);checkAbort(signal);
  scoreProvider.observeScore?.(n,runtime.backend.startsWith('webgpu')?'webgpu':'cpu',runtime.totalMs??performance.now()-phaseStart);
  const result={energy_low_score:low,energy_high_score:high,energy_scope:scope,energy_summary:summaries};Object.defineProperty(result,'scoreRuntime',{value:runtime});return result;
 }
 phaseStart=performance.now();
 // For three finite scores, median commutes with positive clipping and sign flip.
 // Retain the signed planes once rather than six separately clipped planes.
 for(let i=0;i<n;i++){const x=scores[i],y=scores[n+i],z=scores[2*n+i],m=x>y?(y>z?y:Math.min(x,z)):(x>z?x:Math.min(y,z));low[i]=Math.max(m,0);high[i]=Math.max(-m,0);if((i&8191)===0)await checkpoint();}
 scoreCpuMs+=performance.now()-phaseStart;mark('energyMedianMs',phaseStart);checkAbort(signal);scoreProvider?.observeScore?.(n,'cpu',scoreCpuMs);const result={energy_low_score:low,energy_high_score:high,energy_scope:scope,energy_summary:summaries};if(scoreProvider)Object.defineProperty(result,'scoreRuntime',{value:{backend:'cpu-native-energy-scores',totalMs:scoreCpuMs}});return result;
}

// Shared exact NumPy-order reduction for bounded panel streams.
export {pairwise as energyPairwise};
