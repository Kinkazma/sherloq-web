import {createSherloq7CResident} from './sherloq7c-resident-engine.js';
import {createResidentMemoryPolicy,createResidentRgb16} from './sherloq7c-resident-memory.js';
import {createResidentPng16} from './sherloq7c-resident-png-source.js';
import {createNativeMaterializedGraph} from './graph-memory-native-compact.mjs';

// Standalone experimental entry point. All owners share one live RAM policy.
// Source/result windows and final PNG streams never select temporary storage.
export function createResident7C({budget,memoryBudgetBytes=budget?.limit,resourceHints,profile,ceilingBytes,segmentBytes,gpu=true}={}){
 const policy=createResidentMemoryPolicy({budget,memoryBudgetBytes,resourceHints,profile,ceilingBytes,segmentBytes});budget=policy.budget;
 const engine=createSherloq7CResident({budget,gpu,prepareGraph:async(source,{signal,onProgress})=>{
  const maximum=Math.floor(Math.min(2**31,budget.limit-source.byteLength)/65536)*65536;
  return createNativeMaterializedGraph(source,{memoryBudgetBytes:maximum,reserve:bytes=>budget.reserve(bytes),registerBacking:budget.registerBacking.bind(budget),signal,onProgress});
 }});
 return{
  budget,
  createSource:(input,options={})=>createResidentRgb16(input,{...options,budget,segmentBytes:policy.segmentBytes}),
  createPngSource:(encoded,options={})=>createResidentPng16(encoded,{...options,budget,segmentBytes:policy.segmentBytes}),
  run:(source,params,hooks)=>engine.run(source,params,hooks),
  clearCache:()=>engine.clearCache(),dispose:()=>engine.dispose(),
  updateResourceHints:hints=>policy.updateResourceHints(hints),
  memory:()=>({...engine.memory(),policy:policy.snapshot()})
 };
}
