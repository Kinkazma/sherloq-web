import {nativeTiles,tileId,centreOrder,tileBounds} from './pdf-native-tile-plan.js?v=0.24.0';

const cancelled=()=>Object.assign(Error('Préparation remplacée'),{code:'CANCELLED'});
function encode(error){return {code:error?.code??'WORKER_FAILED',message:error?.message??String(error),stack:error?.stack,...(error?.details?{details:error.details}:{}),...(error?.cause?{cause:encode(error.cause)}:{})};}
export function installNativeTileWorker(scope,{loadModule=url=>import(url)}={}){
 const records=new Map(),reads=new Map(),builds=new Map(),requests=[];let serial=0,running=false,active=null,wake=null,loading=null,runtime=null,session=null,disposed=false,lastPriority=0;
 const post=message=>scope.postMessage(message),errorReply=(ticket,error,fatal=false)=>post({ticket,error:encode(error),...(fatal?{fatal:true}:{})});
 function load(memoryBudgetBytes=128*1024**2){return loading??=Promise.all(['./pdf-native-regional-image.js?v=0.24.0','./unified-engine/src/temporary-storage.js','./unified-engine/src/cache.js'].map(name=>{const sourceURL=new URL(name,import.meta.url).href;return Promise.resolve().then(()=>loadModule(sourceURL)).catch(cause=>{throw Object.assign(Error('Loupe processing module could not load.',{cause}),{code:'WORKER_MODULE_LOAD',details:{sourceURL,executionPhase:'initialization'}});});})).then(([image,temp,cache])=>runtime={create:image.createRegionalLoupeImage,temporary:temp.createTemporarySession,budget:new cache.Budget(memoryBudgetBytes)});}
 const temporarySession=()=>session??=runtime.temporary({budget:runtime.budget});
 function sourceWindow(ticket,rect,signal){
  if(signal?.aborted)return Promise.reject(cancelled());const read=++serial;
  return new Promise((resolve,reject)=>{const cleanup=()=>signal?.removeEventListener('abort',abort),abort=()=>{reads.delete(read);cleanup();reject(cancelled());};reads.set(read,{resolve:pixels=>{cleanup();resolve({pixels,release(){}});},reject:error=>{cleanup();reject(error);}});signal?.addEventListener('abort',abort,{once:true});post({action:'source',ticket,read,rect});});
 }
 function metrics(record){return {...record.surface.metrics,computedTiles:record.done.size,totalTiles:record.all.length,visibleTiles:record.priority.size,workerCacheBytes:record.bytes,background:record.background};}
 function progress(record){post({action:'progress',resultId:record.id,metrics:metrics(record)});}
 function retain(record,key,pixels){const value={...pixels,data:new Uint8Array(pixels.data)};record.cache.set(key,value);record.bytes+=value.data.byteLength;while(record.bytes>32*1024**2&&record.cache.size>1){const first=[...record.cache.keys()].find(k=>!record.priority.has(k))??record.cache.keys().next().value;record.bytes-=record.cache.get(first).data.byteLength;record.cache.delete(first);}return value;}
 async function tile(record,rect,signal){const key=tileId(rect),cached=record.cache.get(key);if(cached){record.cache.delete(key);record.cache.set(key,cached);return cached;}if(signal.aborted)throw cancelled();const part=await record.surface.readWindow(rect,{signal});try{if(signal.aborted||record.closed)throw cancelled();const value=retain(record,key,part.pixels);record.done.add(key);if(record.done.size%32===0||record.priority.has(key))progress(record);return value;}finally{part.release();}}
 async function window(record,rect,signal){
  const tiles=nativeTiles(record.width,record.height,{left:rect.x,top:rect.y,right:rect.x+rect.width,bottom:rect.y+rect.height}).filter(r=>!record.allowed||record.allowed.has(tileId(r))),data=new Uint8Array(rect.width*rect.height*3);
  for(const r of tiles){const pixels=await tile(record,r,signal),left=Math.max(rect.x,r.x),top=Math.max(rect.y,r.y),right=Math.min(rect.x+rect.width,r.x+r.width),bottom=Math.min(rect.y+rect.height,r.y+r.height);for(let y=top;y<bottom;y++){const start=((y-r.y)*r.width+left-r.x)*3;data.set(pixels.data.subarray(start,start+(right-left)*3),((y-rect.y)*rect.width+left-rect.x)*3);}}
  return {width:rect.width,height:rect.height,format:'rgb8',data};
 }
 function stop(record){record.background=false;record.suspended=true;if(active?.record===record)active.controller.abort();for(let i=requests.length-1;i>=0;i--)if(requests[i].record===record&&!requests[i].explicit){errorReply(requests[i].message.ticket,cancelled());requests.splice(i,1);}progress(record);}
 function next(){
  const build=[...builds.values()].find(v=>!v.started);if(build)return {kind:'build',build};
  if(requests.length){let best=0,score=-Infinity;for(let i=0;i<requests.length;i++){const request=requests[i],r=request.record,region=request.message.rect,key=tileId(region),value=(request.explicit?1e15:r.priority.has(key)?1e12:0)+r.priorityAt*1e6-(r.centre?Math.hypot(region.x+region.width/2-r.centre.x,region.y+region.height/2-r.centre.y):0);if(value>score){best=i;score=value;}}return {kind:'read',...requests.splice(best,1)[0]};}
  // No result starts outside work until all its visible requests have arrived.
  for(const record of [...records.values()].filter(r=>r.background&&!r.closed).sort((a,b)=>b.priorityAt-a.priorityAt)){
   const rect=record.order.find(r=>!record.done.has(tileId(r)));if(rect)return {kind:'background',record,rect};record.background=false;progress(record);
  }
 }
 async function pump(){
  if(running||disposed)return;running=true;
  try{for(;;){const task=next();if(!task)break;const controller=task.kind==='build'?task.build.controller:new AbortController();active={...task,controller};
   try{
    if(task.kind==='build'){
     const {message}=task.build;task.build.started=true;if(controller.signal.aborted)throw cancelled();await load(message.memoryBudgetBytes);if(controller.signal.aborted)throw cancelled();
     const {width,height}=message;const surface=runtime.create({descriptor:{width,height,format:'rgb8'},readWindow:(rect,{signal}={})=>sourceWindow(message.ticket,rect,signal)},message.effects,{temporarySession,budget:runtime.budget});
     const allowed=message.allowedTiles?new Set(message.allowedTiles):null,record={id:message.ticket,surface,width,height,allowed,all:nativeTiles(width,height).filter(r=>!allowed||allowed.has(tileId(r))),order:[],cache:new Map(),bytes:0,done:new Set(),priority:new Set(),priorityAt:0,background:false,suspended:false,closed:false};records.set(record.id,record);post({ticket:message.ticket,resultId:record.id,metrics:metrics(record)});
    }else{
     const {record}=task;if(record.closed||controller.signal.aborted)throw cancelled();
     if(task.kind==='read'){const pixels=await window(record,task.message.rect,controller.signal);scope.postMessage({ticket:task.message.ticket,pixels},[pixels.data.buffer]);}
     else await tile(record,task.rect,controller.signal);
    }
   }catch(error){if(task.kind==='build')errorReply(task.build.message.ticket,error,error?.code==='WORKER_MODULE_LOAD');else if(task.kind==='read')errorReply(task.message.ticket,error);else if(error.code!=='CANCELLED'){task.record.background=false;post({action:'progress',resultId:task.record.id,error:encode(error),metrics:metrics(task.record)});}}
   finally{if(task.kind==='build')builds.delete(task.build.message.ticket);active=null;}
   // A bounded native tile is the longest non-preemptible arithmetic section.
   // Let priority/cancel messages run before choosing the next section.
   await new Promise(resolve=>setTimeout(resolve,0));
  }}finally{running=false;if(disposed)await disposeAll();}
 }
 function kick(){if(wake!==null)return;wake=setTimeout(()=>{wake=null;void pump().catch(error=>errorReply(undefined,error,true));},0);}
 async function release(record){if(!record||record.closed)return;record.closed=true;stop(record);records.delete(record.id);record.cache.clear();record.bytes=0;await record.surface.dispose();}
 async function disposeAll(){for(const record of [...records.values()])await release(record);if(session)await(await session).dispose();post({action:'disposed'});}
 scope.onmessage=({data:message})=>{
  if(!message||typeof message!=='object'){errorReply(undefined,Error('Invalid native worker message'),true);return;}
  if(message.action==='source'){const pending=reads.get(message.read);reads.delete(message.read);if(pending){if(message.error)pending.reject(Object.assign(Error(message.error.message),message.error));else pending.resolve(message.pixels);}return;}
  if(message.action==='build'){if(active?.kind==='background')active.controller.abort();builds.set(message.ticket,{message,controller:new AbortController(),started:false});kick();return;}
  if(message.action==='cancel'){builds.get(message.ticket)?.controller.abort();return;}
  const record=records.get(message.resultId);
  if(message.action==='priority'){
   if(!record||record.closed)return;record.priority=new Set(message.regions.map(tileId));record.priorityAt=++lastPriority;record.suspended=false;record.background=message.background!==false;
   for(let i=requests.length-1;i>=0;i--)if(requests[i].record===record&&!requests[i].explicit&&!record.priority.has(tileId(requests[i].message.rect))){errorReply(requests[i].message.ticket,cancelled());requests.splice(i,1);}
   const b=tileBounds(message.regions),centre={x:(b.left+b.right)/2,y:(b.top+b.bottom)/2};record.centre=centre;record.order=centreOrder(record.all,centre);if(active?.kind==='background'&&(!record.priority.has(tileId(active.rect))||active.record!==record))active.controller.abort();kick();return;
  }
  if(message.action==='suspend'){if(record)stop(record);return;}
  if(message.action==='release'){if(record){if(active?.record===record){active.controller.abort();const task=active;void Promise.resolve().then(async()=>{while(active===task)await new Promise(r=>setTimeout(r,0));await release(record);});}else void release(record);}return;}
  if(message.action==='read'){if(!record||record.closed){errorReply(message.ticket,cancelled());return;}requests.push({record,message,explicit:!!message.explicit});if(active?.kind==='background')active.controller.abort();kick();return;}
  if(message.action==='dispose'){disposed=true;for(const build of builds.values())build.controller.abort();active?.controller.abort();for(const request of requests.splice(0))errorReply(request.message.ticket,cancelled());if(!running)void disposeAll();return;}
  errorReply(message.ticket,Error('Unknown native worker request'),true);
 };
 scope.onmessageerror=event=>errorReply(undefined,Object.assign(Error('Native worker message could not be decoded',{cause:event.error}),{code:'WORKER_MESSAGE_FAILED'}),true);
 return {get pending(){return builds.size+requests.length;}};
}
if(typeof self!=='undefined'&&typeof document==='undefined')installNativeTileWorker(self);
