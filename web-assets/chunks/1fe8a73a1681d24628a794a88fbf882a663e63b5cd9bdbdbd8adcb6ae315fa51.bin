// Optional latest-request-wins scheduling. The supplied engine has exclusive
// use while attached; published outputs remain owned by their callers.
const failure=(code,message,cause)=>Object.assign(new Error(message,cause===undefined?undefined:{cause}),{code});
const cancelled=reason=>failure('CANCELLED','Interactive 7C request cancelled or superseded.',reason);
const snapshotParams=value=>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw failure('INVALID_INPUT','7C parameters must be an object.');
 const params=Object.freeze({micro:0,revelation:0,precision:'reference',backend:'auto',computationMode:'precision',path:'auto',prepareRevelationRange:false,...value});
 if(!Number.isFinite(params.micro)||params.micro<0||params.micro>1||!Number.isFinite(params.revelation)||params.revelation<0||params.revelation>1||typeof params.prepareRevelationRange!=='boolean'||!['fast','precision'].includes(params.computationMode)||!['reference','1e-2','1e-4','1e-7'].includes(params.precision)||!['auto','cpu','webgpu'].includes(params.backend)||!['auto','resident','bounded'].includes(params.path))throw failure('INVALID_INPUT','Invalid normalized 7C controls.');
 return params;
};
const sameFamily=(a,b,unifiedExecution=false)=>{
 if(a.source!==b.source||a.hooks.initialize!==b.hooks.initialize)return false;
 // Range preparation is a cache preference, not a different scientific input.
 // A unified engine accepts the old path names as aliases of the same work.
 // Other supplied engines may still give those names different meanings.
 const scientific=key=>key!=='revelation'&&key!=='prepareRevelationRange'&&!(unifiedExecution&&key==='path');
 const keys=Object.keys(a.params).filter(scientific),other=Object.keys(b.params).filter(scientific);
 return keys.length===other.length&&keys.every(key=>Object.hasOwn(b.params,key)&&Object.is(a.params[key],b.params[key]));
};

/**
 * run(source, params, hooks) replaces older pending requests. Submit the new
 * revelation with run(); aborting the previous external signal first means an
 * actual cancellation and cannot preserve that preparation retroactively.
 *
 * cancel() waits for the active engine call and obsolete-output/source cleanup.
 * retryCleanup() retries refused retirement before admitting more requests.
 * dispose() closes this controller; ownEngine=true also disposes the engine.
 * Neither cancel nor dispose releases outputs already delivered to callers.
 */
