import {resolveRecompressionPlan} from './recompression-plan.js';
import {recompressSurface} from './recompression-surface.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {toneTable,fusedCpu} from './ela-lut.js';
import {getElaGpuService} from './ela-gpu.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {checkAbort,requireValue} from './errors.js';

// The retained owner holds one complete recompression of this Original. Display
// changes reuse it; another codec/quality always starts again at Original.
export async function acquireRecompression(image,params,{budget,signal,onProgress}={}){
 const plan=await resolveRecompressionPlan(params,image,{signal}),d=image.surface.descriptor;
 const identity=JSON.stringify([image.sha256,d.id??null,d.revision??null,d.width,d.height,plan.identity]);
 let owner=image.recompressionCache;
 if(owner?.identity!==identity||owner?.closed){await owner?.dispose();owner=null;}
 const cacheHit=!!owner;
 if(!owner){
  const result=await recompressSurface(image,plan,{budget,signal,onProgress});
  let closed=false,pending,unregister;
  owner={identity,plan,result,pins:0,get closed(){return closed;},
   dispose(){if(pending)return pending;if(closed)return;requireValue(owner.pins===0,'A recompression is still borrowed.');
    const task=Promise.resolve().then(()=>result.dispose()).then(()=>{closed=true;unregister?.();if(image.recompressionCache===owner)image.recompressionCache=null;});
    pending=task;void task.finally(()=>{if(pending===task)pending=null;}).catch(()=>{});return task;
   }};
  image.recompressionCache=owner;
  unregister=budget.registerAsyncReclaimer?.(async()=>{if(owner.pins||closed)return 0;const before=budget.total();await owner.dispose();return Math.max(0,before-budget.total());},{allocationKind:'array-buffer',owner:'recompression',label:'idle-complete-recompression'});
 }
 owner.pins++;let released=false;
 return {...owner.result,plan,cacheHit,release(){if(!released){released=true;owner.pins--;}}};
}

export async function recompressionEla(image,params,{budget,signal,onProgress,table,saveTable,createPreviewCapture,backend='auto'}={}){
 const descriptor=image.surface.descriptor,gpu=getElaGpuService(budget);
 let borrowed,output,surface,tableLease,capture,planning,gpuCalls=0,gpuMs=0,windows=0;
 try{
  borrowed=await acquireRecompression(image,params,{budget,signal,onProgress});
  const rows=Math.max(1,Math.min(32,Math.floor(262144/descriptor.width)));
  planning=budget.reserve(descriptor.width*rows*12+1024**2);
  output=await createSegmentedBytes(descriptor.width*descriptor.height*3,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});
  planning();planning=null;tableLease=budget.reserve(1024**2);
  const tableCached=!!table;if(!table){table=await toneTable(params,{signal});saveTable?.(table);}
  capture=createPreviewCapture?.({recompressionPlan:borrowed.plan,codecProvenance:borrowed.provenance});
  for(let y=0;y<descriptor.height;y+=rows){
   checkAbort(signal);const height=Math.min(rows,descriptor.height-y),rect={x:0,y,width:descriptor.width,height};
   let first,second,renderedOwner,lease,failed=false,primary;
   try{
    first=await image.surface.readWindow(rect,{signal});second=await borrowed.surface.readWindow(rect,{signal});
    lease=budget.reserve(first.pixels.data.byteLength);
    renderedOwner=await gpu.residual(first.pixels.data,second.pixels.data,descriptor.width,height,params,table,{signal,backend});
    if(renderedOwner){gpuCalls++;gpuMs+=renderedOwner.runtime.totalMs;}
    const data=renderedOwner?.data??await fusedCpu(first.pixels.data,second.pixels.data,params,table,{signal});
    await output.write(data,y*descriptor.width*3);capture?.captureBand(first.pixels.data,second.pixels.data,{y,rows:height});
   }catch(error){failed=true;primary=error;throw error;}
   finally{await retireCompositeOwners([()=>renderedOwner?.release(),()=>first?.release(),()=>second?.release(),()=>lease?.()],failed?{primary}:{});}
   windows++;onProgress?.({phase:'render',fraction:(y+height)/descriptor.height});
  }
  await output.flush();checkAbort(signal);output.markCold();capture?.finish();
  surface=createRgbSurface(output,{width:descriptor.width,height:descriptor.height,budget});
  return {surface,codec:borrowed.provenance,
   semantics:'Full-resolution ELA using one selected recompression of Original and the maintained ELA rendering.',
   metrics:{...borrowed.metrics,backend:gpuCalls?'webgpu':'cpu',gpuRenderCalls:gpuCalls,gpuRenderMs:gpuMs,...gpu.metrics(),recompressedCache:borrowed.cacheHit,recompressions:borrowed.cacheHit?0:1,tableCached,renderWindows:windows,storage:output.storage,retainedResultBytes:output.byteLength}};
 }catch(error){await (surface??output)?.dispose();throw error;}
 finally{await retireCompositeOwners([()=>capture?.dispose(),()=>borrowed?.release(),()=>planning?.(),()=>tableLease?.()]);}
}
