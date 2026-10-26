import {createLoupeImageCache as createRegionalCache} from './pdf-native-effects.js';

const cancelled=()=>Object.assign(Error('Loupe preparation superseded'),{code:'CANCELLED'});
const effectKey=effects=>JSON.stringify(Object.fromEntries(Object.entries(effects).filter(([,p])=>p.enabled)));
// The normal image and PDF loupe use the same native regional processor. This
// adapter only owns image identity, presentation leases and retry policy. There
// is no overview, reduced scratch input or second full-image effect pipeline.
export function createLoupeImageCache({changed=()=>{},state=()=>{},memoryBudgetBytes=128*1024**2,createCache=createRegionalCache}={}){
 let engine=null,source=null,input=null,inputScope=null,current=null,building=null,wanted='',failed='',failure=null,closed=false,builds=0,suspended=false,resetTask=null,disposeTask=null;
 const jobs=new Set(),scopes=new Set();
 // Each retained source owns its in-flight cleanups and at most its first
 // cleanup error. A reset drains its retired scopes and then releases them;
 // an independent later source/reset does not inherit old diagnostics.
 function cleanup(action,scope){let value;try{value=action();}catch(error){value=Promise.reject(error);}const task=Promise.resolve(value);scope.tasks.add(task);task.then(()=>scope.tasks.delete(task),error=>{scope.tasks.delete(task);if(!scope.failed){scope.failed=true;scope.error=error;}});return task;}
 function finishCleanup(retired,pending){const task=(async()=>{await Promise.allSettled(pending.map(job=>job.done));let tasks;while((tasks=retired.flatMap(scope=>[...scope.tasks])).length)await Promise.allSettled(tasks);const errors=new Set();for(const scope of retired){scopes.delete(scope);if(scope.failed)errors.add(scope.error);}if(errors.size===1)throw errors.values().next().value;if(errors.size)throw Object.assign(new AggregateError([...errors],'Loupe cleanup failed.'),{code:'CLEANUP_FAILED'});})();task.catch(()=>{});return task;}
 function ownedInput(value,scope){
  const held=value.fork?.()??value;let references=1,released=false,releaseTask=null;
  return {width:value.width,height:value.height,background:value.background!==false,
   ...(value.scientificScope?{scientificScope:value.scientificScope}:{}),...(value.allowedTiles?{allowedTiles:value.allowedTiles}:{}),
   readPixels:rect=>released?Promise.reject(cancelled()):(held.readDisplayPixels??held.readPixels).call(held,rect),
   retain(){if(released)throw cancelled();references++;},release(){if(released)return releaseTask;if(--references)return;released=true;releaseTask=cleanup(()=>held!==value?held.close?.():undefined,scope);return releaseTask;}
  };
 }
 function closeCurrent(){const retired=current;current=null;if(retired)return cleanup(()=>retired.surface.close(),retired.scope);}
 function cancel(){engine?.cancel();suspended=true;building=null;wanted='';}
 function clear(){
  if(!engine&&!input&&!current&&!building&&resetTask)return resetTask;
  const pending=[...jobs],retired=input,previous=engine,scope=inputScope,retiredScopes=[...scopes];
  cancel();closeCurrent();engine=null;input=null;inputScope=null;source=null;failed='';failure=null;suspended=false;
  if(previous)cleanup(()=>previous.dispose(),scope);
  if(retired)cleanup(async()=>{await Promise.allSettled(pending.filter(job=>job.input===retired).map(job=>job.done));await retired.release();},scope);
  resetTask=finishCleanup(retiredScopes,pending);return resetTask;
 }
 function rememberFailure(key,error){failed=key;failure=error;state({busy:false,error});changed();}
 function ensure(value,effects,{retry=false}={}){
  if(closed||!value?.readPixels)return null;
  if(source!==value){clear();source=value;inputScope={tasks:new Set(),failed:false,error:undefined};scopes.add(inputScope);input=ownedInput(value,inputScope);}
  const key=effectKey(effects);wanted=key;
  if(building&&building.key!==key){engine?.cancel();suspended=true;building=null;}
  if(current?.surface.available===false&&failed!==key&&!retry)rememberFailure(key,Object.assign(Error('Loupe preparation worker is unavailable.'),{code:'WORKER_FAILED'}));
  if(retry&&failed===key){failed='';failure=null;}
  if(current?.key===key&&current.surface.available!==false&&!suspended){current.surface.effectsKey=JSON.stringify(effects);return current;}
  if(building?.key===key||failed===key)return current;
  state({busy:true,scope:'native-region'});
  const jobInput=input;engine??=createCache({changed,memoryBudgetBytes});
  const record={key,source:value,input:jobInput,scope:inputScope};building=record;jobs.add(record);
  let acquiring;try{acquiring=engine.acquire(jobInput,effects,changed);}catch(error){acquiring=Promise.reject(error);}
  record.done=Promise.resolve(acquiring).then(async surface=>{
   if(closed||building!==record||source!==value||wanted!==key){await cleanup(()=>surface.close(),record.scope);throw cancelled();}
   const reused=current?.source===value&&current.id===surface.id;closeCurrent();surface.effectsKey=JSON.stringify(effects);current={key,source:value,scope:record.scope,surface,id:surface.id,metrics:surface.metrics};if(!reused)builds++;suspended=false;failed='';failure=null;
   state({busy:false,scope:'native-region',metrics:surface.metrics});changed();return current;
  }).catch(error=>{if(!closed&&building===record&&error?.code!=='CANCELLED')rememberFailure(key,error);throw error;}).finally(()=>{jobs.delete(record);if(building===record)building=null;});
  record.done.catch(()=>{});return current;
 }
 function lease(surface,onChange){
  const retained=surface.fork(onChange);if(!retained)throw cancelled();
  retained.readDisplayPixels=rect=>retained.readPixels(rect);retained.freeze=()=>lease(retained,onChange);return retained;
 }
 return {ensure,cancel,get current(){return current;},get settled(){return !!current&&current.surface.available!==false&&current.key===wanted&&!building&&!suspended;},get pending(){return !!building;},get metrics(){return{builds,...current?.metrics};},
  async acquire(value,effects,onChange=changed){const key=effectKey(effects),previous=building;ensure(value,effects,{retry:true});if(current?.key!==key||current.surface.available===false||building){if(!building)throw failure??cancelled();const joined=building;try{await joined.done;}catch(error){if(joined!==previous||closed||source!==value||error?.code==='CANCELLED')throw error;ensure(value,effects,{retry:true});if(!building)throw failure??error;await building.done;}}if(closed||source!==value||current?.key!==key||current.surface.available===false)throw failure??cancelled();return lease(current.surface,onChange);},
  draw(ctx,bounds,scale){if(!current||!current.surface.prepare(bounds,scale))return false;current.surface.draw(ctx,bounds,scale);return true;},
  reset(){return disposeTask??clear();},dispose(){if(disposeTask)return disposeTask;closed=true;disposeTask=clear();return disposeTask;}
 };
}
