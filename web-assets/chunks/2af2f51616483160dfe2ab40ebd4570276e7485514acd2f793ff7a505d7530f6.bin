import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {denseDescriptorHeapBound,denseDescriptorShape} from './dense-math.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {runPagedDenseField} from './dense-paged.js';
// Zernike is a finite-support descriptor. The halo is the same as the qualified
// resident native tiler; matching subsequently uses the entire stored plane.
export async function preparePagedZernike(image,{patch=8,reflection=false,region=null,budget,storage='auto',temporarySession=image.session,getTemporarySession=image.ensureTemporarySession,signal,onProgress,maxWorkers=globalThis.navigator?.hardwareConcurrency??1,workerFactory=()=>new Worker(new URL('./dense-zernike-tile-worker.js',import.meta.url),{type:'module'})}={}){
 const source=image.surface?.descriptor;
 requireValue(source?.format==='rgb8'&&typeof reflection==='boolean'&&Number.isInteger(maxWorkers)&&maxWorkers>=1,'Zernike requires an RGB surface.');
 const [originX,originY,width,height]=region??[0,0,source.width,source.height];
 requireValue([originX,originY,width,height].every(Number.isSafeInteger)&&originX>=0&&originY>=0&&width>0&&height>0&&originX+width<=source.width&&originY+height<=source.height,'Invalid Zernike source region.');
 denseDescriptorShape(width,height,0,patch);const halo=3*patch+1,room=budget.limit-budget.active-budget.retained;
 let tile=128,workspace,inputAllowance;
 while(true){
  const w=Math.min(width,tile+2*halo),h=Math.min(height,tile+2*halo),area=w*h;
  workspace=denseDescriptorHeapBound(w,h,0,patch,reflection)+area*(4+48*(reflection?2:1))+tile*tile*48*(reflection?2:1);
  inputAllowance=area*3+w*3+2*1024**2;
  if(workspace+inputAllowance<=room)break;
  if(tile===1)throw new EngineError('MEMORY_LIMIT','The native Zernike support does not fit the available memory.');tile=Math.max(1,Math.floor(tile/2));
 }
 const total=Math.ceil(width/tile)*Math.ceil(height/tile),workers=Math.max(1,Math.min(maxWorkers,total,Math.floor(room/(workspace+inputAllowance))));
 const release=budget.reserve(workers*workspace),planning=budget.reserve(workers*inputAllowance),stores=[],active=new Map();let planLive=true,success=false,stopped=false;
 const stop=()=>{stopped=true;for(const [worker,reject] of active){worker.terminate();reject?.(new EngineError('CANCELLED','Zernike preparation stopped.'));}active.clear();};
 signal?.addEventListener('abort',stop,{once:true});
 try{
  const options={budget,storage,temporarySession,getTemporarySession,signal};
  const first=await createSegmentedBytes(width*height*48,options);stores.push(first);
  const second=reflection?await createSegmentedBytes(width*height*48,options):first;if(second!==first)stores.push(second);
  planning();planLive=false;
  let next=0,completed=0,heapBytes=0;
  const work=async()=>{
   const worker=workerFactory();active.set(worker,null);
   try{while(next<total){
    checkAbort(signal);if(stopped)throw new EngineError('CANCELLED','Zernike preparation stopped.');
    const index=next++,left=index%Math.ceil(width/tile)*tile,top=Math.floor(index/Math.ceil(width/tile))*tile;
    const cw=Math.min(tile,width-left),ch=Math.min(tile,height-top),x0=Math.max(0,left-halo),y0=Math.max(0,top-halo),x1=Math.min(width,left+cw+halo),y1=Math.min(height,top+ch+halo),w=x1-x0,h=y1-y0;
    const part=await image.surface.readWindow({x:originX+x0,y:originY+y0,width:w,height:h},{signal});let features;
    try{
     checkAbort(signal);if(stopped)throw new EngineError('CANCELLED','Zernike preparation stopped.');
     features=await new Promise((resolve,reject)=>{
      active.set(worker,reject);
      worker.onmessage=({data})=>{active.set(worker,null);data.error?reject(new EngineError(data.error.code,data.error.message)):resolve(data.result);};
      worker.onerror=e=>reject(new EngineError('WORKER_FAILED',e.message));
      worker.postMessage({rgb:part.pixels.data,width:w,height:h,patch,reflection,x:left-x0,y:top-y0,coreWidth:cw,coreHeight:ch},[part.pixels.data.buffer]);
     });
    }finally{part.release();}
    heapBytes=Math.max(heapBytes,features.heapBytes);
    for(let y=0;y<ch;y++){
     const offset=y*cw*48,dest=((top+y)*width+left)*48;
     await first.write(new Uint8Array(features.first.buffer,offset,cw*48),dest);
     if(reflection)await second.write(new Uint8Array(features.second.buffer,offset,cw*48),dest);
    }
    completed+=cw*ch;onProgress?.({phase:'stored-zernike-descriptors',completed,total:width*height});
   }}finally{active.delete(worker);worker.terminate();}
  };
  const tasks=Array.from({length:workers},work);
  try{await Promise.all(tasks);}catch(e){stop();await Promise.allSettled(tasks);throw e;}
  await first.flush();if(second!==first)await second.flush();checkAbort(signal);success=true;
  return {width,height,dimensions:12,first,second,origin:[originX,originY],metrics:{tile,halo,workers,workspaceBytes:workers*workspace,heapBytes,storedDescriptorBytes:width*height*48*(reflection?2:1)},async dispose(){await Promise.all(stores.map(s=>s.dispose()));}};
 }finally{signal?.removeEventListener('abort',stop);stop();if(planLive)planning();release();if(!success)await Promise.allSettled(stores.map(s=>s.dispose()));}
}

export async function runPagedZernike(image,mask,options={}){
 const descriptors=await preparePagedZernike(image,options);
 try{
  const result=await runPagedDenseField({...descriptors,mask,axes:options.axes}, {...options,temporarySession:options.temporarySession??image.session,getTemporarySession:options.getTemporarySession??image.ensureTemporarySession});
  result.origin=descriptors.origin;result.metrics.preparation=descriptors.metrics;return result;
 }finally{await descriptors.dispose();}
}
