import "../../runtime-context.js?v=0.30.0";
import {retireCompositeOwners} from './composite-owner-release.js';
// Scientific planes and the optional GPU producer have independent ACKs.
// A failed release (including a falsy rejection) stays owned for a later retry.
export function createFourierCache(properties,{budget}={}){
 const pending=new Set();let closing,retired=false,unregister;
 const cache={...properties,disposed:false,pendingRetirements:pending,
  async drain(){let failed=false,primary;for(const owner of [...pending])try{await owner.dispose();pending.delete(owner);}catch(error){if(!failed){failed=true;primary=error;}}if(this.presentationGpu?.retirementPending)try{await this.presentationGpu.retire();}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;},
  dispose(){
   this.disposed=true;if(retired)return Promise.resolve();if(closing)return closing;
   const task=(async()=>{let failed=false,primary;const attempt=async(owner,clear)=>{if(!owner)return;try{await owner.dispose();clear();}catch(error){if(!failed){failed=true;primary=error;}}};
    await attempt(this.presentationGpu,()=>this.presentationGpu=null);
    await attempt(this.gray,()=>this.gray=null);
    await attempt(this.spectrum?.plane,()=>this.spectrum=null);
    await attempt(this.magnitude?.table,()=>this.magnitude=null);
    if(this.display){await attempt(this.display.rgb,()=>this.display.rgb=null);await attempt(this.display.table,()=>this.display.table=null);if(!this.display.rgb&&!this.display.table)this.display=null;}
    try{await this.drain();}catch(error){if(!failed){failed=true;primary=error;}}
    if(failed){unregister??=budget?.registerAsyncReclaimer?.(async()=>{const before=budget.total();await cache.dispose();return Math.max(0,before-budget.total());},{owner:'resampling-fourier',label:'failed-Fourier-cache-retirement'});throw primary;}unregister?.();unregister=null;retired=true;
   })();closing=task;void task.finally(()=>{if(closing===task)closing=null;}).catch(()=>{});return task;
  }
 };return cache;
}
export async function clearFourierDisplay(cache,display){
 if(!display)return;for(const owner of[display.rgb,display.table])if(owner)cache.pendingRetirements.add(owner);await cache.drain();
}
export function createFourierScratchRetirement({getCache,pool,planes,views,getGray}={}){
 let poolRetired=false;const retiredGray=new Set(),poolOwner={async dispose(){if(!poolRetired){await pool?.clear?.();poolRetired=true;}}};
 return {async retire(options={}){
  const cache=getCache?.(),gray=getGray?.(),owners=[poolOwner,...new Set([...(planes??[]),...(views??[]),...(gray&&!retiredGray.has(gray)?[gray]:[])])];
  for(const owner of owners)cache?.pendingRetirements.add(owner);
  await retireCompositeOwners(owners.map(owner=>async()=>{await owner.dispose();planes?.delete(owner);if(Array.isArray(views)){const at=views.indexOf(owner);if(at>=0)views.splice(at,1);}if(owner===gray)retiredGray.add(gray);cache?.pendingRetirements.delete(owner);}),options);
 }};
}
