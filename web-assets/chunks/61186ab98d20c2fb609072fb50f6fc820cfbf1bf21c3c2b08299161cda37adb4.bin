import {preserveConvolutionPrimary} from './convolution-retirement.js';
import {nonlocalCandidateTransport} from './nonlocal-candidate-transport.js';
import {createGpuRetirementRegistry} from './gpu-retirement.js';
import {randomCandidateTransport} from './random-candidate-transport.js';
import {noisesnifferOwnerRetirement as createPmRetirement} from '../../src/noisesniffer-owner-retirement.js';
// Full native PatchMatch control flow; experimental descriptor input only.
import{requireValue,checkAbort,controlCheckpoint}from'../../src/errors.js';
import{retainD2prlCheckpoint}from'./checkpoint.js';
import{createEvaluator}from'./evaluator.js';import{NativeRandom}from'./random.js';
import{initialOffsets,searchBounds,randomCandidates,wrapOffsets,propagateOffsets,nonlocalOffsets,createCandidateWorkspace}from'./candidates.js';
import{borrowD2prlDescriptorFunding}from'./descriptor-ownership.js';
const f=Math.fround,directOperation=(_label,work)=>work();
export async function createPatchMatch(factory,{budget,evaluatorFactory=createEvaluator,operation=directOperation,randomFactory=state=>new NativeRandom(state),candidateFactory}={}){
 requireValue(budget&&typeof budget.reserve==='function','Shared memory budget required');const heapReleases=[],descriptorBorrows=new Set();let evaluator,busy=false,disposed=false,checkpoint,disposing,disposeRetirement,evaluatorRetired=false,randomRetired=false;
 try{evaluator=await evaluatorFactory(factory,{budget,account:bytes=>heapReleases.push(budget.reserve(bytes))});}catch(error){for(const release of heapReleases)release();throw error;}
 // The random-backend retirement barrier also covers the optional candidate transport.
 const randomRetirements=createGpuRetirementRegistry(),randomRetirementOwners=new WeakMap();
 const retireRandom=value=>{let owner=randomRetirementOwners.get(value);if(!owner){requireValue(typeof value?.dispose==='function','Random retirement owner');const close=value.dispose.bind(value);owner={async dispose(){const ack=await close();if(ack===0||ack===false)throw ack;}};randomRetirementOwners.set(value,owner);}return randomRetirements.retire(owner);};
 const trackRandom=value=>value&&retireRandom(value).catch(()=>{}),closeRandom=()=>randomRetirements.close();
 const clear=()=>{if(!checkpoint)return;const old=checkpoint;checkpoint=null;let failure,failed=false;const retire=work=>{try{work();}catch(error){if(!failed){failed=true;failure=error;}}};retire(()=>old.pending?.release?.());for(const recipe of old.nonlocalRecipes??[])retire(()=>trackRandom(recipe));retire(()=>old.candidatesWorkspace?.dispose());retire(()=>trackRandom(old.random));retire(()=>trackRandom(old.candidateTransport));retire(()=>old.workspace?.());retire(()=>old.outputRelease?.());if(failed)throw failure;};
 return{
  get residentBytes(){return evaluator.residentBytes;},
  async run({zmFeatures,cnnFeatures,cnnFinalFeatures=cnnFeatures,side=448,iterations=40,randomState,referenceThreads=8,scientificMask=null},{signal,onProgress,onTrace,checkpointKey}={}){
   requireValue(!busy&&!disposed,'PatchMatch unavailable');requireValue(Number.isInteger(side)&&side>=2&&side<=1792&&Number.isInteger(iterations)&&iterations>=1&&iterations<=40,'Unsupported PatchMatch shape/iterations');requireValue(Number.isInteger(referenceThreads)&&referenceThreads>=1&&referenceThreads<=32,'Invalid native thread layout');
   const n=side*side;for(const[value,channels]of[[zmFeatures,36],[cnnFeatures,96],[cnnFinalFeatures,96]])requireValue(value instanceof Uint16Array&&value.length===channels*n,'Half descriptors required');
   if(signal?.aborted){busy=true;let failure;try{try{checkAbort(signal);}catch(error){failure=error;}try{clear();}catch(error){failure??=error;}try{await closeRandom();}catch(error){failure??=error;}throw failure;}finally{busy=false;}}
   busy=true;const randomIdentity=JSON.stringify(randomState);
   if(checkpoint&&(checkpoint.key!==checkpointKey||checkpoint.zmFeatures!==zmFeatures||checkpoint.cnnFeatures!==cnnFeatures||checkpoint.cnnFinalFeatures!==cnnFinalFeatures||checkpoint.side!==side||checkpoint.iterations!==iterations||checkpoint.referenceThreads!==referenceThreads||checkpoint.randomIdentity!==randomIdentity||checkpoint.scientificMask!==scientificMask))clear();
   const state=checkpoint??{key:checkpointKey,zmFeatures,cnnFeatures,cnnFinalFeatures,side,iterations,referenceThreads,randomIdentity,scientificMask,cursor:0,calls:0,coordinates:{}};checkpoint=state;let retain=false,failure,hasFailure=false,delivered;
   try{
    if(!state.workspace){const descriptors=new Set([zmFeatures,cnnFeatures,cnnFinalFeatures]);await operation('patchmatch:admission',()=>{const borrowed=[];let descriptorBytes=0;try{for(const view of descriptors){const loan=borrowD2prlDescriptorFunding(view,budget);if(loan)borrowed.push(loan);else descriptorBytes+=view.byteLength;}const owned=budget.reserve(descriptorBytes+336*n+1024**2+4096+32*side+512);state.outputRelease=owned.split(32*n+4096);state.workspace=owned;for(const loan of borrowed)descriptorBorrows.add(loan);}catch(error){for(const loan of borrowed)loan.release();throw error;}});}
    state.nonlocalRecipes??=new Set();state.deferredNonlocalCount??=0;state.deferredNonlocalConsumed??=0;
    state.random??=await operation('patchmatch:rng',()=>randomFactory(randomState));state.candidatesWorkspace??=createCandidateWorkspace(side);
    const random=state.random,hooks={signal},candidateHooks={signal,allocate:count=>state.candidatesWorkspace.allocate(count),geometry:gridSide=>state.candidatesWorkspace.geometry(gridSide)};
    const randomOperation=async(label,work)=>{const saved=await operation(label+':rng-checkpoint',()=>random.snapshot());return operation(label,async()=>{try{return await work();}catch(error){random.restore(saved);throw error;}});};
    const candidateOperation=(label,generate,usesRandom=false,gpuPair,gpuBounds)=>{
     const work=async()=>{
      state.candidatesWorkspace.begin();
      if(evaluator.prepareResident&&evaluator.admitsResident?.({side,scientificMask,usesRandom,random})){return evaluator.prepareResident({random,pair:gpuPair,bounds:gpuBounds,side,kind:usesRandom?'random':'propagate',signal});}
      if(gpuPair&&candidateFactory){
       state.candidateTransport??=await candidateFactory({budget,operation});
       if(usesRandom&&typeof state.candidateTransport.randomAndWrap==='function'){
        return randomCandidateTransport({random,transport:state.candidateTransport,pair:gpuPair,bounds:gpuBounds,side,hooks:candidateHooks,transportOptions:{signal},wrap:pair=>wrapOffsets(pair,side,{signal,inPlace:true})});
       }
       if(!usesRandom&&typeof state.candidateTransport.propagateAndWrap==='function'){
        const pair=await state.candidateTransport.propagateAndWrap(gpuPair,side,{signal});if(pair)return pair;
       }
      }
      const pair=await generate(candidateHooks);return wrapOffsets(pair,side,{signal,inPlace:true});
     };
     return usesRandom?randomOperation(label,work):operation(label,work);
    };
    state.pairs??=await randomOperation('patchmatch:initial-offsets',()=>initialOffsets(side,random,hooks));
    if(!state.windows){const bounds=await operation('patchmatch:initial-bounds',()=>({minX:new Float32Array(n),maxX:new Float32Array(n),minY:new Float32Array(n),maxY:new Float32Array(n)}));for(let i=0;i<n;i++){bounds.minX[i]=-(i%side);bounds.maxX[i]=side-i%side-1;bounds.minY[i]=-Math.floor(i/side);bounds.maxY[i]=side-Math.floor(i/side)-1;if((i&8191)===0)checkAbort(signal);}state.windows={zm:bounds,cnn:bounds};}
    const steps=[];for(let iteration=0;iteration<iterations;iteration++){
     const add=(branch,kind,phase=kind)=>steps.push({iteration,branch,kind,phase});add('zm','random');add('cnn','random');
     if(iteration<iterations-1){add('zm','propagate','propagate-1');add('zm','propagate','propagate-2');add('cnn','propagate');add('zm','nonlocal');add('cnn','nonlocal');add('zm','bounds');add('cnn','bounds');}else add('cnn','propagate','final');add(null,'checkpoint');
    }
    const total=5*(iterations-1)+3;
    while(state.cursor<steps.length){
     checkAbort(signal);const{iteration,branch,kind,phase}=steps[state.cursor];
     if(kind==='checkpoint'){state.cursor++;await controlCheckpoint(signal);continue;}
     if(kind==='nonlocal'){
      if(evaluator.prepareNonlocal){
       const beforeLogical=random.snapshot();let adopted;
       try{const recipe=await randomOperation('patchmatch:deferred-nonlocal-'+branch,()=>evaluator.prepareNonlocal({random,pair:state.pairs[branch],side,scientificMask,signal,adoptLogicalOwner:value=>{adopted=value;state.nonlocalRecipes.add(value);}}));if(recipe){state.pairs[branch]=recipe;state.deferredNonlocalCount++;state.cursor++;continue;}if(adopted?.retired)state.nonlocalRecipes.delete(adopted);}
       catch(error){try{random.restore(beforeLogical);}catch(cleanup){preserveConvolutionPrimary(error,cleanup);}if(adopted)try{await retireRandom(adopted);state.nonlocalRecipes.delete(adopted);}catch(cleanup){preserveConvolutionPrimary(error,cleanup);}throw error;}
      }
      if(!state.candidateTransport&&candidateFactory)state.candidateTransport=await candidateFactory({budget,operation});state.pairs[branch]=await randomOperation('patchmatch:nonlocal-'+branch,()=>nonlocalCandidateTransport({random,transport:state.candidateTransport,pair:state.pairs[branch],side,hooks}));state.cursor++;continue;
     }
     if(kind==='bounds'){if(state.pairs[branch]?.deferredNonlocal){state.windows[branch]=state.pairs[branch];state.cursor++;continue;}state.windows[branch]=await operation('patchmatch:bounds-'+branch,()=>searchBounds(state.pairs[branch],side,hooks));state.cursor++;continue;}
     // The candidate and the advanced RNG belong to this uncommitted evaluation.
     // Keep both on terminal refusal; explicit resume retries this evaluation only.
     state.pending??=await candidateOperation('patchmatch:'+kind+'-'+branch,owned=>kind==='random'?randomCandidates(state.pairs[branch],state.windows[branch],side,random,owned):propagateOffsets(state.pairs[branch],side,owned),kind==='random',state.pairs[branch],kind==='random'?state.windows[branch]:undefined);
     const candidates=state.pending,result=await operation('patchmatch:evaluate-'+branch+'-'+phase,()=>evaluator.evaluate({features:phase==='final'?cnnFinalFeatures:branch==='zm'?zmFeatures:cnnFeatures,offsetX:candidates.x,offsetY:candidates.y,residentPlan:candidates.residentPlan?candidates:undefined,side,channels:branch==='zm'?36:96,candidates:candidates.residentPlan?(kind==='random'?5:13):candidates.x.length/n,referenceThreads,...(scientificMask?{scientificMask}:{})},{signal,account:bytes=>{const growth=bytes-8*n;if(growth>0)heapReleases.push(budget.reserve(growth));}}));
     const previousRecipe=state.pairs[branch]?.deferredNonlocal?state.pairs[branch]:null;state.pairs[branch]=result;state.pending=null;if(previousRecipe){state.deferredNonlocalConsumed++;const task=retireRandom(previousRecipe);task.then(()=>state.nonlocalRecipes.delete(previousRecipe),()=>{});}candidates.release?.();state.cursor++;state.calls++;
     await onTrace?.({iteration,branch,phase,call:state.calls,x:result.x,y:result.y});checkAbort(signal);onProgress?.({iteration,iterations,branch,phase,completed:state.calls,total,fraction:state.calls/total});
    }
    for(const branch of['zm','cnn'])if(!state.coordinates[branch]){const p=state.pairs[branch],q=await operation('patchmatch:coordinates-'+branch,()=>({x:new Float32Array(n),y:new Float32Array(n)}));for(let i=0;i<n;i++){q.x[i]=f(p.x[i]+i%side);q.y[i]=f(p.y[i]+Math.floor(i/side));if((i&8191)===0)checkAbort(signal);}state.coordinates[branch]=q;}
    const finalRandomState=await operation('patchmatch:final-rng',()=>random.snapshot());checkAbort(signal);const result={offsets:state.pairs,coordinates:state.coordinates,finalRandomState,iterations,evaluations:state.calls,referenceThreads,deferredNonlocal:{created:state.deferredNonlocalCount,consumed:state.deferredNonlocalConsumed},candidateWorkspace:state.candidatesWorkspace.snapshot(),candidateTransport:state.candidateTransport?structuredClone(state.candidateTransport.stats):undefined,release:state.outputRelease};state.outputRelease=null;delivered=result;return result;
   }catch(error){hasFailure=true;failure=error;retain=retainD2prlCheckpoint(error,signal,checkpointKey);throw error;}finally{let cleanupError,hasCleanupError=false;const failed=error=>{if(!hasCleanupError){hasCleanupError=true;cleanupError=error;}};try{if(!retain)clear();}catch(error){failed(error);}try{await closeRandom();}catch(error){failed(error);}busy=false;if(hasCleanupError&&!hasFailure){try{delivered?.release();}catch{}throw cleanupError;}}
  },
  releaseCheckpoint(key){requireValue(!busy,'PatchMatch busy');if(key===undefined||checkpoint?.key===key)clear();return closeRandom();},
  checkpointSnapshot(){return checkpoint?{completed:checkpoint.calls,nextStep:checkpoint.cursor,pending:!!checkpoint.pending}:null;},
  dispose(){requireValue(!busy,'PatchMatch busy');disposed=true;disposeRetirement??=createPmRetirement([clear,async()=>{const ack=await evaluator.dispose();if(ack===0||ack===false)throw ack;evaluatorRetired=true;},()=>{for(const release of heapReleases)release();heapReleases.length=0;},async()=>{const ack=await closeRandom();if(ack===0||ack===false)throw ack;randomRetired=true;},()=>{requireValue(evaluatorRetired&&randomRetired,'Descriptor borrowers require evaluator and random retirement ACK');for(const loan of [...descriptorBorrows]){loan.release();descriptorBorrows.delete(loan);}}]);return disposing=disposeRetirement();}
 };
}
