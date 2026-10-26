import {requireValue,checkAbort} from '../../src/errors.js';
import {allocateOwnedTypedArray} from '../../src/allocation.js';
import {requireStrictFragmentPlan} from './strict-fragment-plan.js';
import {createPatchMatch} from './patchmatch.js';
import {createEvaluatorPool} from './evaluator-pool.js';
/** A complete context rectangle uses the original native pool directly. This
 * keeps ordinary local matching transport unchanged, even when strict source
 * provenance was needed to obtain that lossless RGB rectangle. */
export async function runStrictSingleFragmentPatchMatch(plan,bank,{candidateDomain,nativeEvaluatorUrl,nativeDescriptorLayout='CHW-uint16',maxWorkers,operation,randomState,side=448,iterations=40,referenceThreads=8},{budget,signal,onProgress,onTrace,checkpointKey}={}){
 requireStrictFragmentPlan(plan);const owner=plan.fragments[0];requireValue(plan.fragments.length===1&&owner.bounds.every((v,i)=>v===plan.bounds[i])&&typeof nativeEvaluatorUrl==='string'&&candidateDomain?.sourceSha256===plan.sourceSha256,'The native fast path requires one complete verified context rectangle.');checkAbort(signal);
 const features=[],n=side*side;let engine,pool,mask,result,complete=false,admitted=0;
 try{for(const [field,channels]of[['zm',36],['cnn',96]]){const value=await bank.read(owner.index,field,{signal});features.push(value);requireValue(value.dtype==='float16'&&value.data.length===channels*n,'Native descriptor grid differs.');}
  mask=allocateOwnedTypedArray(Uint8Array,n,{budget,owner:'d2prl',label:'strict-native-candidate-membership'});for(let i=0;i<n;i++){const p=plan.toOriginal(owner,i%side,Math.floor(i/side),{gridSide:side});if(candidateDomain.containsOriginal(Math.floor(p[0]+.5),Math.floor(p[1]+.5))){mask.data[i]=1;admitted++;}if((i&8191)===0)checkAbort(signal);}
  engine=await createPatchMatch(null,{budget,operation,evaluatorFactory:async(_, {budget})=>pool=await createEvaluatorPool(nativeEvaluatorUrl,{budget,maxWorkers,operation,descriptorLayout:nativeDescriptorLayout})});
  result=await engine.run({zmFeatures:features[0].data,cnnFeatures:features[1].data,side,iterations,referenceThreads,randomState,...(admitted!==n?{scientificMask:mask.data}:{})},{signal,onProgress,onTrace,checkpointKey});checkAbort(signal);complete=true;return{...result,execution:{path:'unchanged-native-single-context-rectangle',pool:structuredClone(pool.stats),admittedCentres:admitted,totalCentres:n}};
 }finally{if(!complete)result?.release();engine?.dispose();mask?.release();for(const value of features)value.release();}
}
