// Install the protocol before loading the image-processing graph. A rejected
// module import is returned with its source and cause instead of a bare onerror.
function encodedError(error,seen=new Set()){
 if(seen.has(error))return {code:'WORKER_FAILED',message:'Circular error cause'};seen.add(error);
 const value={name:error?.name??'Error',code:error?.code??'WORKER_FAILED',message:error?.message??String(error),stack:error?.stack};
 if(error?.details!==undefined)try{value.details=structuredClone(error.details);}catch{value.details={diagnostic:String(error.details)};}
 if(error?.cause!==undefined)value.cause=encodedError(error.cause,seen);return value;
}
function receivedError(value){const error=Object.assign(Error(value?.message??String(value)),value&&typeof value==='object'?value:{});if(value?.cause!==undefined)error.cause=receivedError(value.cause);return error;}
export function installLoupeFullWorker(scope,{loadModule=url=>import(url)}={}){
 const results=new Map(),jobs=new Map(),reads=new Map();let serial=0,queue=Promise.resolve(),session=null,loading=null,runtime=null;
 const abortCheck=signal=>{if(signal?.aborted)throw Object.assign(Error('Loupe preparation cancelled'),{code:'CANCELLED'});};
 const replyError=(ticket,error,fatal=false)=>scope.postMessage({ticket,error:runtime?.serializeEngineError(error)??encodedError(error),...(fatal?{fatal:true}:{})});
 function load(){
  if(!loading){
   const modules=['./loupe-full-image.js?v=0.22.0','./unified-engine/src/cache.js','./unified-engine/src/temporary-storage.js','./unified-engine/src/errors.js','./unified-engine/src/adjust-math.js'];
   loading=Promise.all(modules.map(name=>{const sourceURL=new URL(name,import.meta.url).href;return Promise.resolve().then(()=>loadModule(sourceURL)).catch(cause=>{throw Object.assign(Error('Loupe processing module could not load.',{cause}),{code:'WORKER_MODULE_LOAD',details:{sourceURL,executionPhase:'initialization'}});});})).then(([image,cache,temporary,errors,adjust])=>runtime={buildLoupeImage:image.buildLoupeImage,budget:new cache.Budget(128*1024**2),createTemporarySession:temporary.createTemporarySession,serializeEngineError:errors.serializeEngineError,releaseAdjustWasm:adjust.releaseAdjustWasm});
  }
  return loading;
 }
 const temporarySession=()=>session??=runtime.createTemporarySession({budget:runtime.budget});
 function sourceWindow(ticket,rect,signal){
  abortCheck(signal);const read=++serial;
  return new Promise((resolve,reject)=>{
   const abort=()=>{reads.delete(read);reject(Object.assign(Error('Loupe preparation cancelled'),{code:'CANCELLED'}));};
   reads.set(read,{resolve:pixels=>{signal.removeEventListener('abort',abort);resolve({pixels,release(){}});},reject:error=>{signal.removeEventListener('abort',abort);reject(error);}});
   signal.addEventListener('abort',abort,{once:true});try{scope.postMessage({action:'source',ticket,read,rect});}catch(error){reads.delete(read);signal.removeEventListener('abort',abort);reject(error);}
  });
 }
 async function release(id){const record=results.get(id);if(!record)return;results.delete(id);await Promise.allSettled([...record.reads]);await record.surface.dispose();}
 async function build(job,controller){
  const {signal}=controller;let output;
  try{
   abortCheck(signal);await load();abortCheck(signal);let sourceReads=0;
   const source={descriptor:{width:job.width,height:job.height,id:String(job.ticket),revision:1,format:'rgb8'},readWindow:rect=>{sourceReads++;return sourceWindow(job.ticket,rect,signal);}};
   output=await runtime.buildLoupeImage(source,job.effects,{storageBudget:runtime.budget,temporarySession,signal,maxWorkers:Math.max(1,Math.min(32,globalThis.navigator?.hardwareConcurrency??1))});
   const step=Math.max(1,Math.ceil(Math.sqrt(job.width*job.height/(2*1024**2))),Math.ceil(job.width/4096),Math.ceil(job.height/4096));
   const preview=await output.surface.readSampledWindow({x:0,y:0,w:job.width,h:job.height,step},{signal});
   try{abortCheck(signal);results.set(job.ticket,{...output,reads:new Set()});scope.postMessage({ticket:job.ticket,resultId:job.ticket,preview:preview.pixels,metrics:{...output.metrics,sourceReads}},[preview.pixels.data.buffer]);output=null;}finally{preview.release();}
  }catch(error){replyError(job.ticket,error,error?.code==='WORKER_MODULE_LOAD');}
  finally{try{await output?.surface.dispose();runtime?.releaseAdjustWasm();}finally{jobs.delete(job.ticket);}}
 }
 function runTask(task,ticket){return task.catch(error=>{try{replyError(ticket,error,true);}catch(reportCause){const failure=Object.assign(Error('Loupe worker could not report its failure.',{cause:error}),{code:'WORKER_MESSAGE_FAILED',details:{executionPhase:'error-report',reportCause:encodedError(reportCause)}});(scope.setTimeout?.bind(scope)??setTimeout)(()=>{throw failure;},0);}});}
 scope.onmessage=({data:message})=>{
  if(!message||typeof message!=='object'||Array.isArray(message)){replyError(undefined,Object.assign(Error('Invalid loupe worker request.'),{code:'WORKER_MESSAGE_FAILED',details:{executionPhase:'message-receive'}}),true);return;}
  if(message.action==='source'){const pending=reads.get(message.read);reads.delete(message.read);if(pending){if(message.error)pending.reject(receivedError(message.error));else pending.resolve(message.pixels);}return;}
  if(message.action==='build'){const controller=new AbortController();jobs.set(message.ticket,controller);const run=()=>build(message,controller);queue=runTask(queue.then(run,run),message.ticket);return;}
  if(message.action==='cancel'){jobs.get(message.ticket)?.abort();return;}
  if(message.action==='release'){runTask(release(message.resultId),message.ticket);return;}
  if(message.action==='read'){
   const record=results.get(message.resultId);if(!record){scope.postMessage({ticket:message.ticket,error:{code:'DISPOSED',message:'Loupe image released'}});return;}
   const task=(async()=>{let part;try{part=await record.surface.readSampledWindow(message.tile);scope.postMessage({ticket:message.ticket,pixels:part.pixels},[part.pixels.data.buffer]);}catch(error){replyError(message.ticket,error);}finally{part?.release();}})();
   record.reads.add(task);const tracked=task.finally(()=>record.reads.delete(task));runTask(tracked,message.ticket);return;
  }
  if(message.action==='dispose'){for(const controller of jobs.values())controller.abort();runTask(queue.then(async()=>{await Promise.all([...results.keys()].map(release));if(session)await(await session).dispose();scope.postMessage({action:'disposed'});}),message.ticket);return;}
  replyError(message.ticket,Object.assign(Error('Unknown loupe worker request.'),{code:'WORKER_MESSAGE_FAILED',details:{executionPhase:'message-receive'}}),true);
 };
 scope.onmessageerror=event=>replyError(undefined,Object.assign(Error('Loupe worker request could not be decoded.',{cause:event.error}),{code:'WORKER_MESSAGE_FAILED',details:{executionPhase:'message-receive'}}),true);
 return {get pending(){return jobs.size;}};
}
if(typeof self!=='undefined'&&typeof document==='undefined')installLoupeFullWorker(self);
