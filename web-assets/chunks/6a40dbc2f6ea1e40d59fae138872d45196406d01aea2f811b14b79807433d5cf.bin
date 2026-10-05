// Full native PatchMatch control flow; experimental descriptor input only.
import{requireValue,checkAbort,controlCheckpoint}from'../../src/errors.js';
import{retainD2prlCheckpoint}from'./checkpoint.js';
import{createEvaluator}from'./evaluator.js';import{NativeRandom}from'./random.js';
import{initialOffsets,searchBounds,randomCandidates,wrapOffsets,propagateOffsets,nonlocalOffsets,createCandidateWorkspace}from'./candidates.js';
const f=Math.fround,directOperation=(_label,work)=>work();
export async function createPatchMatch(factory,{budget,evaluatorFactory=createEvaluator,operation=directOperation}={}){
 requireValue(budget&&typeof budget.reserve==='function','Shared memory budget required');const heapReleases=[];let evaluator,busy=false,disposed=false,checkpoint;
 try{evaluator=await evaluatorFactory(factory,{budget,account:bytes=>heapReleases.push(budget.reserve(bytes))});}catch(error){for(const release of heapReleases)release();throw error;}
 const clear=()=>{if(!checkpoint)return;const old=checkpoint;checkpoint=null;old.candidatesWorkspace?.dispose();old.random?.dispose();old.workspace?.();old.outputRelease?.();};
 return{
  get residentBytes(){return evaluator.residentBytes;},
  async run({zmFeatures,cnnFeatures,cnnFinalFeatures=cnnFeatures,side=448,iterations=40,randomState,referenceThreads=8},{signal,onProgress,onTrace,checkpointKey}={}){
   requireValue(!busy&&!disposed,'PatchMatch unavailable');requireValue(Number.isInteger(side)&&side>=2&&side<=448&&Number.isInteger(iterations)&&iterations>=1&&iterations<=40,'Unsupported PatchMatch shape/iterations');requireValue(Number.isInteger(referenceThreads)&&referenceThreads>=1&&referenceThreads<=32,'Invalid native thread layout');
   const n=side*side;for(const[value,channels]of[[zmFeatures,36],[cnnFeatures,96],[cnnFinalFeatures,96]])requireValue(value instanceof Uint16Array&&value.length===channels*n,'Half descriptors required');if(signal?.aborted){clear();checkAbort(signal);}busy=true;const randomIdentity=JSON.stringify(randomState);
   if(checkpoint&&(checkpoint.key!==checkpointKey||checkpoint.zmFeatures!==zmFeatures||checkpoint.cnnFeatures!==cnnFeatures||checkpoint.cnnFinalFeatures!==cnnFinalFeatures||checkpoint.side!==side||checkpoint.iterations!==iterations||checkpoint.referenceThreads!==referenceThreads||checkpoint.randomIdentity!==randomIdentity))clear();
   const state=checkpoint??{key:checkpointKey,zmFeatures,cnnFeatures,cnnFinalFeatures,side,iterations,referenceThreads,randomIdentity,cursor:0,calls:0,coordinates:{}};checkpoint=state;let retain=false;
   try{
    if(!state.workspace){const descriptors=new Set([zmFeatures,cnnFeatures,cnnFinalFeatures]);await operation('patchmatch:admission',()=>{const owned=budget.reserve([...descriptors].reduce((a,v)=>a+v.byteLength,0)+336*n+1024**2+4096);state.outputRelease=owned.split(32*n+4096);state.workspace=owned;});}
    state.random??=await operation('patchmatch:rng',()=>new NativeRandom(randomState));state.candidatesWorkspace??=createCandidateWorkspace(side);
    const random=state.random,hooks={signal},candidateHooks={signal,allocate:count=>state.candidatesWorkspace.allocate(count)};
    const randomOperation=async(label,work)=>{const saved=await operation(label+':rng-checkpoint',()=>random.snapshot());return operation(label,async()=>{try{return await work();}catch(error){random.restore(saved);throw error;}});};
    const candidateOperation=(label,generate,usesRandom=false)=>{const work=async()=>{state.candidatesWorkspace.begin();const pair=await generate(candidateHooks);return wrapOffsets(pair,side,{signal,inPlace:true});};return usesRandom?randomOperation(label,work):operation(label,work);};
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
     if(kind==='nonlocal'){state.pairs[branch]=await randomOperation('patchmatch:nonlocal-'+branch,()=>nonlocalOffsets(state.pairs[branch],side,random,hooks));state.cursor++;continue;}
     if(kind==='bounds'){state.windows[branch]=await operation('patchmatch:bounds-'+branch,()=>searchBounds(state.pairs[branch],side,hooks));state.cursor++;continue;}
     // The candidate and the advanced RNG belong to this uncommitted evaluation.
     // Keep both on terminal refusal; explicit resume retries this evaluation only.
     state.pending??=await candidateOperation('patchmatch:'+kind+'-'+branch,owned=>kind==='random'?randomCandidates(state.pairs[branch],state.windows[branch],side,random,owned):propagateOffsets(state.pairs[branch],side,owned),kind==='random');
     const candidates=state.pending,result=await operation('patchmatch:evaluate-'+branch+'-'+phase,()=>evaluator.evaluate({features:phase==='final'?cnnFinalFeatures:branch==='zm'?zmFeatures:cnnFeatures,offsetX:candidates.x,offsetY:candidates.y,side,channels:branch==='zm'?36:96,candidates:candidates.x.length/n,referenceThreads},{signal,account:bytes=>{const growth=bytes-8*n;if(growth>0)heapReleases.push(budget.reserve(growth));}}));
     state.pairs[branch]=result;state.pending=null;state.cursor++;state.calls++;
     await onTrace?.({iteration,branch,phase,call:state.calls,x:result.x,y:result.y});checkAbort(signal);onProgress?.({iteration,iterations,branch,phase,completed:state.calls,total,fraction:state.calls/total});
    }
    for(const branch of['zm','cnn'])if(!state.coordinates[branch]){const p=state.pairs[branch],q=await operation('patchmatch:coordinates-'+branch,()=>({x:new Float32Array(n),y:new Float32Array(n)}));for(let i=0;i<n;i++){q.x[i]=f(p.x[i]+i%side);q.y[i]=f(p.y[i]+Math.floor(i/side));if((i&8191)===0)checkAbort(signal);}state.coordinates[branch]=q;}
    const finalRandomState=await operation('patchmatch:final-rng',()=>random.snapshot());checkAbort(signal);const result={offsets:state.pairs,coordinates:state.coordinates,finalRandomState,iterations,evaluations:state.calls,referenceThreads,candidateWorkspace:state.candidatesWorkspace.snapshot(),release:state.outputRelease};state.outputRelease=null;return result;
   }catch(error){retain=retainD2prlCheckpoint(error,signal,checkpointKey);throw error;}finally{if(!retain)clear();busy=false;}
  },
  releaseCheckpoint(key){requireValue(!busy,'PatchMatch busy');if(key===undefined||checkpoint?.key===key)clear();},
  checkpointSnapshot(){return checkpoint?{completed:checkpoint.calls,nextStep:checkpoint.cursor,pending:!!checkpoint.pending}:null;},
  dispose(){requireValue(!busy,'PatchMatch busy');if(disposed)return;disposed=true;clear();evaluator.dispose();for(const release of heapReleases)release();heapReleases.length=0;}
 };
}
