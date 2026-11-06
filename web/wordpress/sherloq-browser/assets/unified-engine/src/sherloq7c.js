import "../../runtime-context.js?v=0.31.0";
// Thin product name/API bridge. The frozen entry is the only 7C implementation.
import {createProxy7C} from '../vendor/frozen-sherloq7c183/sherloq7c-memory.mjs';
import {resolveComputeProfile} from '../vendor/frozen-sherloq7c183/engine/src/profiles.js';
import {createFrozen7cBudget,FROZEN_7C_CEILING} from './sherloq7c-frozen-budget.js';

export function createSherloq7C({budget,ceilingBytes=FROZEN_7C_CEILING,memoryBudgetBytes,resourceHints,gpu=true}={}){
 const initialBytes=memoryBudgetBytes??resolveComputeProfile('maximum',resourceHints).memoryBudgetBytes;
 const shared=createFrozen7cBudget(budget,{ceilingBytes,memoryBudgetBytes:initialBytes});
 // Resolve the initial admission with the frozen policy. Its automatic
 // ceiling remains open to fresh system observations; an explicit user limit
 // stays explicit. Every reservation is still admitted by the actual parent.
 const engine=createProxy7C({budget:shared,ceilingBytes,memoryBudgetBytes:memoryBudgetBytes??ceilingBytes,resourceHints,gpu});
 if(resourceHints)engine.updateResourceHints(resourceHints);
 return{
  budget:shared,
  createSource:(input,hooks)=>engine.createSource(input,hooks),
  updateResourceHints:hints=>engine.updateResourceHints(hints),
  // D4 supplied backend in hooks. The frozen entry reads it from params.
  run:(source,params={},hooks={})=>engine.run(source,{...params,backend:hooks.backend??params.backend??'auto'},hooks),
  clearCache:()=>engine.clearCache(),
  memory:()=>engine.memory(),
  dispose:()=>engine.dispose()
 };
}
