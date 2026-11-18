import "../../runtime-context.js?v=0.33.2";
// Thin product name/API bridge. The frozen entry is the only 7C implementation.
import {createProxy7C} from '../vendor/frozen-sherloq7c183/sherloq7c-memory.mjs';
import {resolveComputeProfile} from '../vendor/frozen-sherloq7c183/engine/src/profiles.js';
import {createFrozen7cBudget,FROZEN_7C_CEILING} from './sherloq7c-frozen-budget.js';
import {createSherloqRevelationCache} from './sherloq7c-revelation-cache.js';

export function createSherloq7C({budget,ceilingBytes=FROZEN_7C_CEILING,memoryBudgetBytes,resourceHints,gpu=true}={}){
 const initialBytes=memoryBudgetBytes??resolveComputeProfile('maximum',resourceHints).memoryBudgetBytes;
 const shared=createFrozen7cBudget(budget,{ceilingBytes,memoryBudgetBytes:initialBytes});
 // Resolve the initial admission with the frozen policy. Its automatic
 // ceiling remains open to fresh system observations; an explicit user limit
 // stays explicit. Every reservation is still admitted by the actual parent.
 const engine=createProxy7C({budget:shared,ceilingBytes,memoryBudgetBytes:memoryBudgetBytes??ceilingBytes,resourceHints,gpu});
 const revelationCache=createSherloqRevelationCache({budget:shared,reclaimBudget:budget});
 if(resourceHints)engine.updateResourceHints(resourceHints);
 let tail=Promise.resolve();
 const serialized=work=>{const pending=tail.then(work);tail=pending.catch(()=>{});return pending;};
 return{
  budget:shared,
  createSource:(input,hooks)=>serialized(()=>engine.createSource(input,hooks)),
  updateResourceHints:hints=>engine.updateResourceHints(hints),
  // D4 supplied backend in hooks. The frozen entry reads it from params.
  async run(source,params={},hooks={}){
   const scientific={...params,backend:hooks.backend??params.backend??'auto'},result=await serialized(()=>engine.run(source,scientific,hooks));
   // The cache uses the same prepared source and frozen endpoint results. It
   // only accelerates RGB8 window reconstruction; native/scalar exports keep
   // their immutable frozen reader and its ownership acknowledgements.
   return revelationCache.wrap(result,{source,params:scientific,
    getPreparedSource:()=>serialized(()=>engine.getPreparedSource(source,{maxSide:scientific.maxSide})),
    prepareEndpoint:(revelation,options)=>serialized(()=>engine.run(source,{...scientific,revelation},{...hooks,...options}))});
  },
  async clearCache(){await revelationCache.clear();return serialized(()=>engine.clearCache());},
  memory:()=>engine.memory(),
  async dispose(){await revelationCache.dispose();return serialized(()=>engine.dispose());}
 };
}
