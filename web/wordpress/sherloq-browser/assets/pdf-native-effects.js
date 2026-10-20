import {nativeTiles,tileId} from './pdf-native-tile-plan.js';
import {createBatchScopeMask} from './batch-scope-mask.js';
// Scientific processing uses the maintained native-image engine. No reduced input or overview.
const services=new Map();
function encodedError(error,seen=new Set()){
 if(seen.has(error))return {code:'WORKER_FAILED',message:'Circular error cause'};seen.add(error);
 const value={name:error?.name??'Error',code:error?.code??'WORKER_FAILED',message:error?.message??String(error),stack:error?.stack};
 if(error?.details!==undefined)try{value.details=structuredClone(error.details);}catch{value.details={diagnostic:String(error.details)};}
 if(error?.cause!==undefined)value.cause=encodedError(error.cause,seen);return value;
}
function receivedError(value){const error=Object.assign(Error(value?.message??String(value)),value&&typeof value==='object'?value:{});if(value?.cause!==undefined)error.cause=receivedError(value.cause);return error;}
function service(memoryBudgetBytes){
 if(services.has(memoryBudgetBytes))return services.get(memoryBudgetBytes);
 const sourceURL=new URL('./pdf-native-effects-worker.js',import.meta.url);let worker;
 try{worker=new Worker(sourceURL,{type:'module'});}catch(cause){throw Object.assign(Error('Loupe preparation worker could not start.',{cause}),{code:'WORKER_FAILED',details:{sourceURL:String(sourceURL),executionPhase:'worker-startup'}});}
 let closeResolve;const closedTask=new Promise(resolve=>{closeResolve=resolve;});const pending=new Map(),sources=new Map(),listeners=new Map();let serial=0,users=0,failed=null;
 const fail=error=>{if(failed)return;failed=error;for(const job of pending.values())job.reject(error);pending.clear();worker.terminate();sources.clear();listeners.clear();closeResolve();if(services.get(memoryBudgetBytes)===api)services.delete(memoryBudgetBytes);};
 const transportError=(message,cause,details={})=>Object.assign(Error(message,{cause}),{code:'WORKER_MESSAGE_FAILED',details:{sourceURL:String(sourceURL),...details}});
 const send=message=>{if(failed)return false;if(message.action==='release')sources.delete(message.resultId);try{worker.postMessage(message);return true;}catch(cause){fail(transportError('Loupe worker message could not be sent.',cause,{action:message.action,executionPhase:'message-send'}));return false;}};
 const api={get failed(){return failed;},retain(){users++;return api;},call(action,payload={},source){if(failed)return {ticket:0,promise:Promise.reject(failed)};const ticket=++serial;if(source)sources.set(ticket,source);const promise=new Promise((resolve,reject)=>{pending.set(ticket,{resolve,reject,source});send({action,ticket,...payload});});return{ticket,promise};},send,subscribe(id,callback){listeners.set(id,callback);return()=>listeners.delete(id);},release(){if(users<=0||--users)return;if(services.get(memoryBudgetBytes)===api)services.delete(memoryBudgetBytes);send({action:'dispose'});return closedTask;}};
 async function supplySource(data){
  try{const input=sources.get(data.ticket);if(!input)throw Object.assign(Error('Source released'),{code:'CANCELLED'});const pixels=await input.readPixels(data.rect);if(failed)return;try{worker.postMessage({action:'source',read:data.read,pixels},[pixels.data.buffer]);}catch(cause){fail(transportError('Loupe source pixels could not be transferred.',cause,{executionPhase:'source-transfer'}));}}
  catch(error){send({action:'source',read:data.read,error:encodedError(error)});}
 }
 worker.onmessage=({data})=>{
  if(!data||typeof data!=='object'||Array.isArray(data)){fail(transportError('Invalid loupe worker response.',undefined,{executionPhase:'message-receive'}));return;}
  if(data.fatal){fail(receivedError(data.error??data.fatal));return;}
  if(data.action==='disposed'){worker.terminate();sources.clear();listeners.clear();closeResolve();return;}
  if(data.action==='progress'){listeners.get(data.resultId)?.(data);return;}
  if(data.action==='source'){
   void supplySource(data).catch(error=>fail(error));return;
  }
  if(!Number.isInteger(data.ticket)||data.ticket<=0){fail(transportError('Loupe worker response has no request identity.',undefined,{executionPhase:'message-receive'}));return;}
  const job=pending.get(data.ticket);if(!job)return;pending.delete(data.ticket);if(data.error){if(job.source)sources.delete(data.ticket);job.reject(receivedError(data.error));}else job.resolve(data);
 };
 worker.onerror=event=>fail(Object.assign(Error(event.message||'Loupe preparation worker failed',{cause:event.error}),{code:'WORKER_FAILED',details:{sourceURL:event.filename||String(sourceURL),line:event.lineno,column:event.colno,executionPhase:event.stage??'worker-event'}}));
 worker.onmessageerror=event=>fail(transportError('Loupe worker response could not be decoded.',event.error,{executionPhase:'message-receive'}));
 services.set(memoryBudgetBytes,api);return api;
}
const cancelled=()=>Object.assign(Error('Préparation remplacée'),{code:'CANCELLED'});
const effectKey=effects=>JSON.stringify(Object.fromEntries(Object.entries(effects).filter(([,p])=>p.enabled)));
// Exact native output tiles. Scaling happens only when painting the final viewport.
function nativeSurface(result,input,api,changed){
 const width=input.width,height=input.height,scope=input.scientificScope?createBatchScopeMask(input.scientificScope,{width:input.width,height:input.height,sourceSha256:input.scientificScope.sourceSha256}):null,tiles=new Map(),waiting=new Map(),leases=new Set();let refs=1,closed=false,clock=0,reads=0;
 api.retain();input.retain?.();let suspended=false;
 const allowed=input.allowedTiles&&new Set(input.allowedTiles),rects=b=>nativeTiles(width,height,b).filter(r=>!allowed||allowed.has(tileId(r))),id=tileId;
 const unsubscribe=api.subscribe(result.resultId,data=>{Object.assign(result.metrics,data.metrics);if(data.error&&data.error.code!=='CANCELLED')changed(receivedError(data.error));});
 let priorityPending=false;const demanded=new Map();
 function prioritize(regions){if(suspended||closed||!regions.length)return;for(const r of regions)demanded.set(id(r),r);if(priorityPending)return;priorityPending=true;queueMicrotask(()=>{priorityPending=false;const regions=[...demanded.values()];demanded.clear();if(!closed&&!suspended&&regions.length)api.send({action:'priority',resultId:result.resultId,regions,background:input.background!==false});});}
 async function scopedPixels(pixels,rect){if(!scope)return pixels;const original=await input.readPixels(rect),mask=scope.readRows(rect.y,rect.height);try{for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++)if(!mask.data[y*width+rect.x+x]){const i=(y*rect.width+x)*3;pixels.data.set(original.data.subarray(i,i+3),i);}return pixels;}finally{mask.release();}}
 function tile(r){const key=id(r);if(tiles.has(key)){const value=tiles.get(key);value.used=++clock;return Promise.resolve(value);}if(waiting.has(key))return waiting.get(key);
  const task=(async()=>{if(closed||suspended)throw cancelled();reads++;let {pixels}=await api.call('read',{resultId:result.resultId,rect:r}).promise;pixels=await scopedPixels(pixels,r);if(closed)throw cancelled();
   if(pixels.width!==r.width||pixels.height!==r.height||pixels.format!=='rgb8'||pixels.data.length!==r.width*r.height*3)throw Error('Tuile native invalide');
   const canvas=new OffscreenCanvas(r.width,r.height),ctx=canvas.getContext('2d'),image=ctx.createImageData(r.width,r.height);
   for(let a=0,b=0;a<pixels.data.length;a+=3,b+=4){image.data[b]=pixels.data[a];image.data[b+1]=pixels.data[a+1];image.data[b+2]=pixels.data[a+2];image.data[b+3]=255;}ctx.putImageData(image,0,0);input.applyAlpha?.(ctx,r);
   const value={canvas,rect:r,used:++clock};tiles.set(key,value);trim(required());return value;
  })().finally(()=>waiting.delete(key));waiting.set(key,task);return task;
 }

 function trim(keep){let bytes=0;for(const v of tiles.values())bytes+=v.canvas.width*v.canvas.height*4;
  // A visible native region may exceed this soft limit; it is never replaced by a reduced source.
  for(const [key,v]of [...tiles].sort((a,b)=>a[1].used-b[1].used)){if(bytes<=96*1024**2)break;if(keep.has(key))continue;bytes-=v.canvas.width*v.canvas.height*4;v.canvas.width=v.canvas.height=0;tiles.delete(key);}
 }
 const required=()=>new Set([...leases].flatMap(lease=>[...lease.needs]));
 const release=()=>{if(--refs)return;closed=true;unsubscribe();for(const value of tiles.values())value.canvas.width=value.canvas.height=0;tiles.clear();api.send({action:'release',resultId:result.resultId});input.release?.();api.release();};
 function acquire(onChange=changed){refs++;const lease={needs:new Set(),composite:null};leases.add(lease);let released=false,failed=null,collecting=false;
  const expanded=(bounds,scale=1)=>{const margin=Math.min(Math.max(width,height),Math.ceil(2/Math.min(1,scale||1)));return {left:bounds.left-margin,top:bounds.top-margin,right:bounds.right+margin,bottom:bounds.bottom+margin};};
  function prepare(bounds,scale=1){if(released||closed)return false;const regions=rects(expanded(bounds,scale));if(!collecting){collecting=true;lease.needs.clear();queueMicrotask(()=>{collecting=false;trim(required());});}for(const r of regions)lease.needs.add(id(r));prioritize(regions);const absent=regions.filter(r=>!tiles.has(id(r)));if(!absent.length)return true;
   if(!suspended)for(const r of absent)if(!waiting.has(id(r)))void tile(r).then(()=>{failed=null;onChange();},error=>{if(error.code!=='CANCELLED'){failed=error;onChange(error);}});return false;}
  return {width,height,preparedLoupe:true,native:true,composedScope:!!scope,id:result.resultId,metrics:result.metrics,get byteLength(){return (result.metrics.retainedBytes||0)+(result.metrics.workerCacheBytes||0)+[...tiles.values()].reduce((n,v)=>n+v.canvas.width*v.canvas.height*4,0)+[...leases].reduce((n,v)=>n+(v.composite?v.composite.canvas.width*v.composite.canvas.height*4:0),0);},get nativeReads(){return reads;},prepare,
   async ready(bounds,scale=1){if(released||closed)throw cancelled();const regions=rects(expanded(bounds,scale));lease.needs=new Set(regions.map(id));prioritize(regions);await Promise.all(regions.map(tile));if(released||closed)throw cancelled();},
   draw(ctx,bounds,scale=1){
    if(released||closed)return;if(!prepare(bounds,scale)){if(failed)throw failed;return;}
    // Join cached pixels at their native integer coordinates. Scaling separate tile
    // rectangles leaves antialiased seams; the final draw must sample one surface.
    const pieces=[...lease.needs].map(key=>tiles.get(key)).filter(Boolean);if(!pieces.length){if(scope)input.draw?.(ctx,bounds,scale);return;}
    const visible=expanded(bounds,scale),left=scope?Math.max(0,Math.floor(visible.left)):Math.min(...pieces.map(v=>v.rect.x)),top=scope?Math.max(0,Math.floor(visible.top)):Math.min(...pieces.map(v=>v.rect.y)),right=scope?Math.min(width,Math.ceil(visible.right)):Math.max(...pieces.map(v=>v.rect.x+v.rect.width)),bottom=scope?Math.min(height,Math.ceil(visible.bottom)):Math.max(...pieces.map(v=>v.rect.y+v.rect.height)),key=[left,top,right,bottom,...pieces.map(v=>id(v.rect)).sort()].join(':');
    if(lease.composite?.key!==key){const canvas=lease.composite?.canvas||new OffscreenCanvas(1,1);canvas.width=right-left;canvas.height=bottom-top;const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;if(scope){context.save();context.translate(-left,-top);input.draw?.(context,visible,1);context.restore();}for(const piece of pieces){if(scope)context.clearRect(piece.rect.x-left,piece.rect.y-top,piece.rect.width,piece.rect.height);context.drawImage(piece.canvas,piece.rect.x-left,piece.rect.y-top);}lease.composite={canvas,key,left,top};}
    ctx.drawImage(lease.composite.canvas,lease.composite.left,lease.composite.top);
   },
   async readPixels(rect){if(released||closed)throw cancelled();return scopedPixels((await api.call('read',{resultId:result.resultId,rect,explicit:true}).promise).pixels,rect);},
   fork:onChange=>released?null:acquire(onChange),close(){if(released)return;released=true;if(lease.composite){lease.composite.canvas.width=lease.composite.canvas.height=0;lease.composite=null;}leases.delete(lease);release();}
  };
 }
 return {acquire,release,suspend(){suspended=true;api.send({action:'suspend',resultId:result.resultId});},resume(){suspended=false;}};
}
export function createLoupeImageCache({changed=()=>{},memoryBudgetBytes=128*1024**2}={}){
 let api=null,source=null,current=null,building=null,closed=false;
 function cancel(){current?.surface.suspend();if(building){building.api.send({action:'cancel',ticket:building.ticket});building=null;}}
 return {cancel,async acquire(input,effects,onChange=changed){
  const key=effectKey(effects);if(closed)throw cancelled();
  if(current?.source===input&&current.key===key){current.surface.resume();return current.surface.acquire(onChange);}
  if(source!==input||building?.key!==key)cancel();source=input;
  if(!building){api??=service(memoryBudgetBytes).retain();const job=api.call('build',{width:input.width,height:input.height,effects,allowedTiles:input.allowedTiles,memoryBudgetBytes},input),record={...job,key,api};building=record;
   record.done=job.promise.then(result=>{if(closed||building!==record){api.send({action:'release',resultId:result.resultId});throw cancelled();}
    const output=nativeSurface(result,input,api,changed);current?.surface.release();current={key,source:input,surface:output};return current;
   }).finally(()=>{if(building===record)building=null;});record.done.catch(()=>{});
  }
  const value=await building.done;if(closed||value!==current)throw cancelled();return value.surface.acquire(onChange);
 },dispose(){closed=true;cancel();current?.surface.release();current=null;const finished=api?.release();api=null;return finished;}};
}
