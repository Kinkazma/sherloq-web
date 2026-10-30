import "../../runtime-context.js?v=0.30.0";
import {Budget} from './cache.js';
import {prepareEfficientLoFtrLiteralContext} from './efficient-loftr-literal-contexts.js';
import {transformEfficientLoFtr} from './efficient-loftr-input.js';
import {createEfficientLoFtrContextBankLayout} from './efficient-loftr-context-bank.js';
import {runEfficientLoFtrLiteralBanks} from './efficient-loftr-literal-bank-chain.js';
import {efficientLoFtrLiteralMemory} from './efficient-loftr-literal-memory.js';
import {createEfficientLoFtrLiteralPoolRuntime} from './efficient-loftr-literal-pool-runtime.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {requireValue,checkAbort} from './errors.js';
/** One variant of ONE analysis. Only exact copies leave the unchanged chain;
 * all native sessions/GPU owners retire before the existing raw cache sees it. */
export async function runEfficientLoFtrLiteralVariant({view,plan,variant,threshold,asset,budget,profile,backend,runtimes,signal,onOwner,runtimeFactory=createEfficientLoFtrLiteralPoolRuntime}={}){
 requireValue(plan?.status==='ready'&&typeof onOwner==='function','A nonempty literal two-role plan and durable owner required.');const layout=createEfficientLoFtrContextBankLayout(plan,variant,{budget,signal}),memory=efficientLoFtrLiteralMemory(layout,variant);
 let prepaid,finalFree,chainBudget,runtime,raw,returned=false;const prepared=[];let closed=false;
 const owner={async dispose(){closed=true;await retireCompositeOwners([()=>raw?.dispose(),()=>runtime?.dispose(),...prepared.map(t=>()=>t.release()),()=>layout.release()]);requireValue(!chainBudget||chainBudget.total()===0,'Literal chain retains output owners.');if(prepaid){prepaid();prepaid=null;}}};
 try{onOwner(owner);}catch(error){layout.release();throw error;}
 try{
  checkAbort(signal);requireValue(memory.total<=budget.limit,'Requested literal native graph population exceeds the actual memory profile.');prepaid=budget.reserve(memory.chainEnvelope);chainBudget=new Budget(memory.chainEnvelope);const inputs=new Map();
  for(const c of layout.banks.flatMap(b=>b.contexts)){const base=await prepareEfficientLoFtrLiteralContext(view,c,{budget:chainBudget,signal});prepared.push(base);const input=c.side===1?transformEfficientLoFtr(base,variant,{reserveMemory:n=>chainBudget.reserve(n)}):base;if(input!==base)prepared.push(input);inputs.set(c.id,{type:'float32',dims:[...input.dims],data:input.data});}
  runtime=runtimeFactory({asset,budget,chainBudget,profile,backend,runtimes,memory,signal,onOwner:o=>{runtime??=o;}});
  raw=await runEfficientLoFtrLiteralBanks({layout,inputs,threshold:{type:'float32',dims:[],data:Float32Array.of(threshold)},runStage:runtime.runStage,budget:chainBudget,signal,onOwner:o=>{raw??=o;}});checkAbort(signal);
  const count=raw.confidence.data.length;finalFree=budget.reserve(count*28+layout.banks.reduce((n,b)=>n+b.contexts.length*1024,0));
  const tensors=Object.fromEntries(['keypoints0','keypoints1','confidence'].map(name=>{const t=raw[name];return[name,{type:t.type,dims:[...t.dims],data:t.data.slice()}];})),rowContexts=new Uint32Array(count*2),contextCrops=layout.banks.map(b=>b.contexts.map(c=>({...c.nativeCrop,x:c.sourceRect.x,y:c.sourceRect.y})));
  for(const bank of raw.rows.banks)for(const batch of bank.contexts)for(const ordinal of batch.ordinals)rowContexts[ordinal*2+bank.side]=batch.context.index;
  const metrics={provider:runtime.audit.provider,requestedBackend:backend,threads:Math.max(0,...runtime.audit.stages.map(s=>s.metrics?.threads??0)),logicalGraphRequests:raw.logicalRequests,nativeStages:runtime.audit.stages,sourceContextPolicy:plan.contextPolicy,rolePixels:layout.banks.map(b=>b.pixels),contexts:layout.banks.map(b=>b.contexts.map(c=>({id:c.id,sourceRect:c.sourceRect,originOriginal:c.originOriginal,effectiveVariant:c.effectiveVariant,coarse:c.coarse,aggregate:c.aggregate}))),memoryAdmission:memory},candidateComparisons=layout.banks[0].coarseCells*layout.banks[1].coarseCells;
  // These final independent copies survive the complete ACK of every native
  // stage and chain owner. Existing cache adoption then remains synchronous.
  await owner.dispose();let done=false;const result={tensors,count,rowContexts,contextCrops,candidateComparisons,maximumMatches:memory.coarseCellsPerRole[0],metrics,release(){if(!done){done=true;finalFree();finalFree=null;}}};returned=true;return result;
 }catch(primary){await retireCompositeOwners([()=>owner.dispose(),()=>finalFree?.()],{primary});throw primary;}finally{if(!returned&&!closed)await owner.dispose();}
}
