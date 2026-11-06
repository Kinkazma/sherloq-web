import "../../runtime-context.js?v=0.31.0";
import {createSelectedRgbRecompression,resolveSelectedPlan} from './recompression-probe.js';
import {recompressionParallelPlan} from './recompression-codec-client.js';
import {runRecompressionLanes} from './recompression-parallel.js';
import {getGhostJpegService,consumeGhostGpuResult} from './ghost-jpeg-service.js';
import {numpySum} from './numpy-sum.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {checkAbort} from './errors.js';
export async function selectedGhostPlanes(image,p,params,qualities,{budget,signal,onProgress,onPlane,maxWorkers=1,backend='cpu'}={}){
 const {width,height}=image.surface.descriptor,cols=Math.floor(width/16),rows=Math.floor(height/16),jobs=[],unique=new Map(),probes=[],metrics={workers:1,kernel:'selected-codec-rgb-ghosts',backend:'cpu',codecBackend:'cpu',recompression:structuredClone(params.recompression),recompressions:0,qualityPlanesComputed:0,encodedCacheHits:0,sourcePasses:0};let primary;
 try{
  for(const q of qualities){const plan=await resolveSelectedPlan(params,image,{quality:q,paletteAxis:'sweep',signal}),key=plan?.identity??q;let job=unique.get(key);if(!job){job={quality:q,aliases:[],plan};unique.set(key,job);jobs.push(job);}job.aliases.push(q);}
  if(!jobs.length)return metrics;const plan=recompressionParallelPlan({budget,width,height,stage:jobs[0].plan?.stage??{codec:'jpeg',lossless:false,quality:jobs[0].quality},count:jobs.length,maxWorkers,extraBytes:cols*rows*8+8*1024**2}),gpu=backend==='webgpu'||backend==='auto',details=d=>{metrics.recompressions+=d?.recompressions??0;metrics.encodedCacheHits+=Number(d?.recompressedCache??false);metrics.sourcePasses+=d?.sourcePasses??0;metrics.codecHeapCapacityBytes=Math.max(metrics.codecHeapCapacityBytes??0,d?.codecHeapCapacityBytes??d?.codecHeapPeakBytes??0);};
  const execution=await runRecompressionLanes(jobs,{budget,workers:plan.workers,cpuPerWorker:plan.cpuPerWorker,signal,run:async(job,lane,_index,jobSignal)=>{
   const probe=probes[lane]??=createSelectedRgbRecompression(image,params,{budget,paletteAxis:'sweep',codecLane:lane,exactCapacity:plan.workers>1}),hooks={phaseX:p.x,phaseY:p.y,signal:jobSignal,onProgress:event=>onProgress?.({...event,quality:job.quality,total:qualities.length})},publish=async plane=>{for(const q of job.aliases){checkAbort(jobSignal);await onPlane(q,plane);metrics.qualityPlanesComputed++;}};
   if(gpu){if(plan.workers>1)details(await probe.prepare(job.quality,hooks));const service=getGhostJpegService(budget),owned=await service.runExternalQuality(width,height,consume=>probe.visit(job.quality,{...hooks,onBand:consume}),{backend:'webgpu',strict:backend==='webgpu',signal:jobSignal,onSubmitted:onProgress});if(owned){await consumeGhostGpuResult(owned,async result=>{details(result.codecDetails);metrics.gpuQualityPlanes=(metrics.gpuQualityPlanes??0)+1;const old=metrics.gpu;metrics.gpu={...result.runtime,qualityPlanes:metrics.gpuQualityPlanes,readbacks:(old?.readbacks??0)+result.runtime.readbacks,readbackBytes:(old?.readbackBytes??0)+result.runtime.readbackBytes,totalMs:(old?.totalMs??0)+result.runtime.totalMs,compileMs:(old?.compileMs??0)+result.runtime.compileMs};metrics.backend=metrics.cpuQualityPlanes?'mixed':'webgpu';metrics.kernel=result.runtime.kernel;await publish(result.means);});return;}metrics.gpuFallback=service.metrics().gpuFallback??'GPU_UNAVAILABLE';}
   const plane=allocateOwnedTypedArray(Float64Array,cols*rows,{budget,owner:'ela',label:'selected-Ghost-quality-plane'}),terms=allocateOwnedTypedArray(Float64Array,256,{budget,owner:'ela',label:'selected-Ghost-NumPy-terms'});
   try{details(await probe.visit(job.quality,{...hooks,onBand:async(a,b,{y,rows:count})=>{for(let local=0;local+16<=count;local+=16){const by=(y+local)/16;for(let bx=0;bx<cols;bx++){let n=0;for(let yy=0;yy<16;yy++)for(let xx=0;xx<16;xx++){const at=((local+yy)*width+bx*16+xx)*3;let sum=0;for(let c=0;c<3;c++){const d=a[at+c]-b[at+c];sum+=d*d;}terms.data[n++]=sum/3;}plane.data[by*cols+bx]=numpySum(terms.data)/256;}}}}));metrics.cpuQualityPlanes=(metrics.cpuQualityPlanes??0)+1;metrics.backend=metrics.gpuQualityPlanes?'mixed':'cpu';await publish(plane.data);}
   finally{plane.release();terms.release();}
  }});metrics.workers=execution.workers;metrics.reductionBackend=metrics.backend;metrics.scheduling=plan;return metrics;
 }catch(error){primary=error;throw error;}
 finally{await retireCompositeOwners(probes.map(p=>()=>p?.dispose()),primary?{primary}:{});}
}
