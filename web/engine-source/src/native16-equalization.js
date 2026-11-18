import {requireValue,checkAbort} from './errors.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {gpuRetirementBlocked} from './gpu-attempt-retirement.js';
import {native16CompositeEqualizationPlan,markNative16EqualizationConsumed} from './native16-equalization-contract.js';
import {equalizationNativeSurface} from './equalization-native-surface.js';
import {createNativeEqualizationScope} from './equalization-native-owner.js';

// The base record owns its auxiliary tables/cloud/model. Its image may retire
// after a completed post image; the remaining record lives until final ACK.
function auxiliaryBytes(operation,record){
 if(operation!=='colors.pca')return 0;
 const cloud=record.metrics?.cloudSampleBytes,table=record.tableRecords?.pca_model?.surface?.descriptor;
 const model=record.basis instanceof Float64Array?record.basis.byteLength:
  table?.format==='float64-table'?table.rowCount*table.columns?.length*8:undefined;
 requireValue(Number.isSafeInteger(cloud)&&cloud>=0&&Number.isSafeInteger(model)&&model>0,'PCA retained auxiliary bytes must be explicit.');
 return cloud+model;
}

export async function runNative16EqualizedRecord(operation,params,ctx,executeBase){
 requireValue(typeof executeBase==='function','A native composite needs its existing base producer.');
 const plan=native16CompositeEqualizationPlan(operation,params);
 if(!plan)return executeBase(params,ctx);
 if(plan.kind==='adjust')return markNative16EqualizationConsumed(await executeBase(params,ctx));
 const scope=createNativeEqualizationScope();let base,post,baseCloseRefused=false;
 const observer=ctx.nativeGpuRetirement?.hasPort('base-gpu')?ctx.nativeGpuRetirement:null,
  retirementOwner=ctx.retirementOwner??scope;
 scope.excludeParent(retirementOwner);
 let entered=false;
 try{
  if(observer){observer.enter('base-gpu',retirementOwner);entered=true;}
  const postContext={...ctx,retirementOwner,retirementCacheOwner:ctx.retirementCacheOwner??observer?.cacheOwner(retirementOwner,'native16-post')};
  base=await executeBase(plan.base,ctx);requireValue(base&&typeof base==='object','The native equalizer base did not produce a record.');
  // An empty clipped Loupe is a successful no-read result, not a new image.
  if(!base.surface){requireValue(base.data?.empty===true,'A native post equalizer requires its real preceding surface.');return markNative16EqualizationConsumed(base);}
  requireValue(base.surface!==ctx.surface&&base.surface!==ctx.sourceSurface&&base.surface.descriptor?.format==='rgb16'&&base.surface.descriptor.depth===16,'Native post equalization must own a real intermediate, never the Original.');
  scope.adopt(base);checkAbort(ctx.signal);
  post=await equalizationNativeSurface(base.surface,plan,postContext);scope.adopt(post);
  checkAbort(ctx.signal);
  // This has completed all scientific reads. Its captured colour authority is
  // linked to Original by the presentation owner, not to this closing image.
  try{const ack=await base.surface.dispose();if(ack===false||ack===0)throw ack;}catch(error){baseCloseRefused=true;throw error;}
  const extra=auxiliaryBytes(operation,base),retained=post.metrics?.retainedResultBytes,
   baseGpuJobs=base.metrics?.gpuJobs??0,postGpuJobs=post.metrics?.equalization?.mapping?.gpuJobs??0;
  requireValue(Number.isSafeInteger(retained)&&retained>=0&&Number.isSafeInteger(retained+extra),'The completed native equalizer must report its actual retained result bytes.');
  requireValue([baseGpuJobs,postGpuJobs,baseGpuJobs+postGpuJobs].every(v=>Number.isSafeInteger(v)&&v>=0),'Native composite GPU counters must be explicit nonnegative integers.');
  const gpuJobs=baseGpuJobs+postGpuJobs,baseBackend=base.metrics?.backend??'cpu';
  let closed=false,flight;
  const result={...base,surface:post.surface,
   metrics:{...base.metrics,...post.metrics,gpuJobs,backend:gpuJobs?'webgpu':baseBackend,cpuBaseBackend:baseBackend,
    cpuBaseInputDepth:base.metrics?.inputDepth??16,cpuBaseOutputDepth:base.metrics?.outputDepth??16,
    originalBaseCalculations:{backend:baseBackend,gpuJobs:baseGpuJobs,workers:base.metrics?.workers??1},
    retainedBaseAuxiliaryBytes:extra,retainedResultBytes:retained+extra},
   semantics:(base.semantics??'')+' Native16 post equalization of this actual preceding result; original scientific model and auxiliary tables are retained.',
   dispose(){if(closed)return Promise.resolve();if(flight)return flight;const task=(async()=>{try{await scope.dispose();closed=true;}catch(error){throw withRetirementOwner(error,result,error);}})();flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;}};
  return markNative16EqualizationConsumed(result);
 }catch(error){
  scope.adoptFailure(error);
  // Never retry a child NACK during this same failed calculation. The caller
  // receives one reachable owner holding base, completed post and child debt.
  if(baseCloseRefused||gpuRetirementBlocked(error))throw withRetirementOwner(error,scope,error);
  try{await scope.dispose();}catch(cleanup){throw withRetirementOwner(error,scope,cleanup);}throw error;
 }finally{if(entered)observer.finish('base-gpu',retirementOwner);}
}
