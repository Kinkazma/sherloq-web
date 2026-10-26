const MiB=1024**2;
const cancelled=reason=>Object.assign(Error('Native source window cache is closed or cancelled.',reason===undefined?undefined:{cause:reason}),{code:'CANCELLED'});
const isCancelled=error=>error?.code==='CANCELLED'||error?.name==='AbortError';
// This is a separate, lazy cache target, never a promise about total browser RAM.
// Smaller budgets retain the original read path without a permanent RGB cache.
export function nativeSourceCacheTarget(memoryBudgetBytes){
 if(!Number.isSafeInteger(memoryBudgetBytes)||memoryBudgetBytes<0)throw new RangeError('Invalid native source cache budget.');
 const share=Math.floor(memoryBudgetBytes/8);return share<32*MiB?0:Math.min(384*MiB,share);
}
function windowRect(value){
 const {x,y,width,height}=value??{};
 if(![x,y,width,height,x+width,y+height,width*height*3].every(Number.isSafeInteger)||x<0||y<0||width<1||height<1)throw new RangeError('Invalid integer native source window.');
 return{x,y,width,height};
}
const keyOf=r=>[r.x,r.y,r.width,r.height].join(':');
const contains=(a,b)=>a.x<=b.x&&a.y<=b.y&&a.x+a.width>=b.x+b.width&&a.y+a.height>=b.y+b.height;
function validatePixels(value,rect){
 if(value?.width!==rect.width||value.height!==rect.height||value.format!=='rgb8'||!(value.data instanceof Uint8Array)||value.data.byteLength!==rect.width*rect.height*3)throw Object.assign(Error('Invalid exact native RGB source window.'),{code:'INVALID_INPUT'});
 return value;
}
function copyPixels(entry,rect){
 const data=new Uint8Array(rect.width*rect.height*3),offsetX=rect.x-entry.rect.x,offsetY=rect.y-entry.rect.y;
 for(let row=0;row<rect.height;row++){const offset=((offsetY+row)*entry.rect.width+offsetX)*3;data.set(entry.data.subarray(offset,offset+rect.width*3),row*rect.width*3);}
 return{width:rect.width,height:rect.height,format:'rgb8',data};
}
/** Cache one immutable source owner and fixed native grid. Callers retain that
 * source until close() settles. Every result is an independent transferable RGB
 * copy; cache buffers are never exposed or sent to another worker. */
export function createNativeSourceWindowCache({readPixels,maxBytes=0,allowContained=false}={}){
 if(typeof readPixels!=='function'||!Number.isSafeInteger(maxBytes)||maxBytes<0||typeof allowContained!=='boolean')throw new TypeError('Invalid native source window cache options.');
 const entries=new Map(),pending=new Map(),inflight=new Set();let retainedBytes=0,peakRetainedBytes=0,closed=false,closing;
 const count={reads:0,sourceReads:0,cacheHits:0,containedHits:0,deduplicatedReads:0,cacheMisses:0,evictions:0,uncachedReads:0,errors:0,cancelledReads:0};
 function evict(key){const entry=entries.get(key);if(!entry)return;entries.delete(key);retainedBytes-=entry.data.byteLength;count.evictions++;}
 function touch(key,entry){entries.delete(key);entries.set(key,entry);return entry;}
 function find(rect,key){
  const exact=entries.get(key);if(exact)return touch(key,exact);
  if(!allowContained)return null;let bestKey,best;
  for(const [candidate,value] of entries)if(contains(value.rect,rect)&&(!best||value.data.byteLength<best.data.byteLength)){best=value;bestKey=candidate;}
  if(best){count.containedHits++;return touch(bestKey,best);}return null;
 }
 function retain(key,entry){
  if(!maxBytes||entry.data.byteLength>maxBytes){count.uncachedReads++;return;}
  while(retainedBytes+entry.data.byteLength>maxBytes&&entries.size)evict(entries.keys().next().value);
  entries.set(key,entry);retainedBytes+=entry.data.byteLength;peakRetainedBytes=Math.max(peakRetainedBytes,retainedBytes);
 }
 function start(rect,key){
  const controller=new AbortController(),record={rect,key,controller,consumers:0,settled:false,cancelled:false};count.sourceReads++;
  record.promise=Promise.resolve().then(()=>{if(closed||record.cancelled)throw cancelled();return readPixels({...rect},{signal:controller.signal});}).then(value=>{
   if(closed||record.cancelled||controller.signal.aborted)throw cancelled(controller.signal.reason);
   const pixels=validatePixels(value,rect),entry={rect,data:new Uint8Array(pixels.data)};
   if(closed||record.cancelled)throw cancelled();retain(key,entry);return entry;
  }).catch(error=>{if(!isCancelled(error)&&!closed&&!record.cancelled)count.errors++;throw error;}).finally(()=>{record.settled=true;if(pending.get(key)===record)pending.delete(key);inflight.delete(record);});
  record.promise.catch(()=>{});pending.set(key,record);inflight.add(record);return record;
 }
 function wait(record,signal){
  if(signal?.aborted)return Promise.reject(cancelled(signal.reason));
  if(!signal)return record.promise;
  return new Promise((resolve,reject)=>{const abort=()=>{signal.removeEventListener('abort',abort);reject(cancelled(signal.reason));};signal.addEventListener('abort',abort,{once:true});record.promise.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});});
 }
 return{
  async readPixels(value,{signal}={}){
   count.reads++;if(closed)throw cancelled();if(signal?.aborted){count.cancelledReads++;throw cancelled(signal.reason);}const rect=windowRect(value),key=keyOf(rect),entry=find(rect,key);
   if(entry){count.cacheHits++;return copyPixels(entry,rect);}
   count.cacheMisses++;let record=pending.get(key);if(record)count.deduplicatedReads++;else record=start(rect,key);record.consumers++;
   try{const ready=await wait(record,signal);if(closed||signal?.aborted)throw cancelled(signal?.reason);return copyPixels(ready,rect);}
   catch(error){if(isCancelled(error)||signal?.aborted)count.cancelledReads++;throw error;}
   finally{record.consumers--;if(!record.consumers&&!record.settled){record.cancelled=true;controllerAbort(record);}}
  },
  get metrics(){return{...count,maxBytes,retainedBytes,peakRetainedBytes,entries:entries.size,pendingReads:inflight.size,closed,allowContained};},
  close(){if(closing)return closing;closed=true;entries.clear();retainedBytes=0;for(const record of inflight){record.cancelled=true;record.controller.abort(cancelled());}pending.clear();closing=Promise.allSettled([...inflight].map(record=>record.promise)).then(()=>{});return closing;}
 };
 function controllerAbort(record){record.controller.abort(cancelled());if(pending.get(record.key)===record)pending.delete(record.key);}
}
