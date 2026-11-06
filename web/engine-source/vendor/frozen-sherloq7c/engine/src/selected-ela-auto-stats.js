import {retireCompositeOwners} from './composite-owner-release.js';
import {getRecompressionGrayGpu} from './recompression-gray-gpu.js';
import {createSelectedRgbRecompression,resolveSelectedPlan} from './recompression-probe.js';
import {recompressionParallelPlan} from './recompression-codec-client.js';
import {runRecompressionLanes} from './recompression-parallel.js';
import {createSourceRegionView} from './source-region-view.js';
import {prepareSourceRegionDomain} from './source-region-dispatch.js';
import {createSourceRegionJpegContextImage} from './source-region-ela.js';
import {validateParams} from './ela.js';
import {requireValue,checkAbort,createCooperator} from './errors.js';
// Native linear ELA with scale1/contrast0 is exactly RGB absdiff. Histogram
// directly from the true selected codec pair avoids a rendered RGB surface,
// palette LUT, duplicate source read and RPC per output window.
export async function selectedElaAutoStats(original,{requests,sourceRegionDomain,maximumSamples=102400,windowPixels=8192,backend='auto'}={}, {budget,maxWorkers=1,signal,onProgress}={}){
 requireValue(Array.isArray(requests)&&requests.length>0&&requests.length<=256&&Number.isSafeInteger(maximumSamples)&&maximumSamples>0&&maximumSamples<=102400&&Number.isSafeInteger(windowPixels)&&windowPixels>0&&windowPixels<=65536&&['cpu','webgpu','auto'].includes(backend),'Native selected-codec histogram requests required.');
 let view,domain,release,failure;const started=performance.now(),cooperate=createCooperator(signal);
 try{
  if(sourceRegionDomain){domain=await prepareSourceRegionDomain(original,sourceRegionDomain,{signal});view=await createSourceRegionView({...original.surface,sha256:original.sha256},domain.descriptor,{budget,signal});}
  const {width,height}=domain??original.surface.descriptor,contexts=view?[...view.admittedRectangles()]:[{x:0,y:0,width,height}],population=contexts.reduce((n,r)=>n+r.width*r.height,0),stride=Math.max(1,Math.ceil(population/maximumSamples));requireValue(population>0,'No admitted native Auto samples.');release=budget.reserve(requests.length*4096+contexts.length*256+requests.length*contexts.length*192+65536);
  const jobs=[];for(const request of requests){const params=validateParams({...request.params,scale:1,contrast:0,linear:true,grayscale:false}),plan=await resolveSelectedPlan(params,original,{signal,paletteAxis:'fixed',quality:params.quality});requireValue(plan,'Native selected-codec histograms exclude historical JPEG.');requireValue(Number.isInteger(request.level)&&request.level>=1&&request.level<=256,'Invalid selected-codec probe level.');const job={level:request.level,params,plan};requireValue(!jobs.length||plan.stage.codec===jobs[0].plan.stage.codec&&plan.stage.lossless===jobs[0].plan.stage.lossless,'One selected codec family per native histogram batch.');jobs.push(job);}
  const largest=contexts.reduce((a,r)=>r.width*r.height>a.width*a.height?r:a),plan=recompressionParallelPlan({budget,width:largest.width,height:largest.height,stage:jobs[0].plan.stage,count:jobs.length,maxWorkers,extraBytes:8192+(backend==='webgpu'?maximumSamples*6:0)});let completed=0;
  const execution=await runRecompressionLanes(jobs,{budget,workers:plan.workers,cpuPerWorker:plan.cpuPerWorker,signal,run:async(job,lane,index,jobSignal)=>{
   let histogram=new Uint32Array(256);const gpuRequested=backend==='webgpu',samplingContexts=[];let sampleA=null,sampleB=null;let offset=0,samples=0,recompressions=0,readWindows=0,codecMs=0;const nativeMetrics={backend:'cpu',kernel:'selected-codec-native-RGB-histogram',codecBackend:'cpu',histogramBackend:'cpu',experimentalRecompression:true},gpuLease=gpuRequested?budget.reserve(maximumSamples*6):null;
   try{if(gpuRequested){sampleA=new Uint8Array(maximumSamples*3);sampleB=new Uint8Array(maximumSamples*3);}for(const context of contexts){await cooperate();checkAbort(jobSignal);const image=view?createSourceRegionJpegContextImage(view,context,original,budget):original,probe=createSelectedRgbRecompression(image,job.params,{budget,paletteAxis:'fixed',codecLane:lane,exactCapacity:true});let count=0;
    try{const metrics=await probe.visit(job.params.quality,{signal:jobSignal,onBand:async(a,b,{y,rows})=>{for(let row=0;row<rows;row++){const start=offset+(y+row)*context.width,first=(stride-start%stride)%stride;for(let x=first;x<context.width;x+=stride){const at=(row*context.width+x)*3;histogram[Math.abs(a[at]-b[at])]++;histogram[Math.abs(a[at+1]-b[at+1])]++;histogram[Math.abs(a[at+2]-b[at+2])]++;if(sampleA){sampleA.set(a.subarray(at,at+3),samples*3);sampleB.set(b.subarray(at,at+3),samples*3);}samples++;count++;}}}});recompressions+=metrics.recompressions??0;codecMs+=metrics.totalMs??0;}
    finally{await probe.dispose();}
    // Preserve the former sampler's logical window count as metadata, although
    // these windows no longer require a second residual-surface read.
    for(let x=0;x<context.width;x+=windowPixels){const w=Math.min(windowPixels,context.width-x),rows=Math.max(1,Math.floor(windowPixels/w));for(let y=0;y<context.height;y+=rows){const h=Math.min(rows,context.height-y);let selected=false;for(let row=0;row<h;row++)if((stride-(offset+(y+row)*context.width+x)%stride)%stride<w){selected=true;break;}if(selected)readWindows++;}}
    samplingContexts.push({bounds:[context.x,context.y,context.x+context.width,context.y+context.height],samples:count});offset+=context.width*context.height;
   }
   requireValue(samples>0&&samples<=maximumSamples&&offset===population,'Invalid native selected-codec histogram population.');if(gpuRequested){const gpu=await getRecompressionGrayGpu(budget).runHistogram(sampleA.subarray(0,samples*3),sampleB.subarray(0,samples*3),{signal:jobSignal});histogram=gpu.histogram;Object.assign(nativeMetrics,{backend:'webgpu',histogramBackend:'webgpu',gpu:gpu.runtime});}nativeMetrics.recompressions=recompressions;nativeMetrics.codecMilliseconds=codecMs;const record={level:job.level,histogram,plan:job.plan,nativeMetrics,sampling:{coordinates:domain?'admitted-native-pixels':'native-pixels',resize:false,samples,stride,readWindows,contexts:samplingContexts,excludedPixels:0}};completed++;onProgress?.({phase:'selected-auto-native-histogram',fraction:completed/jobs.length,level:job.level,workers:plan.workers});return record;}finally{gpuLease?.();}
  }});
  checkAbort(signal);return{imageId:original.id,sourceSha256:original.sha256,width,height,...(domain?{sourceRegionDomain:domain.descriptor}:{}),records:execution.results,metrics:{workers:execution.workers,policy:plan.policy,backend:backend==='webgpu'?'webgpu':'cpu',requestedBackend:backend,codecBackend:'cpu',histogramBackend:backend==='webgpu'?'webgpu':'cpu',nativeResidual:'linear-absolute-RGB',resize:false,totalMs:performance.now()-started}};
 }catch(error){failure=error;throw error;}
 finally{await retireCompositeOwners([()=>view?.dispose(),()=>release?.()],failure?{primary:failure}:{});}
}
