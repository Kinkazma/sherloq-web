import {requireValue,checkAbort,controlCheckpoint} from '../../src/errors.js';
import {allocateOwnedTypedArray} from '../../src/allocation.js';
import {validateD2prlDescriptor,getD2prlDescriptorLease} from './descriptor-ownership.js';
import {scientificTargetAllowed} from './scientific-matching.js';
import {createD2prlGpuKernel} from './evaluator-gpu-kernel.js';

/** The public evaluator input remains native CHW, independently of the CPU
 * worker's internal HWC layout. Transport tiles keep global arithmetic indices.
 * PatchMatch owns the complete offset fields through its existing workspace. */
export async function createD2prlGpuEvaluator({budget,operation,tileSize=262144,kernelFactory=createD2prlGpuKernel,arithmetic='cpu'}={}){
 requireValue(budget?.reserve&&Number.isSafeInteger(tileSize)&&tileSize>=1&&tileSize<=262144,'Shared GPU evaluator budget and bounded tile size required');
 const kernel=await kernelFactory({budget,operation,arithmetic});let busy=false,disposed=false,retirement,activeDone=Promise.resolve(),finishActive;
 const stats={backend:'webgpu',tiles:0,evaluations:0,packedPixels:0,descriptorValidationElements:0,scientificMatching:{evaluatedSources:0,rejectedSources:0,rejectedCandidates:0,projectedOutputs:0,unmatchedSources:0}};
 const alive=signal=>{checkAbort(signal);requireValue(!disposed,'GPU evaluator disposed');};
 return{
  get residentBytes(){return kernel.residentBytes??kernel.stats?.residentBytes??0;},
  get stats(){return{...stats,scientificMatching:{...stats.scientificMatching},tileSize,kernel:{...kernel.stats},arithmeticQualification:'experimental-webgpu-requires-exact-oracle-qualification'};},
  async evaluate({features,offsetX,offsetY,side,channels,candidates,referenceThreads=8,scientificMask=null},{signal,onProgress}={}){
   alive(signal);requireValue(!busy,'GPU evaluator busy');const n=side*side;
   requireValue(Number.isSafeInteger(side)&&side>=2&&Number.isSafeInteger(n)&&[36,96].includes(channels)&&Number.isSafeInteger(candidates)&&candidates>=1&&candidates<=13&&Number.isSafeInteger(referenceThreads)&&referenceThreads>=1&&referenceThreads<=32,'GPU evaluator dimensions');
   requireValue(features instanceof Uint16Array&&features.length===channels*n&&offsetX instanceof Float32Array&&offsetY instanceof Float32Array&&offsetX.length===candidates*n&&offsetY.length===candidates*n,'Native CHW descriptors and complete candidate fields required');
   requireValue(scientificMask===null||scientificMask instanceof Uint8Array&&scientificMask.length===n&&scientificMask.every(v=>v===0||v===1),'Native scientific mask extent');busy=true;activeDone=new Promise(resolve=>{finishActive=resolve;});let outputOwnership,output,stamp=performance.now();
   try{
    const publication=await validateD2prlDescriptor(features,{signal});stats.descriptorValidationElements+=publication.elementsScanned;alive(signal);
    // The existing PatchMatch workspace finances the returned complete fields;
    // this separate reservation covers their construction while old fields live.
    outputOwnership=budget.reserve(8*n);output={x:new Float32Array(n),y:new Float32Array(n)};
    for(let begin=0;begin<n;begin+=tileSize){
     alive(signal);if(publication.lease)requireValue(getD2prlDescriptorLease(features)===publication.lease,'Descriptor publication changed');const end=Math.min(n,begin+tileSize),count=end-begin,owned=[];let computed;
     const allocate=(Type,length,label)=>{const value=allocateOwnedTypedArray(Type,length,{budget,owner:'d2prl',label});owned.push(value);return value.data;};
     try{
      const x=allocate(Float32Array,candidates*count,'gpu-candidate-x'),y=allocate(Float32Array,candidates*count,'gpu-candidate-y'),valid=scientificMask?allocate(Uint8Array,candidates*count,'gpu-candidate-membership'):undefined;
      for(let k=0;k<candidates;k++){x.set(offsetX.subarray(k*n+begin,k*n+end),k*count);y.set(offsetY.subarray(k*n+begin,k*n+end),k*count);}
      for(let at=0;at<count;at++){
       let accepted=0;const index=begin+at;
       for(let k=0;k<candidates;k++){const p=k*count+at;requireValue(Number.isFinite(x[p])&&Number.isFinite(y[p]),'Nonfinite candidate offset');if(valid){valid[p]=scientificTargetAllowed(scientificMask,side,index,x[p],y[p])?1:0;accepted+=valid[p];if(scientificMask[index]&&!valid[p])stats.scientificMatching.rejectedCandidates++;}}
       if(valid){if(!scientificMask[index])stats.scientificMatching.rejectedSources++;else if(accepted)stats.scientificMatching.evaluatedSources++;else stats.scientificMatching.unmatchedSources++;}
       if((at&8191)===0){alive(signal);if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}}
      }
      computed=await kernel.evaluate({source:features,cacheSource:!!publication.lease,sourceIdentity:publication.lease,side,channels,candidates,begin,end,offsetX:x,offsetY:y,...(valid?{valid}:{}),referenceThreads,layout:'CHW-uint16'},{signal});alive(signal);
      requireValue(computed.x instanceof Float32Array&&computed.y instanceof Float32Array&&computed.x.length===count&&computed.y.length===count,'GPU tile result extent');
      output.x.set(computed.x,begin);output.y.set(computed.y,begin);
      if(valid)for(let at=0;at<count;at++){
       const index=begin+at;let kept=false;for(let k=0;k<candidates;k++)if(valid[k*count+at]){kept=true;break;}
       if(!kept){output.x[index]=0;output.y[index]=0;continue;}
       if(!scientificTargetAllowed(scientificMask,side,index,output.x[index],output.y[index])){let chosen=-1,best=Infinity;for(let k=0;k<candidates;k++){const p=k*count+at;if(!valid[p])continue;const dx=x[p]-output.x[index],dy=y[p]-output.y[index],distance=dx*dx+dy*dy;if(distance<best){best=distance;chosen=p;}}requireValue(chosen>=0,'Missing surviving native candidate');output.x[index]=x[chosen];output.y[index]=y[chosen];stats.scientificMatching.projectedOutputs++;}
      }
      stats.tiles++;stats.packedPixels+=count;onProgress?.(end/n);alive(signal);
     }finally{try{await computed?.release?.();}finally{for(const value of owned)value.release();}}
    }
    if(publication.lease)requireValue(getD2prlDescriptorLease(features)===publication.lease,'Descriptor publication changed');alive(signal);stats.evaluations++;return output;
   }finally{outputOwnership?.();busy=false;finishActive();finishActive=null;}
  },
  dispose(){if(retirement)return retirement;disposed=true;return retirement=activeDone.then(()=>kernel.dispose());}
 };
}
