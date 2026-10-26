import {nativeTiles,tileId,tileBounds} from './pdf-native-tile-plan.js';
import {isRecord,positiveId,validRect,validRgb,validError,encodeError,decodeError,protocolFailure} from './loupe-native-protocol.js';

// Full-width arithmetic bands are shared by all horizontal tiles. Finish a
// native tile row before opening another, starting at the visible centre.
function compareNativeRows(a,b,centre){return Math.abs(a.y+a.height/2-centre.y)-Math.abs(b.y+b.height/2-centre.y)||a.y-b.y||Math.abs(a.x+a.width/2-centre.x)-Math.abs(b.x+b.width/2-centre.x)||a.x-b.x;}
export function nativeRowOrder(tiles,centre){return [...tiles].sort((a,b)=>compareNativeRows(a,b,centre));}
export const packedNativeTileOffset=(width,rect)=>(rect.y*width+rect.x*rect.height)*3;

const cancelled=()=>Object.assign(Error('Préparation remplacée'),{code:'CANCELLED'});
export function installNativeTileWorker(scope,{loadModule=url=>import(url)}={}){
 const records=new Map(),reads=new Map(),builds=new Map(),requests=[],idleWaiters=new Set(),releases=new Set();let serial=0,running=false,active=null,wake=null,loading=null,runtime=null,session=null,disposed=false,lastPriority=0,lastTicket=0,disposeTask=null,transportFailed=false,fatalSent=false,reported=false,scopeClosed=false;
 // Yield a task boundary without the browser's nested-timer minimum per tile.
 // Priority and cancellation messages still run between bounded native tiles.
 const channel=typeof MessageChannel==='function'?new MessageChannel():null,yields=[];
 if(channel){channel.port1.onmessage=()=>yields.shift()?.();channel.port1.unref?.();channel.port2.unref?.();}
 const taskBoundary=()=>channel?new Promise(resolve=>{yields.push(resolve);channel.port2.postMessage(0);}):new Promise(resolve=>setTimeout(resolve,0));
 function reportUnsendable(error){if(reported)return;reported=true;if(typeof scope.reportError==='function')scope.reportError(error);else queueMicrotask(()=>{throw error;});}
 function closeScope(){if(scopeClosed)return;scopeClosed=true;try{scope.close?.();}catch(error){reportUnsendable(error);}}
 function post(message,transfer){if(transportFailed)return false;try{scope.postMessage(message,transfer);return true;}catch(cause){const error=protocolFailure('Native loupe response could not be sent.',{executionPhase:'worker-message-send',action:message.action},cause);transportFailed=true;fatal(error);return false;}}
 function errorReply(ticket,error,fatalReply=false){if(fatalReply){fatal(error,ticket);return false;}return post({ticket,error:encodeError(error)});}
 function fatal(error,ticket){
  if(!fatalSent){fatalSent=true;try{scope.postMessage({...(positiveId(ticket)?{ticket}:{}),fatal:true,error:encodeError(error)});}catch{transportFailed=true;reportUnsendable(error);}}
  void disposeAll();
 }
 const waitIdle=record=>!running||record&&active?.record!==record?Promise.resolve():new Promise(resolve=>idleWaiters.add({record,resolve}));
 function notifyIdle(){for(const waiter of idleWaiters)if(!running||waiter.record&&active?.record!==waiter.record){idleWaiters.delete(waiter);waiter.resolve();}}
 const cleanupFailure=errors=>Object.assign(Error('Native loupe cleanup failed.',{cause:errors[0]}),{code:'CLEANUP_FAILED',details:{failures:errors.map(error=>encodeError(error))}});
 function claimTicket(message,optional=false){if(optional&&message.ticket===undefined)return;if(!positiveId(message.ticket)||message.ticket<=lastTicket)throw protocolFailure('Invalid or reused native loupe request identity.',{action:message.action,ticket:message.ticket});lastTicket=message.ticket;}
 function validAllowed(values,width,height){return values===undefined||Array.isArray(values)&&values.every(value=>{if(typeof value!=='string'||!/^\d+:\d+$/.test(value))return false;const[x,y]=value.split(':').map(Number);return Number.isSafeInteger(x)&&Number.isSafeInteger(y)&&x%128===0&&y%128===0&&x<width&&y<height;});}
 function validNativeRect(rect,record){return validRect(rect,record.width,record.height)&&rect.x%128===0&&rect.y%128===0&&rect.width===Math.min(128,record.width-rect.x)&&rect.height===Math.min(128,record.height-rect.y)&&(!record.allowed||record.allowed.has(tileId(rect)));}
 function load(memoryBudgetBytes=128*1024**2){return loading??=Promise.all(['./pdf-native-regional-image.js','./unified-engine/src/temporary-storage.js','./unified-engine/src/cache.js','./unified-engine/src/segmented-bytes.js'].map(name=>{const sourceURL=new URL(name,import.meta.url).href;return Promise.resolve().then(()=>loadModule(sourceURL)).catch(cause=>{throw Object.assign(Error('Loupe processing module could not load.',{cause}),{code:'WORKER_MODULE_LOAD',details:{sourceURL,executionPhase:'initialization'}});});})).then(([image,temp,cache,bytes])=>runtime={create:image.createRegionalLoupeImage,temporary:temp.createTemporarySession,store:bytes.createSegmentedBytes,budget:new cache.Budget(memoryBudgetBytes)});}
 const temporarySession=()=>session??=Promise.resolve(runtime.temporary({budget:runtime.budget})).then(value=>{runtime.temporaryBackend=value.backend??null;return value;});
 function sourceWindow(ticket,rect,signal){
  if(disposed||signal?.aborted)return Promise.reject(cancelled());if(!validRect(rect)||!Number.isSafeInteger(rect.width*rect.height*3))return Promise.reject(protocolFailure('Invalid native loupe source window.'));const read=++serial;
  return new Promise((resolve,reject)=>{let release,settled=false;const cleanup=()=>{reads.delete(read);signal?.removeEventListener('abort',abort);},abort=()=>{if(settled)return;settled=true;cleanup();release?.();reject(cancelled());};
   try{release=runtime.budget.reserve(rect.width*rect.height*3);reads.set(read,{rect,resolve:pixels=>{if(settled)return;settled=true;cleanup();try{if(signal?.aborted)throw cancelled();if(!validRgb(pixels,rect))throw Object.assign(Error('Invalid native loupe source window.'),{code:'INVALID_INPUT'});let released=false;resolve({pixels,release(){if(released)return;released=true;release();}});}catch(error){release();reject(error);}},reject:error=>{if(settled)return;settled=true;cleanup();release();reject(error);}});signal?.addEventListener('abort',abort,{once:true});if(!post({action:'source',ticket,read,rect}))abort();}catch(error){settled=true;cleanup();release?.();reject(error);}});
 }
 function metrics(record){return {...record.surface.metrics,computedTiles:record.done.size,tileComputationAttempts:record.attempted.size+record.recomputedTiles,recomputedTiles:record.recomputedTiles,totalTiles:record.all.length,visibleTiles:record.priority.size,workerCacheBytes:record.bytes,outputStoreBytes:record.width*record.height*3,outputStoreStorage:record.store?.storage??null,outputStoreBackend:record.store?.storage==='temporary'?runtime.temporaryBackend??null:null,storedTileReads:record.storeReads,outputStoreReads:record.storeReads,outputStoreWrites:record.storeWrites,background:record.background,memory:runtime.budget.snapshot()};}
 function progress(record){post({action:'progress',resultId:record.id,metrics:metrics(record)});}
 function evict(record,key){const entry=record.cache.get(key);if(!entry)return;record.cache.delete(key);record.bytes-=entry.pixels.data.byteLength;entry.release();}
 function clearCache(record){const errors=[];for(const key of [...record.cache.keys()])try{evict(record,key);}catch(error){errors.push(error);}if(errors.length)throw cleanupFailure(errors);}
 function retain(record,key,pixels){const limit=Math.min(32*1024**2,Math.floor(runtime.budget.limit/8));if(pixels.data.byteLength>limit)return pixels;
  while(record.bytes+pixels.data.byteLength>limit&&record.cache.size){const first=[...record.cache.keys()].find(k=>!record.priority.has(k))??record.cache.keys().next().value;evict(record,first);}let release;try{release=runtime.budget.reserve(pixels.data.byteLength);}catch(error){if(error.code!=='MEMORY_LIMIT')throw error;return pixels;}
  try{const value={...pixels,data:new Uint8Array(pixels.data)};record.cache.set(key,{pixels:value,release});record.bytes+=value.data.byteLength;return value;}catch(error){release();throw error;}}
 async function outputStore(record,signal){if(record.store)return record.store;if(!record.storeTask){const task=runtime.store(record.width*record.height*3,{budget:runtime.budget,getTemporarySession:temporarySession,signal,owner:'loupe-native-output:'+record.id,label:'native-loupe-output'});record.storeTask=task;try{record.store=await task;}finally{if(record.storeTask===task)record.storeTask=null;}}else await record.storeTask;if(signal.aborted||record.closed)throw cancelled();return record.store;}
 async function tile(record,rect,signal){const key=tileId(rect),cached=record.cache.get(key);if(cached){record.cache.delete(key);record.cache.set(key,cached);return cached.pixels;}if(signal.aborted)throw cancelled();
  const store=await outputStore(record,signal),offset=packedNativeTileOffset(record.width,rect);let part;
  try{if(record.done.has(key)){const release=runtime.budget.reserve(rect.width*rect.height*3);try{const data=new Uint8Array(rect.width*rect.height*3);await store.readInto(data,offset,{signal});if(signal.aborted||record.closed)throw cancelled();part={pixels:{width:rect.width,height:rect.height,format:'rgb8',data},release};record.storeReads++;}catch(error){release();throw error;}}
   else{if(record.attempted.has(key))record.recomputedTiles++;else record.attempted.add(key);part=await record.surface.readWindow(rect,{signal});}
   if(signal.aborted||record.closed)throw cancelled();if(!validRgb(part.pixels,rect))throw Object.assign(Error('Invalid native loupe output tile.'),{code:'INVALID_INPUT'});if(!record.done.has(key)){await store.write(part.pixels.data,offset,{signal});if(signal.aborted||record.closed)throw cancelled();record.done.add(key);record.storeWrites++;}const value=retain(record,key,part.pixels);if(record.done.size%32===0||record.priority.has(key))progress(record);return value;
  }catch(error){if(!record.done.size&&record.store===store){record.store=null;await store.dispose();}throw error;}finally{part?.release();}}
 async function window(record,rect,signal){
  const tiles=nativeTiles(record.width,record.height,{left:rect.x,top:rect.y,right:rect.x+rect.width,bottom:rect.y+rect.height}).filter(r=>!record.allowed||record.allowed.has(tileId(r))),data=new Uint8Array(rect.width*rect.height*3);
  for(const r of tiles){const pixels=await tile(record,r,signal),left=Math.max(rect.x,r.x),top=Math.max(rect.y,r.y),right=Math.min(rect.x+rect.width,r.x+r.width),bottom=Math.min(rect.y+rect.height,r.y+r.height);for(let y=top;y<bottom;y++){const start=((y-r.y)*r.width+left-r.x)*3;data.set(pixels.data.subarray(start,start+(right-left)*3),((y-rect.y)*rect.width+left-rect.x)*3);}}
  return {width:rect.width,height:rect.height,format:'rgb8',data};
 }
 function stop(record){record.background=false;record.suspended=true;if(active?.record===record)active.controller.abort();for(let i=requests.length-1;i>=0;i--)if(requests[i].record===record&&!requests[i].explicit){errorReply(requests[i].message.ticket,cancelled());requests.splice(i,1);}progress(record);}
 function next(){
  const build=[...builds.values()].find(v=>!v.started);if(build)return {kind:'build',build};
  if(requests.length){const rank=request=>request.explicit?2:request.record.priority.has(tileId(request.message.rect))?1:0,compare=(a,b)=>rank(b)-rank(a)||b.record.priorityAt-a.record.priorityAt||(a.record===b.record?compareNativeRows(a.message.rect,b.message.rect,a.record.centre??{x:0,y:0}):a.record.id-b.record.id);let best=0;for(let i=1;i<requests.length;i++)if(compare(requests[i],requests[best])<0)best=i;return {kind:'read',...requests.splice(best,1)[0]};}
  // No result starts outside work until all its visible requests have arrived.
  for(const record of [...records.values()].filter(r=>r.background&&!r.closed).sort((a,b)=>b.priorityAt-a.priorityAt)){
   const rect=record.order.find(r=>!record.done.has(tileId(r)));if(rect){if(record.priorityMode!=='background'){record.surface.setPriority?.(record.order.filter(r=>!record.done.has(tileId(r))));record.priorityMode='background';}return {kind:'background',record,rect};}record.background=false;progress(record);
  }
 }
 async function pump(){
  if(running||disposed)return;running=true;
  try{for(;!disposed;){const task=next();if(!task)break;const controller=task.kind==='build'?task.build.controller:new AbortController();active={...task,controller};
   try{
    if(task.kind==='build'){
     const {message}=task.build;task.build.started=true;if(controller.signal.aborted)throw cancelled();await load(message.memoryBudgetBytes);if(controller.signal.aborted)throw cancelled();
     const {width,height}=message;const surface=runtime.create({descriptor:{width,height,format:'rgb8'},readWindow:(rect,{signal}={})=>validRect(rect,width,height)?sourceWindow(message.ticket,rect,signal):Promise.reject(protocolFailure('Native loupe source request exceeds its image.'))},message.effects,{temporarySession,budget:runtime.budget});
     const allowed=message.allowedTiles?new Set(message.allowedTiles):null,record={id:message.ticket,surface,width,height,allowed,all:nativeTiles(width,height).filter(r=>!allowed||allowed.has(tileId(r))),order:[],cache:new Map(),bytes:0,store:null,storeTask:null,storeReads:0,storeWrites:0,done:new Set(),attempted:new Set(),recomputedTiles:0,priority:new Set(),priorityAt:0,background:false,suspended:false,closed:false};try{record.unregister=runtime.budget.registerReclaimer(()=>clearCache(record),{owner:'loupe-native-tiles:'+record.id,label:'Exact native effect tiles',allocationKind:'array-buffer'});records.set(record.id,record);if(!post({ticket:message.ticket,resultId:record.id,metrics:metrics(record)}))await release(record);}catch(error){await release(record);throw error;}
    }else{
     const {record}=task;if(record.closed||controller.signal.aborted)throw cancelled();
     if(task.kind==='read'){const pixels=await window(record,task.message.rect,controller.signal);if(!validRgb(pixels,task.message.rect))throw protocolFailure('Invalid native loupe output window.');post({ticket:task.message.ticket,pixels},[pixels.data.buffer]);}
     else await tile(record,task.rect,controller.signal);
    }
   }catch(error){if(task.kind==='build')errorReply(task.build.message.ticket,error,error?.code==='WORKER_MODULE_LOAD');else if(task.kind==='read')errorReply(task.message.ticket,error);else if(error?.code!=='CANCELLED'){task.record.background=false;post({action:'progress',resultId:task.record.id,error:encodeError(error),metrics:metrics(task.record)});}}
   finally{if(task.kind==='build')builds.delete(task.build.message.ticket);active=null;notifyIdle();}
   // A bounded native tile is the longest non-preemptible arithmetic section.
   // Let priority/cancel messages run before choosing the next section.
   if(!disposed)await taskBoundary();
  }}finally{running=false;notifyIdle();}
 }
 function kick(){if(wake!==null)return;wake=setTimeout(()=>{wake=null;void pump().catch(error=>errorReply(undefined,error,true));},0);}
 function release(record){
  if(!record)return Promise.resolve();if(record.releaseTask)return record.releaseTask;
  record.closed=true;const earlyErrors=[];try{stop(record);}catch(error){earlyErrors.push(error);}records.delete(record.id);
  const task=(async()=>{await waitIdle(record);const results=await Promise.allSettled([
   Promise.resolve().then(()=>record.unregister?.()),Promise.resolve().then(()=>clearCache(record)),Promise.resolve().then(()=>record.surface.dispose()),
   (async()=>{await record.storeTask?.catch(()=>{});try{await record.store?.dispose();}finally{record.store=null;}})()
  ]),errors=[...earlyErrors,...results.filter(value=>value.status==='rejected').map(value=>value.reason)];if(errors.length)throw cleanupFailure(errors);})();
  record.releaseTask=task;releases.add(task);task.finally(()=>releases.delete(task)).catch(()=>{});return task;
 }
 function disposeAll(){
  if(disposeTask)return disposeTask;let finish;disposeTask=new Promise(resolve=>{finish=resolve;});disposed=true;if(wake!==null){clearTimeout(wake);wake=null;}
  for(const build of [...builds.values()]){build.controller.abort();if(!build.started){builds.delete(build.message.ticket);errorReply(build.message.ticket,cancelled());}}
  active?.controller.abort();for(const request of requests.splice(0))errorReply(request.message.ticket,cancelled());for(const read of [...reads.values()])read.reject(cancelled());
  // Defer cleanup by one microtask so every concurrent close joins this task,
  // including a transport failure raised while cancelling queued requests.
  void Promise.resolve().then(async()=>{
   await waitIdle();const errors=[],tasks=new Set([...releases,...[...records.values()].map(record=>release(record))]);
   for(const value of await Promise.allSettled([...tasks]))if(value.status==='rejected')errors.push(value.reason);
   const retired=session;session=null;if(retired)try{await(await retired).dispose();}catch(error){errors.push(error);}
   channel?.port1.close();channel?.port2.close();for(const resolve of yields.splice(0))resolve();
   const result={action:'disposed',memory:runtime?.budget.snapshot(),...(errors.length?{error:encodeError(cleanupFailure(errors))}:{})};post(result);closeScope();return result;
  }).catch(error=>{if(!transportFailed)errorReply(undefined,error,true);else reportUnsendable(error);closeScope();return{action:'disposed',error:encodeError(error)};}).then(finish);
  return disposeTask;
 }
 scope.onmessage=({data:message})=>{
  try{
  if(!isRecord(message)||typeof message.action!=='string')throw protocolFailure('Invalid native worker message.');
  if(message.action==='source'){
   if(!positiveId(message.read)||message.read>serial)throw protocolFailure('Invalid native loupe source response identity.');const pending=reads.get(message.read);if(!pending)return;
   if((message.error===undefined)===(message.pixels===undefined)||message.error!==undefined&&!validError(message.error))throw protocolFailure('Invalid native loupe source response.');
   if(message.error!==undefined)pending.reject(decodeError(message.error));else pending.resolve(message.pixels);return;
  }
  if(message.action==='dispose'){disposeAll();return;}
  if(disposed){if(positiveId(message.ticket)&&message.action!=='cancel')errorReply(message.ticket,cancelled());return;}
  if(message.action==='build'){
   claimTicket(message);if(!positiveId(message.width)||!positiveId(message.height)||!Number.isSafeInteger(message.width*message.height*3)||!isRecord(message.effects)||message.memoryBudgetBytes!==undefined&&!positiveId(message.memoryBudgetBytes)||!validAllowed(message.allowedTiles,message.width,message.height))throw protocolFailure('Invalid native loupe build request.');
   if(active?.kind==='background')active.controller.abort();builds.set(message.ticket,{message,controller:new AbortController(),started:false});kick();return;
  }
  if(message.action==='cancel'){if(!positiveId(message.ticket)||message.ticket>lastTicket)throw protocolFailure('Invalid native loupe cancellation identity.');const build=builds.get(message.ticket);if(build){build.controller.abort();if(!build.started){builds.delete(message.ticket);errorReply(message.ticket,cancelled());}}return;}
  if(!['priority','suspend','release','read'].includes(message.action)||!positiveId(message.resultId)||message.resultId>lastTicket)throw protocolFailure('Invalid native loupe result identity.',{action:message.action});
  const record=records.get(message.resultId);
  if(message.action==='priority'){
   if(!record||record.closed)return;if(!Array.isArray(message.regions)||!message.regions.length||!message.regions.every(rect=>validNativeRect(rect,record))||message.background!==undefined&&typeof message.background!=='boolean')throw protocolFailure('Invalid native loupe priority regions.');record.priority=new Set(message.regions.map(tileId));record.priorityAt=++lastPriority;record.suspended=false;record.background=message.background!==false;
   for(let i=requests.length-1;i>=0;i--)if(requests[i].record===record&&!requests[i].explicit&&!record.priority.has(tileId(requests[i].message.rect))){errorReply(requests[i].message.ticket,cancelled());requests.splice(i,1);}
   const b=tileBounds(message.regions),centre={x:(b.left+b.right)/2,y:(b.top+b.bottom)/2};record.centre=centre;record.order=nativeRowOrder(record.all,centre);record.surface.setPriority?.(message.regions.filter(r=>!record.done.has(tileId(r))));record.priorityMode='visible';if(active?.kind==='background'&&(!record.priority.has(tileId(active.rect))||active.record!==record))active.controller.abort();kick();return;
  }
  if(message.action==='suspend'){if(record)stop(record);return;}
  if(message.action==='release'){claimTicket(message,true);void release(record).then(()=>{if(message.ticket)post({ticket:message.ticket,released:true,memory:runtime?.budget.snapshot()});},error=>errorReply(message.ticket,error));return;}
  if(message.action==='read'){claimTicket(message);if(!record||record.closed){errorReply(message.ticket,cancelled());return;}if(!validRect(message.rect,record.width,record.height)||!Number.isSafeInteger(message.rect.width*message.rect.height*3)||message.explicit!==undefined&&typeof message.explicit!=='boolean')throw protocolFailure('Invalid native loupe read window.');requests.push({record,message,explicit:!!message.explicit});if(active?.kind==='background')active.controller.abort();kick();return;}
  }catch(error){errorReply(positiveId(message?.ticket)?message.ticket:undefined,error,true);}
 };
 scope.onmessageerror=event=>fatal(protocolFailure('Native worker message could not be decoded.',{executionPhase:'worker-message-receive'},event.error));
 return {get pending(){return builds.size+requests.length;},get disposed(){return disposed;},get closedTask(){return disposeTask;}};
}
if(typeof self!=='undefined'&&typeof document==='undefined')installNativeTileWorker(self);
