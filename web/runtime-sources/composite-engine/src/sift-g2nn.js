import {boundedG2nn} from './sift-g2nn-bounded.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';

import {TypedPages,finishCorrespondences} from './m3-typed-pages.js';
// This primitive deliberately accepts only OpenCV's integer-valued SIFT,
// never normalized RootSIFT or a learned descriptor under the SIFT name.
export async function siftG2nnMatch({points,descriptors,members,zoneCount,radius,minimum,ratio,
  compare=false,radii=null,gap=[0,0],axes=null,variants=null},
  {signal,onProgress,reserveMemory,maxPairs=Number.MAX_SAFE_INTEGER,backend='cpu'}={}){
  requireValue(typeof reserveMemory==='function','G2NN requires shared memory admission.');
  requireValue((points instanceof Float32Array||points instanceof Float64Array)&&points.length%7===0,'Invalid packed SIFT points.');
  const count=points.length/7;
  requireValue(descriptors instanceof Float32Array&&descriptors.length===count*128,'Invalid SIFT descriptors.');
  requireValue(Number.isSafeInteger(zoneCount)&&zoneCount>=1&&zoneCount<=10000&&members instanceof Uint8Array&&members.length===count*zoneCount,'Invalid zone membership.');
  requireValue(typeof compare==='boolean'&&(!compare||zoneCount===2),'Compare requires exactly two zones.');
  requireValue(Number.isFinite(radius)&&radius>=0&&Number.isFinite(minimum)&&minimum>=0&&Number.isFinite(ratio)&&ratio>0&&ratio<=1,'Invalid G2NN distances or ratio.');
  requireValue(Array.isArray(gap)&&gap.length===2&&gap.every(Number.isFinite),'Invalid comparison gap.');
  requireValue(radii===null||radii.length===zoneCount&&Array.from(radii).every(x=>Number.isFinite(x)&&x>=0),'Invalid zone radii.');
  requireValue(variants===null||variants instanceof Uint8Array&&variants.length===count&&variants.every(x=>x<=1),'Invalid reflection frames.');
  requireValue(axes===null||axes.length===2&&axes.every(a=>(a instanceof Float32Array||a instanceof Float64Array)&&a.length>0&&a.every(Number.isFinite)),'Invalid compact axes.');
  requireValue(Number.isSafeInteger(maxPairs)&&maxPairs>=0&&maxPairs<=Number.MAX_SAFE_INTEGER,'Invalid correspondence limit.');
  checkAbort(signal);
  for(const x of points)requireValue(Number.isFinite(x),'Nonfinite SIFT point.');
  for(const x of descriptors)requireValue(Number.isInteger(x)&&x>=0&&x<=255,'G2NN requires quantized OpenCV SIFT descriptors.');
  for(const x of members)requireValue(x<=1,'Invalid zone membership value.');
  // Includes WASM staging, rounded heap growth, JS descriptors/coordinates,
  // indices and job lists. No image-sized or quadratic distance matrix.
  const workingBytes=count*(128+16)*2+members.length*16+4*1024**2;
  try{if(workingBytes>1024**3)throw new EngineError('MEMORY_LIMIT','Global G2NN staging exceeds the WASM address space.');reserveMemory(workingBytes);}
  catch(error){if(error.code!=='MEMORY_LIMIT'||backend==='webgpu')throw error;return boundedG2nn({points,descriptors,members,zoneCount,radius,minimum,ratio,compare,radii,gap,axes,variants},{signal,onProgress,reserveMemory,maxPairs,reason:'global-staging-admission'});}
  const coords=new Float64Array(count*2),quantized=new Uint8Array(descriptors);
  const interpolate=(x,a)=>{const left=Math.max(0,Math.min(a.length-1,Math.floor(x))),right=Math.min(a.length-1,left+1);return x<=0?a[0]:x>=a.length-1?a[a.length-1]:a[left]+(x-left)*(a[right]-a[left]);};
  for(let i=0;i<count;i++)for(let d=0;d<2;d++)coords[i*2+d]=axes?interpolate(points[i*7+d],axes[d]):points[i*7+d];
  const zones=Array.from({length:zoneCount},(_,zone)=>{const ids=[];for(let i=0;i<count;i++)if(members[i*zoneCount+zone])ids.push(i);return ids;});
  const jobs=compare?[{q:zones[0],t:zones[1],zone:-1,radius,gap},{q:zones[1],t:zones[0],zone:-1,radius,gap:gap.map(x=>-x)}]:zones.map((ids,zone)=>({q:ids,t:ids,zone,radius:radii?Math.min(radius,radii[zone]):radius,gap:[0,0]}));
  const searches=variants?jobs.flatMap(job=>[0,1].map(frame=>({...job,q:job.q.filter(i=>variants[i]===frame),t:job.t.filter(i=>variants[i]!==frame)}))):jobs;
  const total=searches.reduce((n,job)=>n+job.q.length,0);let done=0,evaluated=0,lastYield=performance.now();
  const pairs=new TypedPages(Float64Array,5,reserveMemory);let module,gpu,sp=0,batchStart=-1,gpuBatches=0,gpuFailure=null,dp=0,cp=0,tp=0,op=0;
  const allocate=n=>{const p=module._malloc(Math.max(8,n));if(!p)throw new EngineError('MEMORY_LIMIT','G2NN staging allocation failed.');return p;};
  const stage=(p,a)=>module.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);
  try{
    const {default:create}=await import('../vendor/sift-g2nn/sift-g2nn.js');
    module=await create();checkAbort(signal);
    dp=allocate(quantized.byteLength);cp=allocate(coords.byteLength);tp=allocate(count*4);op=allocate(12*8);
    stage(dp,quantized);stage(cp,coords);
    if(backend!=='cpu'&&count){try{const {createHammingGpu}=await import('./cloning-hamming-gpu.js');gpu=await createHammingGpu(quantized,128,{signal,account:reserveMemory,mode:'sift'});sp=allocate(count*gpu.batchRows*4);}catch(error){checkAbort(signal);gpu?.dispose();gpu=null;if(backend==='webgpu')throw error;gpuFailure=error.message;}}
    for(const job of searches){
      if(job.t.length<2){done+=job.q.length;onProgress?.(done/Math.max(1,total));checkAbort(signal);continue;}
      stage(tp,Uint32Array.from(job.t));
      for(const i of job.q){
        checkAbort(signal);
        if(performance.now()-lastYield>=8){await controlCheckpoint(signal);lastYield=performance.now();}
        if(gpu&&Math.floor(i/gpu.batchRows)*gpu.batchRows!==batchStart){try{batchStart=Math.floor(i/gpu.batchRows)*gpu.batchRows;stage(sp,await gpu.batch(batchStart,Math.min(gpu.batchRows,count-batchStart)));gpuBatches++;}catch(error){checkAbort(signal);gpu.dispose();gpu=null;if(backend==='webgpu')throw error;gpuFailure=error.message;}}
        evaluated+=(gpu?module._sift_g2nn_precomputed:module._sift_g2nn_top4)(gpu?sp+(i-batchStart)*count*4:dp,cp,tp,job.t.length,i,minimum,job.radius,...job.gap,points instanceof Float32Array&&!axes?1:0,op);
        const nearest=[];
        for(let k=0;k<4;k++){const at=op/8+k*3,j=module.HEAPF64[at],d=module.HEAPF64[at+1];if(Number.isFinite(d))nearest.push([j,d,module.HEAPF64[at+2]]);}
        nearest.sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
        let cutoff=0;
        for(let k=0;k<nearest.length-1;k++)if(nearest[k+1][1]>nearest[0][1]/ratio){cutoff=k+1;break;}
        for(let k=0;k<cutoff;k++){
          const [j,d,distance]=nearest[k],a=Math.min(i,j),b=Math.max(i,j);
          pairs.push(a,b,d/(512*Math.sqrt(2)),distance,job.zone);
        }
        done++;onProgress?.(done/Math.max(1,total));
      }
    }
    checkAbort(signal);const {pairs:output,pairSearchRegions:owners}=finishCorrespondences(pairs,{deduplicate:true,maxPairs});
    onProgress?.(1);checkAbort(signal);
    return {pairs:output,pairSearchRegions:owners,candidateComparisons:evaluated,backend:gpuBatches?'hybrid':'cpu',metadata:{gpuBatches,gpuFailure,integerDescriptorDistance:true,spatialArithmetic:'native-float64'},preflightExecutions:0};
  }finally{pairs.dispose();gpu?.dispose();if(module)for(const p of [dp,cp,tp,op,sp])if(p)module._free(p);}
}

// Descriptors must have been extracted from mirrored pixels. This helper only
// maps their point metadata back; it cannot synthesize reflection invariance.
export function remapReflectedSiftPoints(points,width){
  requireValue((points instanceof Float32Array||points instanceof Float64Array)&&points.length%7===0&&Number.isSafeInteger(width)&&width>0,'Invalid reflected SIFT points.');
  const result=points.slice(),round=points instanceof Float32Array?Math.fround:x=>x;
  for(let i=0;i<result.length;i+=7){result[i]=round(width-1-result[i]);const angle=round(180-result[i+3]);result[i+3]=angle<0?angle%360+360:angle%360;}
  return result;
}
