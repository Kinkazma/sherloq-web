import {withRetirementOwner} from './owner-retirement-error.js';
// Source-local plot owners. No result bank, numerical plan or global cache.
import {requireValue} from './errors.js';
const ack=async fn=>{const value=await fn();if(value===0||value===false)throw value;return value;};
export function retainPlotValues(store){
 let references=0,closing=false,closed=false,flight;
 const release=()=>{if(closed)return Promise.resolve();if(references>1){references--;return Promise.resolve();}if(flight)return flight;closing=true;
  const task=(async()=>{await ack(()=>store.dispose());references=0;closed=true;})();flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;};
 const take=()=>{requireValue(!closing&&!closed,'Plot values are retiring.');references++;let done=false,pending;return{dispose(){if(done)return Promise.resolve();if(pending)return pending;const task=release().then(()=>{done=true;});pending=task;void task.finally(()=>{if(pending===task)pending=null;}).catch(()=>{});return task;}};};
 const root=take();return{store,retain:take,dispose:()=>root.dispose(),get references(){return references;},get closed(){return closed;}};
}
export function plotValueCache(fields){
 let closing=false,closed=false,flight,valuesDone=false,rasterDone=false;
 return{...fields,get disposed(){return closing||closed;},dispose(){if(closed)return Promise.resolve();if(flight)return flight;closing=true;
  const task=(async()=>{if(!valuesDone){await fields.shared.dispose();valuesDone=true;}if(!rasterDone){await ack(()=>fields.rgb?.dispose());rasterDone=true;}closed=true;})();flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;}};
}
/** At most one existing values/pyramid cache per effective input depth. The
 * current calculation is protected; other depth can yield under real pressure. */
export function createPlotDepthCache({budget,onOwner,previous,previousKey}={}){
 const slots=new Map(),active=new Set(),pending=new Set();let closing=false,closed=false,flight,fee,unregister;
 const drop=async depth=>{const slot=slots.get(depth);if(!slot)return;try{await slot.cache.dispose();}catch(primary){throw withRetirementOwner(primary,slot.cache,primary);}if(slots.get(depth)===slot)slots.delete(depth);};
 const owner={depthSlots:true,get disposed(){return closing||closed;},
  hold(owner){requireValue(typeof owner?.dispose==='function','A captured plot retirement owner is required.');pending.add(owner);},
  async drain(){for(const owner of [...pending]){await owner.dispose();pending.delete(owner);}for(const [depth,row]of [...slots])if(row.cache.disposed)await drop(depth);},
  candidate(depth,key){requireValue(!closing&&!closed,'Plot cache is retiring.');const row=slots.get(depth);return row?.key===key&&!row.cache.disposed?row.cache:null;},
  async invalidate(depth,key){requireValue(!closing&&!closed,'Plot cache is retiring.');const row=slots.get(depth);if(row&&row.key!==key)await drop(depth);},
  protect(depth){requireValue(!closing&&!closed&&!active.has(depth),'Plot input already active.');active.add(depth);return()=>active.delete(depth);},
  async adopt(depth,key,cache){requireValue(!closing&&!closed&&active.has(depth)&&[8,16].includes(depth),'Unowned plot cache publication.');const old=slots.get(depth);if(old?.cache===cache)return;if(old)await drop(depth);slots.set(depth,{key,cache});},
  async reclaim(){if(closing||pending.size)return;for(const depth of [...slots.keys()])if(!active.has(depth)&&!slots.get(depth).cache.disposed)await drop(depth);},
  dispose(){if(closed)return Promise.resolve();if(flight)return flight;closing=true;
   const task=(async()=>{requireValue(!active.size,'Plot calculation still owns its cache.');await owner.drain();for(const depth of [...slots.keys()])await drop(depth);unregister?.();unregister=null;fee?.();fee=null;closed=true;})();flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;},
  snapshot(){return{closing,closed,slots:[...slots].map(([depth,r])=>({depth,key:r.key,retiring:r.cache.disposed})),active:[...active],pending:pending.size};}
 };
 if(previous)slots.set(8,{key:previousKey,cache:previous});
 onOwner(owner);fee=budget.reserve(1024);unregister=budget.registerAsyncReclaimer?.(()=>owner.reclaim(),{allocationKind:'array-buffer',owner:'plots-cache',label:'inactive-plot-depth'});return owner;
}

/** This is an input table capability, never an image-proxy capability. A
 * derived RGB8 Source must not acquire precision by borrowing a parent tag. */
export function plotNative16SourceEligible(image,shape){
 if(!image?.nativeSurface||image.originalSource)return false;
 for(const domain of [image.sourceRegionDomain,image.surface?.descriptor?.sourceRegionDomain])
  if(domain&&shape(domain)!=='identity')return false;
 return true;
}
export const plotNative16PreparedDomainEligible=(domain,shape)=>!domain||shape(domain)==='identity';
