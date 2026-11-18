// Read-only registry alias. The SourceSamples pair owns the one RGB8 store.
import{EngineError,requireValue,checkAbort}from'./errors.js';
import{withRetirementOwner}from'./owner-retirement-error.js';
export function createSourceSamplesDisplayLease({surface,bindingOriginal,isCurrent,onOwner,surfaces,budget}={}){
 const d=surface?.descriptor;
 requireValue(d?.format==='rgb8'&&typeof surface.readWindow==='function'&&typeof isCurrent==='function'
  &&typeof onOwner==='function'&&surfaces instanceof Map&&budget?.reserve,'A real captured display source is required.');
 const id=crypto.randomUUID(),descriptor=Object.freeze({...d,id}),pending=new Set(),frames=new Set();
 let closing=false,closed=false,flight,fee,refusals=0,lastRefusal;
 const changed=()=>new EngineError('SOURCE_CHANGED','The histogram display lease is retiring or its Original changed.');
 const current=()=>{if(closing||closed||isCurrent()!==true)throw changed();};
 const refused=error=>{++refusals;lastRefusal=error;return error;};
 const checked=value=>{if(value===false||value===0)throw value;return value;};
 function ownFrame(part){
  requireValue(part&&typeof part.release==='function','Display reads require their real allocation owner.');
  const row={part,flight:null,retired:false};frames.add(row);
  const retire=()=>{
   if(row.retired)return;if(row.flight)return row.flight;
   const finish=()=>{row.part=null;row.retired=true;frames.delete(row);};
   let answer;try{answer=part.release();if(!answer?.then){checked(answer);finish();return answer;}}
   catch(error){throw refused(error);}
   const task=Promise.resolve(answer).then(value=>{checked(value);finish();return value;}).catch(error=>{throw refused(error);});
   row.flight=task;task.then(()=>row.flight=null,()=>row.flight=null);return task;
  };
  row.retire=retire;return{...part,...(part.surfaceId?{surfaceId:id,revision:descriptor.revision}:{}),release:retire};
 }
 function read(method,args,hooks={}){
  current();checkAbort(hooks.signal);
  const task=(async()=>{let frame;try{frame=ownFrame(await surface[method](args,hooks));checkAbort(hooks.signal);current();return frame;}
   catch(primary){if(frame)try{await frame.release();}catch(cleanup){throw withRetirementOwner(primary,owner,cleanup);}throw primary;}})();
  pending.add(task);task.then(()=>pending.delete(task),()=>pending.delete(task));return task;
 }
 const alias={descriptor,readWindow:(rect,hooks)=>read('readWindow',rect,hooks),
  ...(surface.readSampledWindow?{readSampledWindow:(tile,hooks)=>read('readSampledWindow',tile,hooks)}:{})};
 const entry={imageId:bindingOriginal.imageId,record:{surface:alias,sourceSamplesDisplay:true}};
 const owner={descriptor,get state(){return{closing,closed,pendingReads:pending.size,frames:frames.size};},dispose(){
  if(closed)return Promise.resolve();if(flight)return flight;closing=true;const before=refusals;
  const task=(async()=>{await Promise.allSettled([...pending]);
   // A newly refused read cleanup is not silently retried by the same close.
   if(refusals!==before)throw withRetirementOwner(lastRefusal,owner,lastRefusal);
   for(const frame of [...frames])try{await frame.retire();}catch(error){throw withRetirementOwner(error,owner,error);}
   requireValue(surfaces.get(id)===entry,'The owned histogram display handle was replaced.');surfaces.delete(id);
   fee?.();fee=null;closed=true;
  })();flight=task;task.then(()=>flight=null,()=>flight=null);return task;
 }};
 onOwner(owner);
 try{current();fee=budget.reserve(1024);requireValue(!surfaces.has(id),'Display identity collision.');surfaces.set(id,entry);return owner;}
 catch(error){if(!surfaces.has(id)){fee?.();fee=null;closed=true;}throw withRetirementOwner(error,owner,error);}
}
