import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {denseDescriptorHeapBound,denseDescriptorShape} from './dense-math.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {runPagedDenseField} from './dense-paged.js';
import {planDensePreparation,densePreparationMigrationBytes} from './dense-preparation-plan.js';
import {ElasticWorkerPool} from './elastic-worker-pool.js';
// Zernike is a finite-support descriptor. The halo is the same as the qualified
// resident native tiler; matching subsequently uses the entire stored plane.
export async function preparePagedZernike(image,{patch=8,reflection=false,region=null,budget,storage='auto',temporarySession=image.session,getTemporarySession=image.ensureTemporarySession,signal,onProgress,maxWorkers=globalThis.navigator?.hardwareConcurrency??1,workerFactory=()=>new Worker(new URL('./dense-zernike-tile-worker.js',import.meta.url),{type:'module'})}={}){
 const requestedStorage=storage;
 const source=image.surface?.descriptor;
 requireValue(source?.format==='rgb8'&&typeof reflection==='boolean'&&Number.isInteger(maxWorkers)&&maxWorkers>=1,'Zernike requires an RGB surface.');
 const [originX,originY,width,height]=region??[0,0,source.width,source.height];
 requireValue([originX,originY,width,height].every(Number.isSafeInteger)&&originX>=0&&originY>=0&&width>0&&height>0&&originX+width<=source.width&&originY+height<=source.height,'Invalid Zernike source region.');
 denseDescriptorShape(width,height,0,patch);const halo=3*patch+1;
 const initialWidth=Math.min(width,128+2*halo),initialHeight=Math.min(height,128+2*halo),initialArea=initialWidth*initialHeight;
 const minimumPlanned=denseDescriptorHeapBound(initialWidth,initialHeight,0,patch,reflection)+initialArea*(4+48*(reflection?2:1))+128*128*48*(reflection?2:1)+initialArea*3+initialWidth*3+2*1024**2;
 const migrationBytes=()=>densePreparationMigrationBytes(budget,width*height*48,{storage,temporarySession,getTemporarySession});
 const desired=width*height*48*(reflection?2:1)+minimumPlanned+migrationBytes();
 await budget.reclaim(desired<=budget.limit?desired:Math.min(minimumPlanned,budget.limit),{signal});
 const room=budget.limit-budget.retained;
 let tile=128,workspace,inputAllowance;
 while(true){
  const w=Math.min(width,tile+2*halo),h=Math.min(height,tile+2*halo),area=w*h;
  workspace=denseDescriptorHeapBound(w,h,0,patch,reflection)+area*(4+48*(reflection?2:1))+tile*tile*48*(reflection?2:1);
  inputAllowance=area*3+w*3+2*1024**2;
  if(workspace+inputAllowance<=room)break;
  if(tile===1)throw new EngineError('MEMORY_LIMIT','The native Zernike support does not fit the available memory.');tile=Math.max(1,Math.floor(tile/2));
 }
 const total=Math.ceil(width/tile)*Math.ceil(height/tile);
 const pool=new ElasticWorkerPool(budget,{resourceOwner:'patchmatch',maxWorkers,workerBytes:workspace,ioBytes:inputAllowance,workerFactory,label:'dense-zernike'});
 const layoutOperation=budget.beginOperation?.({owner:'patchmatch',id:'dense-zernike/preparation-layout'});
 let planningLease;try{planningLease=await pool.scheduler.acquire({cpu:0,bytes:workspace+inputAllowance,signal,resourceOwner:'patchmatch',operation:layoutOperation,label:'dense-zernike/preparation-layout'});layoutOperation?.setState('io');}catch(error){layoutOperation?.release();pool.dispose();throw error;}
 const planning=()=>{planningLease.release();layoutOperation?.release();},stores=[];let planLive=true,success=false,completed=0;
 let preparation;try{preparation=planDensePreparation({availableBytes:budget.limit-budget.active-budget.retained+workspace+inputAllowance,dataBytes:width*height*48*(reflection?2:1),workspaceBytes:workspace,ioBytes:inputAllowance,migrationBytes:migrationBytes(),total,maxWorkers,storage});}catch(error){planning();pool.dispose();throw error;}
 storage=preparation.storage;
 try{
  const options={budget,storage:requestedStorage==='auto'&&(temporarySession||getTemporarySession)&&budget.isBackingUnderPressure?.('array-buffer')?'temporary':storage,shared:true,temporarySession,getTemporarySession,signal,owner:'patchmatch',label:'zernike-descriptors'};
  const first=await createSegmentedBytes(width*height*48,options);stores.push(first);
  const second=reflection?await createSegmentedBytes(width*height*48,options):first;if(second!==first)stores.push(second);
  const recoveries=()=>stores.map((store,index)=>({store:index,...store.allocationRecovery})).filter(item=>item.count);
  planning();planLive=false;
  const across=Math.ceil(width/tile);
  // Retrying publication writes the same descriptor bytes to disjoint tiles.
  // Progress is emitted only after every write for the tile has succeeded.
  await pool.run(total,{signal,consumeIdempotent:true,phase:'dense-zernike',onProgress:event=>{if(event.phase?.startsWith('resource-')){onProgress?.(event);return;}const allocationRecoveries=recoveries();onProgress?.({phase:'stored-zernike-descriptors',completed,total:width*height,execution:pool.snapshot(),...(allocationRecoveries.length?{allocationRecoveries}:{})});},prepare:async(index,{signal,reserveInput})=>{
   const left=index%across*tile,top=Math.floor(index/across)*tile,cw=Math.min(tile,width-left),ch=Math.min(tile,height-top),x0=Math.max(0,left-halo),y0=Math.max(0,top-halo),x1=Math.min(width,left+cw+halo),y1=Math.min(height,top+ch+halo),w=x1-x0,h=y1-y0;
   const part=await image.surface.readWindow({x:originX+x0,y:originY+y0,width:w,height:h},{signal,reserve:reserveInput});
   return {message:{rgb:part.pixels.data,width:w,height:h,patch,reflection,x:left-x0,y:top-y0,coreWidth:cw,coreHeight:ch},transfer:[part.pixels.data.buffer],release:part.release};
  },consume:async(index,features,{reserveIO})=>{
   const left=index%across*tile,top=Math.floor(index/across)*tile,cw=Math.min(tile,width-left),ch=Math.min(tile,height-top);
   for(let y=0;y<ch;y++){const offset=y*cw*48,dest=((top+y)*width+left)*48;await first.write(new Uint8Array(features.first.buffer,offset,cw*48),dest,{reserve:reserveIO});if(reflection)await second.write(new Uint8Array(features.second.buffer,offset,cw*48),dest,{reserve:reserveIO});}
   completed+=cw*ch;
  }});
  await first.flush();if(second!==first)await second.flush();checkAbort(signal);success=true;
  const execution=pool.snapshot();
  return {width,height,dimensions:12,first,second,origin:[originX,originY],metrics:{tile,halo,workers:execution.peakComputing,preparation,execution,workspaceBytes:execution.peakWorkers*workspace,heapBytes:execution.heapBytes,storedDescriptorBytes:width*height*48*(reflection?2:1),allocationRecoveries:recoveries()},async dispose(){await Promise.all(stores.map(s=>s.dispose()));}};
 }finally{pool.dispose();if(planLive)planning();if(!success)await Promise.allSettled(stores.map(s=>s.dispose()));}
}

export async function runPagedZernike(image,mask,options={}){
 const descriptors=await preparePagedZernike(image,options);
 try{
  const result=await runPagedDenseField({...descriptors,mask,axes:options.axes}, {...options,temporarySession:options.temporarySession??image.session,getTemporarySession:options.getTemporarySession??image.ensureTemporarySession});
  result.origin=descriptors.origin;result.metrics.preparation=descriptors.metrics;return result;
 }finally{await descriptors.dispose();}
}
