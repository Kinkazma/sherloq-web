import {createStrictSingleRetirement} from './strict-single-retirement.js';
import {preserveConvolutionPrimary} from './convolution-retirement.js';
import {requireValue,checkAbort} from '../../src/errors.js';
import {allocateOwnedTypedArray} from '../../src/allocation.js';
import {requireStrictFragmentPlan} from './strict-fragment-plan.js';
import {createPatchMatch} from './patchmatch.js';
import {createEvaluatorPool} from './evaluator-pool.js';
/** A complete context rectangle uses the original native pool directly. This
 * keeps ordinary local matching transport unchanged, even when strict source
 * provenance was needed to obtain that lossless RGB rectangle. */
export async function runStrictSingleFragmentPatchMatch(plan,bank,{candidateDomain,nativeEvaluatorUrl,nativeDescriptorLayout='CHW-uint16',maxWorkers,operation,evaluatorFactory,iterationFactory,randomFactory,candidateFactory,randomState,side=448,iterations=40,referenceThreads=8},{budget,signal,onProgress,onTrace,checkpointKey,adoptRetirementOwner}={}){
 requireStrictFragmentPlan(plan);const owner=plan.fragments[0];requireValue(plan.fragments.length===1&&owner.bounds.every((v,i)=>v===plan.bounds[i])&&typeof nativeEvaluatorUrl==='string'&&candidateDomain?.sourceSha256===plan.sourceSha256,'The native fast path requires one complete verified context rectangle.');checkAbort(signal);
 const features=[],n=side*side;let engine,pool,mask,result,complete=false,admitted=0,failure,hasFailure=false;
 const retirement=createStrictSingleRetirement({budget,engine:()=>engine,result:()=>result,mask:()=>mask,features:()=>features,complete:()=>complete});
 signal=AbortSignal.any([signal,retirement.signal].filter(Boolean));const adopt=adoptRetirementOwner??iterationFactory?.adoptWrapper;
 try{if(adopt!=null){requireValue(typeof adopt==='function','Wrapper retirement adopter');const value=await adopt(retirement);requireValue(value===retirement,'Wrapper retirement owner identity');retirement.admit({parentAdopted:true});}else retirement.admit();for(const [field,channels]of[['zm',36],['cnn',96]]){const value=await bank.read(owner.index,field,{signal});features.push(value);checkAbort(signal);requireValue(value.dtype==='float16'&&value.data.length===channels*n,'Native descriptor grid differs.');}
  mask=allocateOwnedTypedArray(Uint8Array,n,{budget,owner:'d2prl',label:'strict-native-candidate-membership'});for(let i=0;i<n;i++){const p=plan.toOriginal(owner,i%side,Math.floor(i/side),{gridSide:side});if(candidateDomain.containsOriginal(Math.floor(p[0]+.5),Math.floor(p[1]+.5))){mask.data[i]=1;admitted++;}if((i&8191)===0)checkAbort(signal);}
  const iterationSelected=typeof iterationFactory==='function'&&admitted===n&&side===448&&onTrace==null;
  const iterationMode=iterationSelected?(iterationFactory.progressMode??'iteration-atomic'):'iteration-atomic';if(iterationSelected)requireValue(['iteration-atomic','iteration-pair-atomic'].includes(iterationMode),'Declared iteration progression mode required');
  engine=iterationSelected?await iterationFactory({budget,operation,side,scientificMask:null,progressMode:iterationMode}):await createPatchMatch(null,{budget,operation,...(randomFactory?{randomFactory}:{}),...(candidateFactory?{candidateFactory}:{}),evaluatorFactory:async(_, {budget})=>pool=await(evaluatorFactory?evaluatorFactory({budget,operation,side,scientificMask:admitted===n?null:mask.data}):createEvaluatorPool(nativeEvaluatorUrl,{budget,maxWorkers,operation,descriptorLayout:nativeDescriptorLayout}))});
  checkAbort(signal);
  result=await engine.run({zmFeatures:features[0].data,cnnFeatures:features[1].data,side,iterations,referenceThreads,randomState,...(admitted!==n?{scientificMask:mask.data}:{})},{signal,onProgress,onTrace,checkpointKey,...(iterationSelected?{progressMode:iterationMode}:{})});checkAbort(signal);const publication={...result,execution:{path:evaluatorFactory?'gpu-single-context-rectangle':'unchanged-native-single-context-rectangle',backend:evaluatorFactory?'webgpu':'wasm-workers',pool:structuredClone(pool?.stats??engine.stats),...(iterationSelected?{residentIteration:result.residentIteration}:{}),admittedCentres:admitted,totalCentres:n}};checkAbort(signal);complete=true;return publication;
 }catch(error){hasFailure=true;failure=error;throw error;}finally{retirement.seal();try{await retirement.dispose();}catch(cleanupError){if(hasFailure)preserveConvolutionPrimary(failure,cleanupError);else throw cleanupError;}}
}
