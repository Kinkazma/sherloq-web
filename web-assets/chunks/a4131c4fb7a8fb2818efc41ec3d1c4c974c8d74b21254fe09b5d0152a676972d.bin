import "../../runtime-context.js?v=0.30.0";
import {retireCachedPreviewSamples} from './cached-parameter-preview.js';
import {retireCompositeOwners} from './composite-owner-release.js';

// Native cache ownership is independent from displayed leases. Failed sample
// or store ACKs retain their exact masters and the cache metadata for retry.
export function createStereoCacheOwner({differences,offset,searchMetrics},budget){
 budget.retain(differences.byteLength);let closing,closed=false,disposed=false;
 const cache={differences,offset,views:new Map(),flow:null,searchMetrics,get closed(){return closed;},
  dispose(){
   if(closing)return closing;if(disposed)return;closed=true;
   const task=(async()=>{
    await retireCompositeOwners([...cache.views].map(([key,master])=>async()=>{await retireCachedPreviewSamples(master);await master.dispose();if(cache.views.get(key)===master)cache.views.delete(key);}).concat(cache.flow?[async()=>{const flow=cache.flow;await flow.owner.dispose();if(cache.flow===flow)cache.flow=null;}]:[]));
    budget.retained-=differences.byteLength;disposed=true;
   })();closing=task;void task.finally(()=>{if(closing===task)closing=null;}).catch(()=>{});return task;
  }
 };return cache;
}