export function createInteractive7C(engine,{ownEngine=false}={}){
 if(typeof engine?.run!=='function'||ownEngine&&typeof engine.dispose!=='function')throw failure('INVALID_INPUT','An owned-window 7C engine is required.');
 const unifiedExecution=engine.executionModel==='unified-native';
 let active=null,pending=null,pump=null,barrier=null,closed=false,blocked=false,sequence=0,engineDisposed=false;
 const retirements=new Set();
 const metrics={accepted:0,engineCalls:0,superseded:0,preparationsPreserved:0,activeAborts:0,published:0,discarded:0,cleanupFailures:0,signalDetachFailures:0};
 const detach=job=>{if(job.abortListener){try{job.hooks.signal.removeEventListener('abort',job.abortListener);}catch{metrics.signalDetachFailures++;}finally{job.abortListener=null;}}};
 function settle(job,error,result){if(job.settled)return false;job.settled=true;detach(job);if(arguments.length===3)job.resolve(result);else job.reject(error);return true;}
 const abortActive=reason=>{if(active&&!active.controller.signal.aborted){metrics.activeAborts++;active.controller.abort(reason);}};
 function cleanupError(primary){
  const errors=[...retirements].filter(owner=>owner.failed).map(owner=>owner.error);
  const cause=arguments.length?primary:active?.failed?active.failure:[...retirements].find(owner=>owner.primary!==undefined)?.primary??errors[0];
  const error=failure('CLEANUP_PENDING','Interactive 7C retirement has not acknowledged completion; retry cleanup before another request.',cause);
  error.cleanupErrors=errors;error.retryCleanup=()=>api.retryCleanup();return error;
 }
 function block(owner,error){
  owner.error=error;owner.failed=true;blocked=true;metrics.cleanupFailures++;
  if(pending){const job=pending;pending=null;settle(job,cleanupError());retireSource(job);}
  if(active){settle(active,cleanupError());abortActive(error);}
 }
 function retirement(release,label,options={}){
  const owner={release,label,error:options.knownFailure,primary:options.primary,task:null,failed:false};retirements.add(owner);
  if(Object.hasOwn(options,'knownFailure')){block(owner,options.knownFailure);return owner;}
  attempt(owner);return owner;
 }
 function attempt(owner){
  if(owner.task)return owner.task;
  owner.error=undefined;owner.failed=false;
  const task=Promise.resolve().then(()=>owner.release()).then(()=>{retirements.delete(owner);owner.release=null;},error=>{block(owner,error);throw error;}).finally(()=>{if(owner.task===task)owner.task=null;});
  owner.task=task;void task.catch(()=>{});return task;
 }
 function retireSource(job){
  if(!job.releaseSource)return null;const release=job.releaseSource;job.releaseSource=null;
  return retirement(release,'request-source');
 }
 async function drain({retry=false}={}){
  if(retry)for(const owner of [...retirements])if(!owner.task)attempt(owner);
  // New source retirement can be added when a failure rejects the pending job.
  while([...retirements].some(owner=>owner.task))await Promise.allSettled([...retirements].map(owner=>owner.task).filter(Boolean));
  if([...retirements].some(owner=>owner.failed))throw cleanupError();
 }
 function supersede(job){if(settle(job,cancelled('superseded')))metrics.superseded++;}
 function startPump(){
  if(pump||!pending||blocked||closed||barrier)return;
  const task=Promise.resolve().then(async()=>{
   while(pending&&!blocked&&!closed&&!barrier){
    await drain();if(!pending||blocked||closed||barrier)break;
    const job=pending;pending=null;active=job;let output,error,hasError=false;
    metrics.engineCalls++;
    try{
     output=await engine.run(job.source,job.params,{...job.hooks,signal:job.controller.signal,onProgress:event=>{
      const recipient=!job.settled?job:pending&&sameFamily(job,pending,unifiedExecution)&&!job.controller.signal.aborted?pending:null;
      recipient?.hooks.onProgress?.(event);
     }});
     if(!output||typeof output.release!=='function'){output=null;throw failure('INVALID_OUTPUT','The interactive engine must return an owned result with release().');}
    }catch(cause){
     error=cause;hasError=true;job.failure=cause;job.failed=true;
     if(typeof cause?.retryCleanup==='function')retirement(()=>cause.retryCleanup(),'engine-failure',{knownFailure:cause.cleanupError??cause,primary:cause});
    }
    // The engine must have settled before any following run starts. An output
    // that became obsolete before delivery is retired under the same barrier.
    if(output&&(job.settled||job.controller.signal.aborted||closed||hasError||blocked)){
     metrics.discarded++;const obsolete=output;output=null;retirement(()=>obsolete.release(),'obsolete-output');
    }
    retireSource(job);
    try{await drain();}catch(cleanup){error=cleanupError(hasError?error:cleanup);hasError=true;}
    if(output&&(job.settled||job.controller.signal.aborted||closed||blocked)){
     metrics.discarded++;const obsolete=output;output=null;retirement(()=>obsolete.release(),'unpublished-output');
     try{await drain();}catch(cleanup){error=cleanupError(hasError?error:cleanup);hasError=true;}
    }
    if(output){metrics.published++;settle(job,null,output);}
    else if(!job.settled)settle(job,hasError?error:cancelled(job.controller.signal.reason));
    detach(job);active=null;
   }
  }).catch(error=>{
   // Unexpected controller errors still reject queued work rather than leaving
   // a promise waiting forever behind a stopped pump.
   if(pending){const job=pending;pending=null;settle(job,error);retireSource(job);}
   if(active){settle(active,error);retireSource(active);active=null;}
  }).finally(()=>{if(pump===task)pump=null;startPump();});
  pump=task;
 }
 function removePending(reason){if(!pending)return;const job=pending;pending=null;settle(job,cancelled(reason));retireSource(job);}
 function stop(reason){
  removePending(reason);if(active){settle(active,cancelled(reason));abortActive(reason);}
 }
 function lifecycle(action){
  if(barrier)return barrier.catch(()=>{}).then(()=>lifecycle(action));
  const task=Promise.resolve().then(action).finally(()=>{if(barrier===task)barrier=null;});barrier=task;return task;
 }
 const api={
  run(source,params={},hooks={}){
   let normalized,captured,releaseSource;
   try{
    if(closed)throw failure('DISPOSED','Interactive 7C controller is closed.');
    if(blocked)throw cleanupError();
    if(barrier)throw failure('BUSY','Await interactive cancellation or retirement.');
    normalized=snapshotParams(params);
    if(!source?.immutable||typeof source.retain!=='function')throw failure('INVALID_INPUT','An immutable retained source is required.');
    if(!hooks||typeof hooks!=='object'||Array.isArray(hooks))throw failure('INVALID_INPUT','7C hooks must be an object.');
    captured=Object.freeze({...hooks});
    if(captured.signal?.aborted)throw cancelled(captured.signal.reason);
    if(captured.signal&&(typeof captured.signal.addEventListener!=='function'||typeof captured.signal.removeEventListener!=='function')||captured.onProgress!==undefined&&typeof captured.onProgress!=='function')throw failure('INVALID_INPUT','Invalid abort signal or progress callback.');
    releaseSource=source.retain();if(typeof releaseSource!=='function')throw failure('INVALID_INPUT','Source retain must return its release callback.');
   }catch(error){return Promise.reject(error);}
   let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});void promise.catch(()=>{});
   const job={id:++sequence,source,params:normalized,hooks:captured,releaseSource,controller:new AbortController(),resolve,reject,settled:false,abortListener:null};
   if(captured.signal){
    job.abortListener=()=>{
     if(job.settled)return;
     if(pending===job){pending=null;settle(job,cancelled(captured.signal.reason));retireSource(job);if(active?.settled)abortActive(captured.signal.reason);}
     else if(active===job){settle(job,cancelled(captured.signal.reason));abortActive(captured.signal.reason);}
     else{settle(job,cancelled(captured.signal.reason));retireSource(job);}
    };
    try{captured.signal.addEventListener('abort',job.abortListener,{once:true});if(captured.signal.aborted)job.abortListener();}
    catch(error){settle(job,error);retireSource(job);return promise;}
   }
   if(job.settled)return promise;
   metrics.accepted++;
   if(pending){const old=pending;pending=null;supersede(old);retireSource(old);}
   if(active){
    supersede(active);
    if(sameFamily(active,job,unifiedExecution)&&!active.controller.signal.aborted)metrics.preparationsPreserved++;
    else abortActive(cancelled('different-scientific-request'));
   }
   pending=job;
   startPump();return promise;
  },
  cancel(reason='cancelled'){
   stop(reason);return lifecycle(async()=>{await pump;await drain();});
  },
  retryCleanup(){
   if(active&&!active.controller.signal.aborted)stop('cleanup-retry');
   return lifecycle(async()=>{await pump;await drain({retry:true});blocked=false;});
  },
  dispose(){
   closed=true;stop('disposed');
   return lifecycle(async()=>{
    await pump;await drain({retry:true});blocked=false;
    if(ownEngine&&!engineDisposed){retirement(async()=>{await engine.dispose();engineDisposed=true;},'owned-engine');await drain();}
   });
  },
  state(){return Object.freeze({closed,blocked,barrier:!!barrier,active:active?.id??null,pending:pending?.id??null,activeCount:active?1:0,pendingCount:pending?1:0,retiringOwners:retirements.size,ownEngine,engineDisposed,metrics:Object.freeze({...metrics})});}
 };
 return api;
}
