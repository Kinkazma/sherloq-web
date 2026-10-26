import {nativeTiles,tileId} from './pdf-native-tile-plan.js?v=0.25.0';
import {createBatchScopeMask} from './batch-scope-mask.js?v=0.25.0';
import {isRecord,positiveId,validRect,validRgb,validError,encodeError,decodeError,protocolFailure} from './loupe-native-protocol.js?v=0.25.0';
// Scientific processing uses the maintained native-image engine. No reduced input or overview.
const services=new Map();
const encodedError=encodeError,receivedError=decodeError;
const asCleanupFailure=value=>value instanceof Error?value:Object.assign(Error('Native loupe cleanup failed.',{cause:value}),{code:'CLEANUP_FAILED'});
function service(memoryBudgetBytes){
 if(services.has(memoryBudgetBytes))return services.get(memoryBudgetBytes);
 const sourceURL=new URL('./pdf-native-effects-worker.js?v=0.25.0',import.meta.url);let worker;
 try{worker=new Worker(sourceURL,{type:'module'});}catch(cause){throw Object.assign(Error('Loupe preparation worker could not start.',{cause}),{code:'WORKER_FAILED',details:{sourceURL:String(sourceURL),executionPhase:'worker-startup'}});}
 const pending=new Map(),sources=new Map(),listeners=new Map(),sourceReads=new Map(),sourceFailures=new Map();let serial=0,lastSourceRead=0,users=0,failed=null,phase='open',retired=false,settled=false,closeError=null;
 let closeResolve,closeReject;const closedTask=new Promise((resolve,reject)=>{closeResolve=resolve;closeReject=reject;});closedTask.catch(()=>{});
 const invalid=(message='Invalid loupe worker response.')=>protocolFailure(message,{sourceURL:String(sourceURL),executionPhase:'message-receive'});
 const transportError=(message,cause,details={})=>protocolFailure(message,{sourceURL:String(sourceURL),...details},cause);
 function retire(){if(retired)return;retired=true;worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;try{worker.terminate();}catch(error){closeError??=asCleanupFailure(error);}}
 function finish(){if(settled||sourceReads.size||phase!=='closed'&&phase!=='failed')return;settled=true;if(closeError)closeReject(closeError);else closeResolve();}
 function dropSource(id){const entry=sources.get(id);if(entry)entry.active=false;sources.delete(id);}
 function fail(error){if(failed)return;if(!(error instanceof Error))error=receivedError(encodedError(error));if(phase==='closing')closeError=error;failed=error;phase='failed';for(const job of pending.values())job.reject(error);pending.clear();for(const id of sources.keys())dropSource(id);const callbacks=[...listeners.values()];listeners.clear();if(services.get(memoryBudgetBytes)===api)services.delete(memoryBudgetBytes);retire();for(const callback of callbacks)try{callback({error:encodedError(error),metrics:{}});}catch{}finish();}
 function send(message,transfers=[]){
  if(phase!=='open'&&!(phase==='closing'&&message.action==='dispose'))return false;
  if(message.action==='release')dropSource(message.resultId);if(message.action==='cancel')dropSource(message.ticket);
  try{worker.postMessage(message,transfers);return true;}catch(cause){fail(transportError(message.action==='source'?'Loupe source pixels could not be transferred.':'Loupe worker message could not be sent.',cause,{action:message.action,executionPhase:message.action==='source'?'source-transfer':'message-send'}));return false;}
 }
 function beginClose(){
  if(phase!=='open')return closedTask;phase='closing';if(services.get(memoryBudgetBytes)===api)services.delete(memoryBudgetBytes);
  for(const id of sources.keys())dropSource(id);for(const job of pending.values())job.reject(cancelled());pending.clear();listeners.clear();send({action:'dispose'});return closedTask;
 }
 const api={get failed(){return failed;},retain(){if(phase!=='open')throw failed??cancelled();users++;return api;},
  call(action,payload={},source){if(phase!=='open')return{ticket:0,promise:Promise.reject(failed??cancelled())};if(action==='read'&&sourceFailures.has(payload.resultId))return{ticket:0,promise:Promise.reject(sourceFailures.get(payload.resultId))};const ticket=++serial;if(source)sources.set(ticket,{input:source,active:true});const promise=new Promise((resolve,reject)=>{pending.set(ticket,{action,payload,resolve,reject,source});send({action,ticket,...payload});});return{ticket,promise};},
  send,sourceFailure:id=>sourceFailures.get(id),forgetSourceFailure:id=>sourceFailures.delete(id),async drainSource(id){const answers=await Promise.allSettled([...sourceReads].filter(([,ticket])=>ticket===id).map(([task])=>task)),error=answers.find(answer=>answer.status==='rejected');if(error)throw error.reason;if(sourceFailures.has(id))throw sourceFailures.get(id);},subscribe(id,callback){listeners.set(id,callback);return()=>listeners.delete(id);},
  release(){if(users>0)users--;return users===0?beginClose():Promise.resolve();}
 };
 async function supplySource(data,entry){
  const active=()=>phase==='open'&&entry.active&&sources.get(data.ticket)===entry;let held=false;
  try{
   if(!active())return;if(entry.input.retain){entry.input.retain();held=true;}
   const pixels=await entry.input.readPixels(data.rect);if(!active())return;
   if(!validRgb(pixels,data.rect)){fail(invalid('Invalid native loupe source pixels.'));return;}
   send({action:'source',read:data.read,pixels},[pixels.data.buffer]);
  }catch(error){if(active())send({action:'source',read:data.read,error:encodedError(error)});}
  finally{if(held)try{await entry.input.release?.();}catch(cause){const error=asCleanupFailure(cause);sourceFailures.set(data.ticket,error);dropSource(data.ticket);
   if(phase!=='open')closeError??=error;else{for(const [ticket,job]of pending)if(job.action!=='release'&&(ticket===data.ticket||job.payload.resultId===data.ticket)){pending.delete(ticket);job.reject(error);}try{listeners.get(data.ticket)?.({error:encodedError(error),metrics:{}});}catch{}send({action:'suspend',resultId:data.ticket});}throw error;
  }}
 }
 worker.onmessage=({data})=>{
  if(phase==='closed'||phase==='failed')return;
  try{
   if(!isRecord(data))throw invalid();
   if(data.fatal!==undefined){if(data.fatal!==true||!validError(data.error))throw invalid();fail(receivedError(data.error));return;}
   if(data.action==='disposed'){
    if(phase!=='closing'||data.error!==undefined&&!validError(data.error)||data.memory!==undefined&&!isRecord(data.memory))throw invalid();
    if(data.error)closeError=receivedError(data.error);phase='closed';retire();for(const job of pending.values())job.reject(closeError??cancelled());pending.clear();sources.clear();listeners.clear();finish();return;
   }
   if(phase==='closing')return;
   if(data.action==='progress'){
    if(!positiveId(data.resultId)||data.resultId>serial)throw invalid();if(!sources.has(data.resultId)&&!listeners.has(data.resultId))return;
    if(!isRecord(data.metrics)||data.error!==undefined&&!validError(data.error))throw invalid();listeners.get(data.resultId)?.(data);return;
   }
   if(data.action==='source'){
    if(!positiveId(data.ticket)||data.ticket>serial||!positiveId(data.read)||data.error!==undefined||data.pixels!==undefined)throw invalid();const entry=sources.get(data.ticket);
    if(data.read<=lastSourceRead)return;lastSourceRead=data.read;if(!entry){send({action:'source',read:data.read,error:encodedError(cancelled())});return;}
    if(!validRect(data.rect,entry.input.width,entry.input.height))throw invalid('Invalid native loupe source window.');
    const task=supplySource(data,entry);sourceReads.set(task,data.ticket);void task.catch(error=>{if(sourceFailures.get(data.ticket)!==error)fail(error);}).finally(()=>{sourceReads.delete(task);finish();});return;
   }
   if(data.action!==undefined||!positiveId(data.ticket)||data.ticket>serial)throw invalid();const job=pending.get(data.ticket);if(!job)return;
   let error;if(data.error!==undefined){if(!validError(data.error)||data.pixels!==undefined||data.resultId!==undefined||data.metrics!==undefined||data.released!==undefined)throw invalid();error=receivedError(data.error);}
   else if(job.action==='build'){if(data.resultId!==data.ticket||!positiveId(data.resultId)||!isRecord(data.metrics))throw invalid();}
   else if(job.action==='read'){if(!validRgb(data.pixels,job.payload.rect))throw invalid('Invalid native loupe RGB response.');}
   else if(job.action==='release'){if(data.released!==true||data.memory!==undefined&&!isRecord(data.memory))throw invalid();}
   else throw invalid();
   pending.delete(data.ticket);if(error){if(job.source)dropSource(data.ticket);job.reject(error);}else job.resolve(data);
  }catch(error){fail(error?.code==='WORKER_MESSAGE_FAILED'?error:transportError('Loupe worker response could not be handled.',error,{executionPhase:'message-receive'}));}
 };
 worker.onerror=event=>fail(Object.assign(Error(event.message||'Loupe preparation worker failed',{cause:event.error}),{code:'WORKER_FAILED',details:{sourceURL:event.filename||String(sourceURL),line:event.lineno,column:event.colno,executionPhase:event.stage??'worker-event'}}));
 worker.onmessageerror=event=>fail(transportError('Loupe worker response could not be decoded.',event.error,{executionPhase:'message-receive'}));
 services.set(memoryBudgetBytes,api);return api;
}
const cancelled=()=>Object.assign(Error('Préparation remplacée'),{code:'CANCELLED'});
const effectKey=effects=>JSON.stringify(Object.fromEntries(Object.entries(effects).filter(([,p])=>p.enabled)));
export function nativeEffectTiles(width,height,bounds,allowed){
 const circle=bounds.circle;if(circle&&![circle.x,circle.y,circle.radius].every(Number.isFinite)||circle?.radius<0)throw new RangeError('Invalid native loupe circle.');
 return nativeTiles(width,height,bounds).filter(rect=>{if(allowed&&!allowed.has(tileId(rect)))return false;if(!circle)return true;const dx=Math.max(rect.x-circle.x,0,circle.x-rect.x-rect.width),dy=Math.max(rect.y-circle.y,0,circle.y-rect.y-rect.height);return dx*dx+dy*dy<=circle.radius*circle.radius;});
}
export function nativePresentationCacheTarget(width,height,memoryBudgetBytes,override){
 if(override!==undefined){if(!Number.isSafeInteger(override)||override<65536)throw new RangeError('A native presentation cache target of at least one tile is required.');return override;}
 return Math.min(384*1024**2,memoryBudgetBytes,Math.max(96*1024**2,width*height*4));
}
// Exact native output tiles. Scaling happens only when painting the final viewport.
function nativeSurface(result,input,api,changed,memoryBudgetBytes,presentationOverride){
 const width=input.width,height=input.height,scope=input.scientificScope?createBatchScopeMask(input.scientificScope,{width:input.width,height:input.height,sourceSha256:input.scientificScope.sourceSha256}):null,tiles=new Map(),waiting=new Map(),leases=new Set(),explicitReads=new Set();let refs=1,closed=false,clock=0,reads=0,tileBytes=0,evictions=0;
 // This is a lazy per-image presentation LRU target, separate from the worker
 // policy. A visible exact native region can exceed it; it is not total RAM.
 const presentationCacheBytes=nativePresentationCacheTarget(width,height,memoryBudgetBytes,presentationOverride);
 const clockNow=()=>globalThis.performance?.now?.()??Date.now(),fixedBytes=width*height*4;
 let presentationRevision=0,presentationContextLosses=0,presentationInvalidatedTiles=0,presentationNotifyPending=false;const presentationCanvases=new Map();
 let fixed=null,present=null,coverageHits=0,interactive=false,fixedAttempted=false,fixedFallback=null,fixedAllocations=0,fixedAllocationMs=0,fixedCopies=0,fixedCopyPixels=0,fixedCopyMs=0,joinAllocations=0,joinCopies=0,joinCopyPixels=0,joinMs=0,planQueries=0,completeHits=0;
 const tileColumns=Math.ceil(width/128),fullTileCount=tileColumns*Math.ceil(height/128),fixedComplete=()=>!!fixed&&tiles.size===fullTileCount;
 Object.defineProperties(result.metrics,{presentationRevision:{enumerable:true,get:()=>{checkFixedHealth();return presentationRevision;}},presentationContextLosses:{enumerable:true,get:()=>presentationContextLosses},presentationInvalidatedTiles:{enumerable:true,get:()=>presentationInvalidatedTiles},presentationPresenceBytes:{enumerable:true,get:()=>present?.byteLength??0},presentationCoveredWindowHits:{enumerable:true,get:()=>coverageHits},presentationInteractionActive:{enumerable:true,get:()=>interactive},presentationTileBytes:{enumerable:true,get:()=>tileBytes},presentationCompositeBytes:{enumerable:true,get:()=>[...leases].reduce((n,v)=>n+(v.composite?v.composite.canvas.width*v.composite.canvas.height*4:0),0)},presentationCacheTargetBytes:{enumerable:true,value:presentationCacheBytes},presentationCacheEvictions:{enumerable:true,get:()=>evictions},presentationFixedBytes:{enumerable:true,get:()=>fixed?.bytes??0},presentationFixedAllocations:{enumerable:true,get:()=>fixedAllocations},presentationFixedAllocationMs:{enumerable:true,get:()=>fixedAllocationMs},presentationFixedTileCopies:{enumerable:true,get:()=>fixedCopies},presentationFixedCopyPixels:{enumerable:true,get:()=>fixedCopyPixels},presentationFixedCopyMs:{enumerable:true,get:()=>fixedCopyMs},presentationFixedFallback:{enumerable:true,get:()=>fixedFallback},presentationFixedComplete:{enumerable:true,get:fixedComplete},presentationFixedCompleteHits:{enumerable:true,get:()=>completeHits},presentationTilePlanQueries:{enumerable:true,get:()=>planQueries},presentationJoinAllocations:{enumerable:true,get:()=>joinAllocations},presentationJoinTileCopies:{enumerable:true,get:()=>joinCopies},presentationJoinCopyPixels:{enumerable:true,get:()=>joinCopyPixels},presentationJoinMs:{enumerable:true,get:()=>joinMs}});
 // A GPU-process restart can erase 2D backing stores too. Their geometry and
 // coverage are not proof of valid pixels after restoration. Only presentation
 // objects are retired; exact RGB results remain in the worker's native store.
 function notifyPresentation(){if(presentationNotifyPending||closed)return;presentationNotifyPending=true;queueMicrotask(()=>{presentationNotifyPending=false;if(closed)return;for(const callback of new Set([changed,...[...leases].map(value=>value.onChange)]))callback();});}
 function watchPresentation(canvas,context){if(presentationCanvases.has(canvas))return;const lost=()=>invalidatePresentation(),restored=()=>invalidatePresentation();canvas.addEventListener?.('contextlost',lost);canvas.addEventListener?.('contextrestored',restored);presentationCanvases.set(canvas,{context,lost,restored});}
 function retirePresentation(canvas){if(!canvas)return;const record=presentationCanvases.get(canvas);if(record){canvas.removeEventListener?.('contextlost',record.lost);canvas.removeEventListener?.('contextrestored',record.restored);presentationCanvases.delete(canvas);}canvas.width=canvas.height=0;}
 function invalidatePresentation(){if(closed||!presentationCanvases.size)return;presentationRevision++;presentationContextLosses++;presentationInvalidatedTiles+=tiles.size;for(const canvas of [...presentationCanvases.keys()])retirePresentation(canvas);tiles.clear();tileBytes=0;fixed=null;present=null;fixedAttempted=false;fixedFallback='CONTEXT_LOST';for(const lease of leases)lease.composite=null;notifyPresentation();}
 function checkFixedHealth(){if(fixed?.context.isContextLost?.())invalidatePresentation();}
 function checkLeaseHealth(lease){checkFixedHealth();if(lease.composite?.context.isContextLost?.())invalidatePresentation();}
 function checkTileHealth(regions){if(regions.some(rect=>tiles.get(id(rect))?.context?.isContextLost?.()))invalidatePresentation();}
 function discardFixed(error){present=null;if(fixed){retirePresentation(fixed.canvas);fixed=null;for(const [key,value]of tiles)if(!value.canvas)tiles.delete(key);}fixedFallback=error?.code??error?.name??'CANVAS_UNAVAILABLE';}
 function fixedPresentation(){
  if(fixedAttempted)return fixed;fixedAttempted=true;
  if(!Number.isSafeInteger(fixedBytes)||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||fixedBytes>presentationCacheBytes){fixedFallback='PRESENTATION_TARGET';return null;}
  let canvas;const started=clockNow();try{
   canvas=new OffscreenCanvas(width,height);if(canvas.width!==width||canvas.height!==height)throw new RangeError('Native presentation dimensions were not retained.');
   const context=canvas.getContext('2d');if(!context||typeof context.getImageData!=='function')throw Object.assign(Error('Native presentation context unavailable.'),{code:'CANVAS_UNAVAILABLE'});
   // Some engines accept dimensions that exceed their backing-store limit. A
   // real corner read qualifies the whole native surface before any tile moves.
   const corner=context.getImageData(width-1,height-1,1,1);if(corner.width!==1||corner.height!==1||corner.data.length!==4)throw Object.assign(Error('Native presentation backing store unavailable.'),{code:'CANVAS_UNAVAILABLE'});
   fixed={canvas,context,bytes:fixedBytes};watchPresentation(canvas,context);present=new Uint8Array(fullTileCount);fixedFallback=null;fixedAllocations++;return fixed;
  }catch(error){if(canvas)canvas.width=canvas.height=0;discardFixed(error);return null;}finally{fixedAllocationMs+=clockNow()-started;}
 }
 let closeResolve,closeReject;const closedTask=new Promise((resolve,reject)=>{closeResolve=resolve;closeReject=reject;});closedTask.catch(()=>{});api.retain();try{input.retain?.();}catch(error){void api.release().catch(()=>{});throw asCleanupFailure(error);}let suspended=false;
 const allowed=input.allowedTiles&&new Set(input.allowedTiles),rects=b=>{planQueries++;return nativeEffectTiles(width,height,b,allowed);},id=tileId;
 const unsubscribe=api.subscribe(result.resultId,data=>{Object.assign(result.metrics,data.metrics);if(data.error&&data.error.code!=='CANCELLED')changed(receivedError(data.error));});
 let priorityPending=false,lastDemand=null,lastBackground,lastRegions=null;const demanded=new Map();
 const resetPriority=()=>{lastDemand=null;lastBackground=undefined;demanded.clear();};
 function schedulePriority(){if(priorityPending||closed||suspended||api.sourceFailure(result.resultId))return;priorityPending=true;queueMicrotask(()=>{priorityPending=false;const regions=demanded.size?[...demanded.values()]:lastRegions;demanded.clear();if(closed||suspended||api.sourceFailure(result.resultId)||!regions?.length)return;const background=!interactive&&input.background!==false,keys=new Set(regions.map(id));if(background===lastBackground&&lastDemand?.size===keys.size&&[...keys].every(key=>lastDemand.has(key)))return;if(api.send({action:'priority',resultId:result.resultId,regions,background})){lastDemand=keys;lastBackground=background;lastRegions=regions;}else resetPriority();});}
 function prioritize(regions){if(suspended||closed||!regions.length)return;for(const r of regions)demanded.set(id(r),r);schedulePriority();}
 async function scopedPixels(pixels,rect){if(!scope)return pixels;const original=await input.readPixels(rect),mask=scope.readRows(rect.y,rect.height);try{for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++)if(!mask.data[y*width+rect.x+x]){const i=(y*rect.width+x)*3;pixels.data.set(original.data.subarray(i,i+3),i);}return pixels;}finally{mask.release();}}
 function tile(r){const key=id(r);if(tiles.has(key)){const value=tiles.get(key);value.used=++clock;return Promise.resolve(value);}if(waiting.has(key))return waiting.get(key);
  const task=(async()=>{if(closed||suspended)throw cancelled();reads++;let {pixels}=await api.call('read',{resultId:result.resultId,rect:r}).promise;pixels=await scopedPixels(pixels,r);if(closed)throw cancelled();
   if(pixels.width!==r.width||pixels.height!==r.height||pixels.format!=='rgb8'||pixels.data.length!==r.width*r.height*3)throw Error('Tuile native invalide');
   const backing=fixedPresentation(),temporary=backing&&!input.applyAlpha?null:new OffscreenCanvas(r.width,r.height),ctx=temporary?.getContext('2d')??backing.context,image=ctx.createImageData(r.width,r.height);
   for(let a=0,b=0;a<pixels.data.length;a+=3,b+=4){image.data[b]=pixels.data[a];image.data[b+1]=pixels.data[a+1];image.data[b+2]=pixels.data[a+2];image.data[b+3]=255;}
   let canvas=temporary;if(backing){const started=clockNow();try{if(temporary){ctx.putImageData(image,0,0);input.applyAlpha?.(ctx,r);backing.context.clearRect(r.x,r.y,r.width,r.height);backing.context.drawImage(temporary,r.x,r.y);}else backing.context.putImageData(image,r.x,r.y);fixedCopies++;fixedCopyPixels+=r.width*r.height;canvas=null;}
    catch(error){discardFixed(error);canvas=temporary??new OffscreenCanvas(r.width,r.height);const fallback=canvas.getContext('2d');fallback.putImageData(image,0,0);if(!temporary)input.applyAlpha?.(fallback,r);}
    finally{fixedCopyMs+=clockNow()-started;if(temporary&&canvas!==temporary)temporary.width=temporary.height=0;}
   }else{ctx.putImageData(image,0,0);input.applyAlpha?.(ctx,r);}
   const context=canvas?.getContext('2d');if(canvas)watchPresentation(canvas,context);const value={canvas,context,rect:r,used:++clock};tiles.set(key,value);if(fixed&&present)present[Math.floor(r.y/128)*tileColumns+Math.floor(r.x/128)]=1;if(canvas)tileBytes+=canvas.width*canvas.height*4;trim(required());return value;
  })().finally(()=>waiting.delete(key));waiting.set(key,task);return task;
 }

 function trim(keep){if(tileBytes<=presentationCacheBytes)return;
  // A visible native region may exceed this soft limit; it is never replaced by a reduced source.
  for(const [key,v]of [...tiles].sort((a,b)=>a[1].used-b[1].used)){if(tileBytes<=presentationCacheBytes)break;if(keep.has(key)||!v.canvas)continue;tileBytes-=v.canvas.width*v.canvas.height*4;retirePresentation(v.canvas);tiles.delete(key);evictions++;}
 }
 const required=()=>new Set([...leases].flatMap(lease=>[...lease.needs]));
 const release=()=>{if(closed)return closedTask;if(--refs)return;closed=true;resetPriority();unsubscribe();for(const canvas of [...presentationCanvases.keys()])retirePresentation(canvas);if(fixed)fixed=null;tiles.clear();present=null;tileBytes=0;
  const cleanup=(async()=>{let error;try{await api.call('release',{resultId:result.resultId}).promise;}catch(cause){if(!api.failed&&cause?.code!=='CANCELLED')error=asCleanupFailure(cause);}
   try{await Promise.allSettled([...waiting.values(),...explicitReads]);await api.drainSource(result.resultId);}catch(cause){error??=asCleanupFailure(cause);}
   try{await input.release?.();}catch(cause){error??=asCleanupFailure(cause);}
   finally{api.forgetSourceFailure(result.resultId);try{await api.release();}catch(cause){error??=asCleanupFailure(cause);}}if(error)throw error;
  })();void cleanup.then(closeResolve,closeReject);return closedTask;};
 function acquire(onChange=changed){refs++;const lease={needs:new Set(),composite:null,onChange};leases.add(lease);let released=false,failed=null,collecting=false,releaseTask;
  const expanded=(bounds,scale=1)=>{if(bounds.circle&&(![bounds.circle.x,bounds.circle.y,bounds.circle.radius].every(Number.isFinite)||bounds.circle.radius<0))throw new RangeError('Invalid native loupe circle.');const margin=Math.min(Math.max(width,height),Math.ceil(2/Math.min(1,scale||1)));return {left:bounds.left-margin,top:bounds.top-margin,right:bounds.right+margin,bottom:bounds.bottom+margin,...(bounds.circle?{circle:{...bounds.circle,radius:bounds.circle.radius+margin}}:{})};};
  function covered(bounds,scale){
   if(!fixed||!present)return false;const b=expanded(bounds,scale),circle=b.circle;
   if(![b.left,b.top,b.right,b.bottom].every(Number.isFinite)||circle&&(![circle.x,circle.y,circle.radius].every(Number.isFinite)||circle.radius<0))throw new RangeError('Invalid native loupe window.');
   const left=Math.max(0,Math.floor(b.left)),top=Math.max(0,Math.floor(b.top)),right=Math.min(width,Math.ceil(b.right)),bottom=Math.min(height,Math.ceil(b.bottom));
   if(right<=left||bottom<=top)return true;
   for(let y=Math.floor(top/128)*128;y<bottom;y+=128)for(let x=Math.floor(left/128)*128;x<right;x+=128){
    if(allowed&&!allowed.has(x+':'+y))continue;
    if(circle){const dx=Math.max(x-circle.x,0,circle.x-x-Math.min(128,width-x)),dy=Math.max(y-circle.y,0,circle.y-y-Math.min(128,height-y));if(dx*dx+dy*dy>circle.radius*circle.radius)continue;}
    if(!present[Math.floor(y/128)*tileColumns+Math.floor(x/128)])return false;
   }return true;
  }
  function prepare(bounds,scale=1){if(released||closed)return false;if(api.sourceFailure(result.resultId)){failed=api.sourceFailure(result.resultId);return false;}checkLeaseHealth(lease);if(fixedComplete()){completeHits++;return true;}if(covered(bounds,scale)){coverageHits++;return true;}const regions=rects(expanded(bounds,scale));checkTileHealth(regions);if(!collecting){collecting=true;lease.needs.clear();queueMicrotask(()=>{collecting=false;trim(required());});}for(const r of regions)lease.needs.add(id(r));prioritize(regions);const absent=regions.filter(r=>!tiles.has(id(r)));if(!absent.length)return true;
   if(!suspended)for(const r of absent)if(!waiting.has(id(r)))void tile(r).then(()=>{failed=null;onChange();},error=>{if(error.code!=='CANCELLED'){failed=error;onChange(error);}});return false;}
  return {width,height,preparedLoupe:true,native:true,composedScope:!!scope,id:result.resultId,metrics:result.metrics,get available(){return !api.failed&&!api.sourceFailure(result.resultId)&&!closed;},get presentationRevision(){checkFixedHealth();return presentationRevision;},get byteLength(){return (result.metrics.retainedBytes||0)+(result.metrics.bandCacheBytes||0)+(result.metrics.workerCacheBytes||0)+tileBytes+(fixed?.bytes??0)+[...leases].reduce((n,v)=>n+(v.composite?v.composite.canvas.width*v.composite.canvas.height*4:0),0);},get nativeReads(){return reads;},setInteractive(value){const next=!!value;if(interactive===next||released||closed)return;interactive=next;lastDemand=null;schedulePriority();},prepare,
   async ready(bounds,scale=1){if(released||closed)throw cancelled();if(api.sourceFailure(result.resultId))throw api.sourceFailure(result.resultId);checkLeaseHealth(lease);if(fixedComplete()||covered(bounds,scale))return;const regions=rects(expanded(bounds,scale));checkTileHealth(regions);lease.needs=new Set(regions.map(id));prioritize(regions);do{await Promise.all(regions.map(tile));if(released||closed)throw cancelled();}while(regions.some(r=>!tiles.has(id(r))));},
   draw(ctx,bounds,scale=1){
    if(released||closed)return;if(!prepare(bounds,scale)){if(failed)throw failed;return;}
    if(fixed){const visible=expanded(bounds,scale),left=Math.max(0,Math.floor(visible.left)),top=Math.max(0,Math.floor(visible.top)),right=Math.min(width,Math.ceil(visible.right)),bottom=Math.min(height,Math.ceil(visible.bottom));if(scope)input.draw?.(ctx,bounds,scale);if(right>left&&bottom>top)ctx.drawImage(fixed.canvas,left,top,right-left,bottom-top,left,top,right-left,bottom-top);return;}
    // Join cached pixels at their native integer coordinates. Scaling separate tile
    // rectangles leaves antialiased seams; the final draw must sample one surface.
    const pieces=[...lease.needs].map(key=>tiles.get(key)).filter(Boolean);if(!pieces.length){if(scope)input.draw?.(ctx,bounds,scale);return;}
    const visible=expanded(bounds,scale),left=scope?Math.max(0,Math.floor(visible.left)):Math.min(...pieces.map(v=>v.rect.x)),top=scope?Math.max(0,Math.floor(visible.top)):Math.min(...pieces.map(v=>v.rect.y)),right=scope?Math.min(width,Math.ceil(visible.right)):Math.max(...pieces.map(v=>v.rect.x+v.rect.width)),bottom=scope?Math.min(height,Math.ceil(visible.bottom)):Math.max(...pieces.map(v=>v.rect.y+v.rect.height)),key=[left,top,right,bottom,...pieces.map(v=>id(v.rect)).sort()].join(':');
    if(lease.composite?.key!==key){const started=clockNow(),canvas=lease.composite?.canvas||new OffscreenCanvas(1,1);canvas.width=right-left;canvas.height=bottom-top;joinAllocations++;const context=canvas.getContext('2d');watchPresentation(canvas,context);context.imageSmoothingEnabled=false;if(scope){context.save();context.translate(-left,-top);input.draw?.(context,visible,1);context.restore();}for(const piece of pieces){if(scope)context.clearRect(piece.rect.x-left,piece.rect.y-top,piece.rect.width,piece.rect.height);context.drawImage(piece.canvas,piece.rect.x-left,piece.rect.y-top);joinCopies++;joinCopyPixels+=piece.rect.width*piece.rect.height;}lease.composite={canvas,context,key,left,top};joinMs+=clockNow()-started;}
    ctx.drawImage(lease.composite.canvas,lease.composite.left,lease.composite.top);
   },
   readPixels(rect){const task=(async()=>{if(released||closed)throw cancelled();if(!validRect(rect,width,height))throw Object.assign(new RangeError('Invalid native loupe read window.'),{code:'INVALID_INPUT'});const answer=await api.call('read',{resultId:result.resultId,rect,explicit:true}).promise;if(released||closed)throw cancelled();const pixels=await scopedPixels(answer.pixels,rect);if(released||closed)throw cancelled();return pixels;})();explicitReads.add(task);void task.then(()=>explicitReads.delete(task),()=>explicitReads.delete(task));return task;},
   fork:onChange=>released?null:acquire(onChange),closedTask,close(){if(released)return releaseTask;released=true;if(lease.composite){retirePresentation(lease.composite.canvas);lease.composite=null;}leases.delete(lease);releaseTask=release();return releaseTask;}
  };
 }
 return {acquire,release,closedTask,get available(){return !api.failed&&!api.sourceFailure(result.resultId)&&!closed;},suspend(){suspended=true;resetPriority();api.send({action:'suspend',resultId:result.resultId});},resume(){if(suspended)resetPriority();suspended=false;}};
}
export function createLoupeImageCache({changed=()=>{},memoryBudgetBytes=128*1024**2,presentationCacheBytes}={}){
 if(presentationCacheBytes!==undefined)nativePresentationCacheTarget(1,1,memoryBudgetBytes,presentationCacheBytes);
 let api=null,source=null,current=null,building=null,closed=false,closingTask=null,cleanupError=null;const ownedBuilds=new Set(),cleanups=new Set();
 function trackCleanup(task){const value=Promise.resolve(task);cleanups.add(value);value.then(()=>cleanups.delete(value),error=>{cleanups.delete(value);cleanupError??=asCleanupFailure(error);});return value;}
 function cancel(){current?.surface.suspend();if(building){building.api.send({action:'cancel',ticket:building.ticket});building=null;}}
 return {cancel,resume(){if(!closed)current?.surface.resume();},async acquire(input,effects,onChange=changed){
  if(closed)throw cancelled();if(!input||!positiveId(input.width)||!positiveId(input.height)||!Number.isSafeInteger(input.width*input.height*3)||typeof input.readPixels!=='function')throw Object.assign(new TypeError('Invalid native loupe source.'),{code:'INVALID_INPUT'});const key=effectKey(effects);
  if(api?.failed){cancel();const retired=current?.surface;retired?.release();if(retired)trackCleanup(retired.closedTask);current=null;const old=api;api=null;trackCleanup(old.release());}
  if(current?.source===input&&current.key===key&&current.surface.available){current.surface.resume();return current.surface.acquire(onChange);}
  if(source!==input||building?.key!==key)cancel();source=input;
  if(!building){api??=service(memoryBudgetBytes).retain();const job=api.call('build',{width:input.width,height:input.height,effects,allowedTiles:input.allowedTiles instanceof Set?[...input.allowedTiles]:input.allowedTiles,memoryBudgetBytes},input),record={...job,key,api};building=record;ownedBuilds.add(record);
   record.done=job.promise.then(async result=>{if(closed||building!==record){try{await record.api.call('release',{resultId:result.resultId}).promise;}catch(error){if(!record.api.failed&&error?.code!=='CANCELLED')cleanupError??=asCleanupFailure(error);}throw cancelled();}
    let output;try{output=nativeSurface(result,input,record.api,changed,memoryBudgetBytes,presentationCacheBytes);}catch(error){try{await record.api.call('release',{resultId:result.resultId}).promise;}catch(cause){if(!record.api.failed&&cause?.code!=='CANCELLED')cleanupError??=asCleanupFailure(cause);}throw error;}record.produced=true;const retired=current?.surface;retired?.release();if(retired)trackCleanup(retired.closedTask);current={key,source:input,surface:output};return current;
   }).finally(async()=>{try{await record.api.drainSource(record.ticket);}catch(error){record.drainFailure=asCleanupFailure(error);cleanupError??=record.drainFailure;}finally{if(!record.produced)record.api.forgetSourceFailure(record.ticket);ownedBuilds.delete(record);if(building===record)building=null;}}).then(value=>{if(record.drainFailure)throw record.drainFailure;return value;});record.done.catch(()=>{});
  }
  const value=await building.done;if(closed||value!==current)throw cancelled();return value.surface.acquire(onChange);
 },dispose(){if(closingTask)return closingTask;closed=true;const records=[...ownedBuilds],builds=records.map(record=>record.done);cancel();const retired=current?.surface;retired?.release();if(retired)trackCleanup(retired.closedTask);current=null;if(api)trackCleanup(api.release());api=null;source=null;const drains=records.map(record=>record.api.drainSource(record.ticket)),cleanup=[...cleanups];
  closingTask=(async()=>{await Promise.allSettled([...builds,...drains,...cleanup]);if(cleanupError)throw cleanupError;})();closingTask.catch(()=>{});return closingTask;
 }};
}
