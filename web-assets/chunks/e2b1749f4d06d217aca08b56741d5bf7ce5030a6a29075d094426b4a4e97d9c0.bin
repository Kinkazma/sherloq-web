import "../../runtime-context.js?v=0.31.0";
import {resolveRecompressionPlan} from './recompression-plan.js';
import {recompressSurface} from './recompression-surface.js';
import {recompressionCodecWorkspace,recompressionCodecPlanningBytes} from './recompression-codec-client.js';
import {rgbRecompressionPlan} from './jpeg-rgb-stream.js';
import {createSourceRegionJpegContextImage} from './source-region-ela.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createJpegEntryRetirement} from './jpeg-encoded-cache-owners.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {requireValue,checkAbort,createCooperator,normalizeResourceError} from './errors.js';

const GRID='exact-native-recompression-fragments/1',MiB=1024**2;
async function contextPlan(view,domain,codecPlan,{budget,signal}){
 const bytes=4096+domain.width*64;budget.retain(bytes);let closed=false;
 const dispose=()=>{if(!closed){closed=true;budget.retained-=bytes;}};
 try{
  const cooperate=createCooperator(signal);let analysedPixels=0,contexts=0,workingBytes=0;
  for(const rect of view.admittedRectangles()){
   await cooperate();analysedPixels+=rect.width*rect.height;contexts++;
   const workspace=codecPlan.stage.codec==='jpeg'?rgbRecompressionPlan({descriptor:{width:rect.width,height:rect.height}}):recompressionCodecWorkspace(rect,codecPlan.stage);
   workingBytes=Math.max(workingBytes,workspace.workingBytes+(workspace.windowAllowance??0)+4*MiB);
  }
  requireValue(contexts>0&&analysedPixels===domain.countIncluded,'Recompression contexts must cover every admitted Original observation exactly.');checkAbort(signal);
  return{grid:GRID,identity:domain.fingerprint,analysedPixels,contexts,cores:contexts,workingBytes,
   *regions(){requireValue(!closed,'The Original recompression context plan is closed.');for(const rect of view.admittedRectangles())yield{...rect,x:rect.x+domain.origin[0],y:rect.y+domain.origin[1]};},dispose};
 }catch(error){dispose();throw error;}
}
async function cacheFor(derived,view,domain,codecPlan,budget,signal){
 let cache=derived.sourceRegionRecompressionCache;
 if(cache){requireValue(!cache.closed&&cache.grid===GRID&&cache.plan.identity===domain.fingerprint,'The recompression cache belongs to another admitted Original domain.');return cache;}
 const plan=await contextPlan(view,domain,codecPlan,{budget,signal}),entries=new Map(),pinned=new Map(),pending=createJpegEntryRetirement();let closed=false,disposing;
 const unregister=budget.registerReclaimer?.(bytes=>{for(const[key,entry]of entries){if(budget.total()+bytes<=budget.limit)break;if(pinned.has(key)||entry.store.storage!=='memory')continue;entries.delete(key);pending.defer(entry);}});
 const unregisterBacking=budget.registerAsyncReclaimer?.(async()=>{const before=budget.total();await pending.drain();return Math.max(0,before-budget.total());},{allocationKind:'array-buffer',owner:'recompression',label:'retiring-native-fragment-recompression-cache'});
 cache={grid:GRID,plan,entries,pinned,retire:entry=>pending.retire(entry),drain:()=>pending.drain(),get closed(){return closed;},
  dispose(){if(disposing)return disposing;if(closed)return;requireValue(!pinned.size,'An Original recompression context is still borrowed.');for(const entry of entries.values())pending.defer(entry);entries.clear();const task=pending.drain().then(()=>{closed=true;plan.dispose();unregister?.();unregisterBacking?.();if(derived.sourceRegionRecompressionCache===cache)derived.sourceRegionRecompressionCache=null;});disposing=task;void task.finally(()=>{if(disposing===task)disposing=null;}).catch(()=>{});return task;}};
 derived.sourceRegionRecompressionCache=cache;return cache;
}
export function hasSourceRegionRecompression(derived,domain,codecPlan){
 const cache=derived.sourceRegionRecompressionCache;
 return !!cache&&!cache.closed&&cache.plan.identity===domain.fingerprint&&cache.entries.has(codecPlan.identity);
}
// Codec state spans each scientific geometry context completely. The row bands
// below only transport decoded pixels into storage and never encode tiles.
export async function acquireSourceRegionRecompression({params,original,derived,view,domain,budget,signal,onProgress}){
 const codecPlan=await resolveRecompressionPlan(params,original,{signal}),cache=await cacheFor(derived,view,domain,codecPlan,budget,signal);
 await cache.drain();const plan=cache.plan,key=codecPlan.identity,width=domain.width,hit=cache.entries.has(key);let entry=cache.entries.get(key),creating,planning,recompressions=0,failure,failed=false;
 cache.pinned.set(key,(cache.pinned.get(key)??0)+1);
 const unpin=()=>{const pins=cache.pinned.get(key);if(pins===1)cache.pinned.delete(key);else if(pins>1)cache.pinned.set(key,pins-1);};
 try{
  if(!entry){
   // Recompute workspace admission when switching codec: the geometry cache is
   // reusable, while AVIF and JPEG may need different whole-context workspaces.
   let workingBytes=0;for(const rect of plan.regions()){const workspace=codecPlan.stage.codec==='jpeg'?rgbRecompressionPlan({descriptor:{width:rect.width,height:rect.height}}):{workingBytes:recompressionCodecPlanningBytes(rect,codecPlan.stage,{budget})};workingBytes=Math.max(workingBytes,workspace.workingBytes+(workspace.windowAllowance??0)+4*MiB);}
   planning=budget.reserve(workingBytes);while(cache.entries.size>=2){const candidate=[...cache.entries].find(([identity])=>!cache.pinned.has(identity));if(!candidate)break;const[identity,old]=candidate;cache.entries.delete(identity);await cache.retire(old);}
   creating=await createSegmentedBytes(width*domain.height*3,{budget,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession,signal});planning();planning=null;
   let completed=0,provenance;
   for(const rect of plan.regions()){
    checkAbort(signal);const context=createSourceRegionJpegContextImage(view,{...rect,x:rect.x-domain.origin[0],y:rect.y-domain.origin[1]},original,budget);let result,contextFailure,contextFailed=false;
    try{
     result=await recompressSurface(context,codecPlan,{budget,signal});provenance??=result.provenance;recompressions++;
     const rows=Math.max(1,Math.min(32,Math.floor(65536/rect.width)));
     for(let y=0;y<rect.height;y+=rows){checkAbort(signal);const height=Math.min(rows,rect.height-y),part=await result.surface.readWindow({x:0,y,width:rect.width,height},{signal});try{for(let row=0;row<height;row++)await creating.write(part.pixels.data.subarray(row*rect.width*3,(row+1)*rect.width*3),((rect.y+y+row-domain.origin[1])*width+rect.x-domain.origin[0])*3);}finally{await part.release();}}
    }catch(error){contextFailed=true;contextFailure=error;throw error;}
    finally{await retireCompositeOwners([()=>result?cache.retire({store:result}):undefined],contextFailed?{primary:contextFailure}:{});}
    completed+=rect.width*rect.height;onProgress?.({phase:'source-region-ela-recompression',fraction:completed/plan.analysedPixels});
   }
   await creating.flush();checkAbort(signal);creating.markCold();entry={store:creating,provenance:{...provenance,plan:structuredClone(codecPlan),contextGrid:GRID,contextCount:plan.contexts,input:'each admitted Original geometry context independently'}};cache.entries.set(key,entry);creating=null;
  }
  let released=false;return{store:entry.store,plan,codecPlan,provenance:entry.provenance,metrics:{recompressions,recompressedCache:hit,gpuArchiveCalls:0,gpuArchiveMs:0},release(){if(!released){released=true;unpin();}}};
 }catch(error){failed=true;failure=normalizeResourceError(error);unpin();throw failure;}
 finally{await retireCompositeOwners([()=>creating?cache.retire({store:creating}):undefined,()=>planning?.()],failed?{primary:failure}:{});}
}
