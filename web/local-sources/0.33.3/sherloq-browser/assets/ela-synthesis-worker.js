import {EngineError,checkAbort} from './unified-engine/src/errors.js';

// Each frame is a maintained native Classic operation on the same Original.
// This owner only sequences frames, accounts their retirement and publishes
// the complete median. It does not define an Energy/Biomes interpretation.
export async function synthesizeElaClassic({engine,task,source,signal,onProgress=()=>{},protectedSurfaceIds=[]}={}){
 const protectedIds=new Set([source?.surface?.id,...protectedSurfaceIds].filter(Boolean));let job,output,failure,failed=false;
 let lastProgress=-Infinity;const progress=(event,final=false)=>{const now=performance.now();if(final||now-lastProgress>=50){lastProgress=now;onProgress(event);}};
 async function retire(result){
  const ids=new Set([result?.surface?.id,result?.sourceRegionSourceSurface?.id,...Object.values(result?.planeSurfaces??{}).map(value=>value?.id)].filter(id=>id&&!protectedIds.has(id)));
  const errors=[];for(const id of ids)try{await engine.releaseSurface(id);}catch(error){errors.push(error);}
  if(errors.length)throw errors.length===1?errors[0]:Object.assign(new AggregateError(errors,'Synthesis frame retirement failed.'),{code:'CLEANUP_FAILED'});
 }
 try{
  checkAbort(signal);job=await engine.beginElaSynthesis({imageId:task.imageId,params:task.params,...(task.sourceRegionDomain?{sourceRegionDomain:task.sourceRegionDomain}:{})},{signal});
  if(job.imageId!==task.imageId||job.sourceSha256!==source?.sha256||!job.key||!Number.isSafeInteger(job.axis?.count)||job.axis.count<1||job.axis.states?.length!==job.axis.count)throw new EngineError('INVALID_INPUT','Synthesis preparation differs from its Original or quality axis.');
  if(!job.cacheHit)for(let index=0;index<job.axis.states.length;index++){
   checkAbort(signal);const state=job.axis.states[index];let frame,frameFailure,frameFailed=false;
   try{
    const hooks={signal,onProgress:event=>progress({...event,phase:'synthesis-quality',completed:index,total:job.axis.count,nativeFraction:event.fraction,fraction:index/job.axis.count})};
    frame=typeof engine.runElaSynthesisFrame==='function'?await engine.runElaSynthesisFrame({id:job.id,index,resultId:'synthesis-'+job.id+'-'+index,backend:task.backend??'auto'},hooks):await engine.run({id:'synthesis-'+job.id+'-'+index,imageId:task.imageId,operation:'ela.classic',params:state.params,backend:task.backend??'auto',regions:[],...(task.sourceRegionDomain?{sourceRegionDomain:task.sourceRegionDomain}:{})},hooks);
    checkAbort(signal);if(frame.imageId!==task.imageId||frame.operation!=='ela.classic'||frame.provenance?.originalSha256!==source.sha256)throw new EngineError('INVALID_INPUT','A synthesis frame no longer belongs to its Original.');
    await engine.appendElaSynthesis({id:job.id,result:frame},{signal});
   }catch(error){frameFailed=true;frameFailure=error;throw error;}
   finally{try{await retire(frame);}catch(error){if(frameFailed){if(frameFailure&&typeof frameFailure==='object'&&Object.isExtensible(frameFailure))frameFailure.synthesisRetirementError=error;}else throw error;}}
   progress({phase:'synthesis-quality',completed:index+1,total:job.axis.count,fraction:(index+1)/job.axis.count},index+1===job.axis.count);
  }
  checkAbort(signal);output=await engine.finishElaSynthesis({id:job.id,resultId:task.id},{signal});checkAbort(signal);
  if(output.imageId!==task.imageId||output.operation!=='ela.classic'||output.provenance?.originalSha256!==source.sha256||!output.surface)throw new EngineError('INVALID_INPUT','The complete synthesis differs from its Original.');
 }catch(error){failed=true;failure=error;throw error;}
 finally{
  let cleanupFailed=false,cleanupError;
  if(job)try{await engine.disposeElaSynthesis({id:job.id});}catch(error){if(failed){if(failure&&typeof failure==='object'&&Object.isExtensible(failure))failure.synthesisCleanupError=error;}else{cleanupFailed=true;cleanupError=error;}}
  if((failed||cleanupFailed)&&output)try{await retire(output);}catch(error){const primary=failed?failure:cleanupError;if(primary&&typeof primary==='object'&&Object.isExtensible(primary))primary.synthesisRetirementError=error;}
  if(cleanupFailed)throw cleanupError;
 }
 return output;
}
