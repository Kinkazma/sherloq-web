// Full native PatchMatch control flow; experimental descriptor input only.
// The model's learned features, output heads and masks are not supplied here.
import{requireValue,checkAbort,controlCheckpoint}from'../../src/errors.js';
import{createEvaluator}from'./evaluator.js';import{NativeRandom}from'./random.js';
import{initialOffsets,searchBounds,randomCandidates,wrapOffsets,propagateOffsets,nonlocalOffsets}from'./candidates.js';
const f=Math.fround;
export async function createPatchMatch(factory,{budget,evaluatorFactory=createEvaluator}={}){
 requireValue(budget&&typeof budget.reserve==='function','Shared memory budget required');const heapReleases=[];let evaluator,busy=false,disposed=false;
 try{evaluator=await evaluatorFactory(factory,{budget,account:bytes=>heapReleases.push(budget.reserve(bytes))});}catch(error){for(const release of heapReleases)release();throw error;}
 return{
  get residentBytes(){return evaluator.residentBytes;},
  async run({zmFeatures,cnnFeatures,cnnFinalFeatures=cnnFeatures,side=448,iterations=40,randomState,referenceThreads=8},{signal,onProgress,onTrace}={}){
   requireValue(!busy&&!disposed,'PatchMatch unavailable');requireValue(Number.isInteger(side)&&side>=2&&side<=448&&Number.isInteger(iterations)&&iterations>=1&&iterations<=40,'Unsupported PatchMatch shape/iterations');
   requireValue(Number.isInteger(referenceThreads)&&referenceThreads>=1&&referenceThreads<=32,'Invalid native thread layout');
   const n=side*side;for(const [value,channels]of[[zmFeatures,36],[cnnFeatures,96],[cnnFinalFeatures,96]])requireValue(value instanceof Uint16Array&&value.length===channels*n,'Half descriptors required');
   checkAbort(signal);busy=true;let workspace,outputRelease,random,completed=false;
   try{
    // Borrowed descriptors, both branches/windows, two largest candidate pairs,
    // evaluation copies, random scratch, and state. Heap growth is charged once
    // separately and retained until disposal, never multiplied per iteration.
    const descriptors=new Set([zmFeatures,cnnFeatures,cnnFinalFeatures]);workspace=budget.reserve([...descriptors].reduce((a,v)=>a+v.byteLength,0)+304*n+1024**2);outputRelease=budget.reserve(32*n+4096);
    random=new NativeRandom(randomState);const hooks={signal};let pairs=await initialOffsets(side,random,hooks);
    const bounds={minX:new Float32Array(n),maxX:new Float32Array(n),minY:new Float32Array(n),maxY:new Float32Array(n)};
    for(let i=0;i<n;i++){bounds.minX[i]=-(i%side);bounds.maxX[i]=side-i%side-1;bounds.minY[i]=-Math.floor(i/side);bounds.maxY[i]=side-Math.floor(i/side)-1;if((i&8191)===0)checkAbort(signal);}
    let windows={zm:bounds,cnn:bounds},calls=0;const total=5*(iterations-1)+3;
    const evaluate=async(branch,candidates,iteration,phase,features)=>{
     candidates=await wrapOffsets(candidates,side,hooks);
     const result=await evaluator.evaluate({features:features??(branch==='zm'?zmFeatures:cnnFeatures),offsetX:candidates.x,offsetY:candidates.y,side,channels:branch==='zm'?36:96,candidates:candidates.x.length/n,referenceThreads},{signal,account:bytes=>{const growth=bytes-8*n;if(growth>0)heapReleases.push(budget.reserve(growth));}});
     calls++;await onTrace?.({iteration,branch,phase,call:calls,x:result.x,y:result.y});checkAbort(signal);onProgress?.({iteration,iterations,branch,phase,completed:calls,total,fraction:calls/total});return result;
    };
    for(let iteration=0;iteration<iterations;iteration++){
     pairs.zm=await evaluate('zm',await randomCandidates(pairs.zm,windows.zm,side,random,hooks),iteration,'random');
     pairs.cnn=await evaluate('cnn',await randomCandidates(pairs.cnn,windows.cnn,side,random,hooks),iteration,'random');
     if(iteration<iterations-1){
      pairs.zm=await evaluate('zm',await propagateOffsets(pairs.zm,side,hooks),iteration,'propagate-1');
      pairs.zm=await evaluate('zm',await propagateOffsets(pairs.zm,side,hooks),iteration,'propagate-2');
      pairs.cnn=await evaluate('cnn',await propagateOffsets(pairs.cnn,side,hooks),iteration,'propagate');
      pairs.zm=await nonlocalOffsets(pairs.zm,side,random,hooks);pairs.cnn=await nonlocalOffsets(pairs.cnn,side,random,hooks);
      windows={zm:await searchBounds(pairs.zm,side,hooks),cnn:await searchBounds(pairs.cnn,side,hooks)};
     }else pairs.cnn=await evaluate('cnn',await propagateOffsets(pairs.cnn,side,hooks),iteration,'final',cnnFinalFeatures);
     await controlCheckpoint(signal);
    }
    const coordinates={};for(const branch of['zm','cnn']){const p=pairs[branch],q={x:new Float32Array(n),y:new Float32Array(n)};for(let i=0;i<n;i++){q.x[i]=f(p.x[i]+i%side);q.y[i]=f(p.y[i]+Math.floor(i/side));if((i&8191)===0)checkAbort(signal);}coordinates[branch]=q;}
    const finalRandomState=random.snapshot();checkAbort(signal);completed=true;return{offsets:pairs,coordinates,finalRandomState,iterations,evaluations:calls,referenceThreads,release:outputRelease};
   }finally{random?.dispose();workspace?.();if(!completed)outputRelease?.();busy=false;}
  },
  dispose(){requireValue(!busy,'PatchMatch busy');if(disposed)return;disposed=true;evaluator.dispose();for(const release of heapReleases)release();heapReleases.length=0;}
 };
}
