import {prepareDeferredNonlocal,admitsDeferredNonlocal} from './deferred-nonlocal.js';
import {createCandidateGpu} from './candidates-gpu.js';
import {createResidentCandidatePlan} from './resident-candidate-plan.js';
import {validateD2prlDescriptor,getD2prlDescriptorLease} from './descriptor-ownership.js';
import {requireValue,checkAbort} from '../../src/errors.js';
import {preserveConvolutionPrimary} from './convolution-retirement.js';
// Private whole448/MPS facade. Unsupported tasks keep their old factory;
// no shared model/registry/strict route is changed by this draft.
export async function createResidentEvaluator({budget,operation,ownPlan,onRetirementOwner,arithmetic='mps'}={}){
 requireValue(budget?.reserve&&typeof ownPlan==='function'&&arithmetic==='mps','Existing parent registry and native MPS arithmetic required');let engine,ready=false,disposed=false,retired=false,closing,busy=false,activeDone=Promise.resolve();const stats={backend:'webgpu',evaluations:0,residentEvaluations:0,descriptorValidationElements:0,lostContextReplays:0};
 async function construct(){ready=false;engine=await createCandidateGpu({budget,operation,residentEvaluator:true,onRetirementOwner:value=>{engine=value;}});ready=true;}
 const owner={
  get residentBytes(){return engine?.stats.residentBytes??0;},get stats(){return{...stats,tileSize:262144,kernel:engine?.stats};},get transport(){return engine;},
  admitsResident({side,scientificMask,usesRandom,random}){return side===448&&scientificMask===null&&(!usesRandom||typeof random.reserveSource==='function');},
  async prepareNonlocal({random,pair,side,scientificMask,signal,adoptLogicalOwner}){
   checkAbort(signal);requireValue(!disposed&&!busy&&typeof adoptLogicalOwner==='function','Resident evaluator and logical owner required');
   if(!admitsDeferredNonlocal({side,arithmetic,scientificMask})||typeof random.reserveSourcePair!=='function')return null;
   let recipe;
   try{const value=await ownPlan(async adoptOwner=>(await prepareDeferredNonlocal({random,pair,side,budget,signal,operation,adoptOwner:value=>{recipe=value;adoptOwner(value);adoptLogicalOwner(value);}}))??recipe);return value.retired?null:value;}
   catch(error){if(!signal?.aborted&&['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code)){try{await recipe?.dispose();}catch(cleanup){preserveConvolutionPrimary(error,cleanup);throw error;}return null;}throw error;}
  },
  prepareResident({random,pair,bounds,side,kind,signal}){checkAbort(signal);requireValue(!disposed&&!busy,'Resident evaluator unavailable');return ownPlan(adoptOwner=>createResidentCandidatePlan({random,pair,bounds,side,kind,budget,adoptOwner,signal}));},
  async evaluate(p,{signal}={}){
   checkAbort(signal);requireValue(!disposed&&!busy&&p.side===448&&p.scientificMask==null&&p.residentPlan?.residentPlan,'Private whole448 resident evaluator admission');busy=true;let finish;activeDone=new Promise(r=>finish=r);let result;
   try{
    const publication=await validateD2prlDescriptor(p.features,{signal});stats.descriptorValidationElements+=publication.elementsScanned;checkAbort(signal);
    if(!ready){await engine?.dispose();engine=undefined;await construct();}
    for(let attempt=0;;attempt++){
     try{result=await engine.evaluateResident(p.residentPlan,{source:p.features,side:p.side,channels:p.channels,referenceThreads:p.referenceThreads},{signal});break;}
     catch(error){
      if(attempt!==0||signal?.aborted||!engine.isContextLostError(error))throw error;
      // The same adopted parent remains strong. Retire the lost child before
      // reserving a replacement; the plan's host recipe and ticket stay live.
      try{await engine.dispose();}catch(cleanup){preserveConvolutionPrimary(error,cleanup);throw error;}
      engine=undefined;ready=false;checkAbort(signal);await construct();stats.lostContextReplays++;
     }
    }
    checkAbort(signal);if(publication.lease)requireValue(getD2prlDescriptorLease(p.features)===publication.lease,'Descriptor publication changed');await p.residentPlan.commitAfterGpu();
    const output={x:result.x,y:result.y};result.release();result=null;stats.evaluations++;stats.residentEvaluations++;return output;
   }catch(error){if(result)try{result.release();}catch(cleanup){preserveConvolutionPrimary(error,cleanup);}throw error;}finally{busy=false;finish();}
  },
  dispose(){if(retired)return closing??Promise.resolve();if(closing)return closing;disposed=true;const task=activeDone.then(()=>engine?.dispose());closing=task;task.then(()=>{retired=true;},()=>{if(closing===task)closing=null;});return task;}
 };
 onRetirementOwner?.(owner);
 try{await construct();return owner;}catch(error){try{await owner.dispose();}catch(cleanup){preserveConvolutionPrimary(error,cleanup);}throw error;}
}
