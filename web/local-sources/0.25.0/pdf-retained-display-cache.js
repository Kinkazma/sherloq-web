// Leased RGB cache for one program shared by view and loupe. The
// returned independent RGB copies remain caller-owned after cache/source close.
import {retireCompositeOwners} from './unified-engine/src/composite-owner-release.js';
const cancelled=()=>Object.assign(Error('Native PDF window cache cancelled.'),{code:'CANCELLED'});
const check=signal=>{if(signal?.aborted)throw signal.reason??cancelled();};
function camera(request,maxPixels){const b=request?.bounds,s=request?.scale;if(!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)||b[2]<=0||b[3]<=0||!Number.isFinite(s)||s<=0)throw new RangeError('Invalid native PDF window.');const width=Math.ceil(b[2]*s),height=Math.ceil(b[3]*s);if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||!Number.isSafeInteger(width*height)||width*height>maxPixels)throw new RangeError('Native PDF window limit exceeded.');return{request:{bounds:[...b],scale:s},width,height,key:[...b,s].join(':')};}
function wait(promise,signal){check(signal);if(!signal)return promise;return new Promise((resolve,reject)=>{const abort=()=>{signal.removeEventListener('abort',abort);reject(signal.reason??cancelled());};signal.addEventListener('abort',abort,{once:true});promise.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});});}
export function createRetainedProgramWindowCache(source,{budget,maxBytes=4*1024**2,maxPixels=4*1024**2}={}){
 if(typeof source?.samplePixels!=='function'||typeof source?.close!=='function'||typeof budget?.reserve!=='function'||typeof budget?.total!=='function'||!Number.isSafeInteger(maxBytes)||maxBytes<0||!Number.isSafeInteger(maxPixels)||maxPixels<1)throw new TypeError('Leased source and real Budget required.');
 const entries=new Map(),pending=new Map(),records=new Set(),owners=new Set(),reads=new Set();let closing=false,closed=false,closeTask,retainedBytes=0,sourceFrameBytes=0,returnedFrames=0;
 const counters={reads:0,replays:0,hits:0,deduplicated:0,evictions:0,peakRetainedBytes:0};
 function alive(signal){check(signal);if(closing)throw cancelled();}
 function retire(entry){if(!entry||entry.retained||entry.pins||entry.producer||entry.closed)return Promise.resolve();if(entry.retiring)return entry.retiring;const task=Promise.resolve().then(()=>entry.frame.release()).then(()=>{entry.closed=true;owners.delete(entry);sourceFrameBytes-=entry.frame.data.byteLength;},error=>{if(entry.retiring===task)entry.retiring=null;throw error;});entry.retiring=task;return task;}
 async function evict(key){const entry=entries.get(key);if(!entry)return;entries.delete(key);entry.retained=false;retainedBytes-=entry.frame.data.byteLength;counters.evictions++;await retire(entry);}
 async function room(bytes){while(retainedBytes+bytes>maxBytes&&entries.size)await evict(entries.keys().next().value);}
 async function admitCopy(bytes,protectedEntry){for(const key of [...entries.keys()]){if(budget.total()+bytes<=budget.limit)break;if(entries.get(key)!==protectedEntry)await evict(key);}return budget.reserve(bytes);}
 async function finish(record){if(!record.settled||record.consumers||record.producerReleased)return;record.producerReleased=true;records.delete(record);if(record.entry){record.entry.producer=false;await retire(record.entry);}}
 function start(wanted){const record={controller:new AbortController(),consumers:0,settled:false,producerReleased:false,entry:null};records.add(record);counters.replays++;
  record.promise=(async()=>{alive(record.controller.signal);const frame=await source.samplePixels(wanted.request,{signal:record.controller.signal});const entry=record.entry={frame,pins:0,producer:true,retained:false,retiring:null,closed:false};owners.add(entry);sourceFrameBytes+=frame.data?.byteLength??0;
   if(frame.format!=='rgb8'||frame.width!==wanted.width||frame.height!==wanted.height||!(frame.data instanceof Uint8Array)||frame.data.length!==wanted.width*wanted.height*3||typeof frame.release!=='function')throw new TypeError('Invalid native RGB lease.');alive(record.controller.signal);
   if(frame.data.byteLength<=maxBytes){await room(frame.data.byteLength);alive(record.controller.signal);entry.retained=true;entries.set(wanted.key,entry);retainedBytes+=frame.data.byteLength;counters.peakRetainedBytes=Math.max(retainedBytes,counters.peakRetainedBytes);}return entry;
  })().finally(async()=>{record.settled=true;if(pending.get(wanted.key)===record)pending.delete(wanted.key);await finish(record);});record.promise.catch(()=>{});pending.set(wanted.key,record);return record;
 }
 async function read(request,{signal}={}){counters.reads++;alive(signal);const wanted=camera(request,maxPixels);let entry=entries.get(wanted.key),record,primary,failed=false,copyRelease,transferred=false,pinned=false;
  try{
   if(entry){counters.hits++;entries.delete(wanted.key);entries.set(wanted.key,entry);entry.pins++;pinned=true;}
   else{record=pending.get(wanted.key);if(record)counters.deduplicated++;else record=start(wanted);record.consumers++;entry=await wait(record.promise,signal);alive(signal);entry.pins++;pinned=true;}
   copyRelease=await admitCopy(entry.frame.data.byteLength,entry);alive(signal);const data=new Uint8Array(entry.frame.data);alive(signal);let live=true;const release=()=>{if(live){copyRelease();live=false;returnedFrames--;}};returnedFrames++;transferred=true;return{width:wanted.width,height:wanted.height,format:'rgb8',data,release};
  }catch(error){failed=true;primary=error;throw error;}
  finally{try{await retireCompositeOwners([()=>{if(!transferred)copyRelease?.();},()=>{if(pinned)entry.pins--;return retire(entry);},()=>{if(!record)return;record.consumers--;if(!record.consumers&&!record.settled)record.controller.abort(cancelled());return finish(record);}],failed?{primary}:{});if(!failed)alive(signal);}catch(error){if(transferred){copyRelease();returnedFrames--;}throw error;}}
 }
 return{
  samplePixels(request,options){let promise;promise=read(request,options);reads.add(promise);promise.then(()=>reads.delete(promise),()=>reads.delete(promise));return promise;},
  get metrics(){return{...counters,retainedBytes,sourceFrameBytes,entries:entries.size,pending:records.size,activeReads:reads.size,returnedFrames,sourceFrameOwners:owners.size,maxBytes,maxPixels,closing,closed};},
  close(){if(closed)return Promise.resolve();if(closeTask)return closeTask;closing=true;for(const record of records)record.controller.abort(cancelled());closeTask=(async()=>{await Promise.allSettled([...reads]);await Promise.allSettled([...records].map(record=>record.promise));for(const entry of entries.values())entry.retained=false;entries.clear();retainedBytes=0;await retireCompositeOwners([...owners].map(entry=>()=>retire(entry)));await source.close();closed=true;})();closeTask.then(()=>{},()=>{closeTask=null;});return closeTask;}
 };
}
