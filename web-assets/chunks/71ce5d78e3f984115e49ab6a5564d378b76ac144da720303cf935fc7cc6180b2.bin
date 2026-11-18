import "../../runtime-context.js?v=0.33.3";
import {requireValue,checkAbort} from './errors.js';
import {SEPARATION_HEAP_BYTES,native16AdjustRows,separationRuntimeState,native16AdjustWorkspace} from './separation-math.js';
import {createSeparationGpu,separationGpuLayout,separationGpuColdAdmission,native16ProgramDescriptor} from './separation-filter-gpu.js';
import {NATIVE16_ADJUST_LUT_PROGRAM} from './native16-adjust-lut-gpu.js';
import {separationGpuSequenceAdmission} from './separation-gpu-session.js';
import {createGpuAttemptArray,gpuRetirementFailure} from './gpu-attempt-retirement.js';

export function native16AdjustPrefixParams(p={}){
 const out={brightness:p.brightness??0,saturation:p.saturation??0,hue:p.hue??0,sharpen:p.sharpen??0};
 requireValue(Number.isInteger(out.brightness)&&out.brightness>=-255&&out.brightness<=255&&Number.isInteger(out.saturation)&&out.saturation>=-255&&out.saturation<=255&&Number.isInteger(out.hue)&&out.hue>=0&&out.hue<=180&&Number.isInteger(out.sharpen)&&out.sharpen>=0&&out.sharpen<=100,'Invalid native16 adjustment prefix parameters.');return out;
}
export function native16AdjustPrefixPlan(width,height,rows,input={},{gpu=false,target=false}={}){
 const p=native16AdjustPrefixParams(input);requireValue([width,height,rows].every(Number.isSafeInteger)&&width>0&&height>0&&rows>0&&rows<=height,'Invalid native16 adjustment prefix plan.');
 const n=width*height,m=width*rows,radius=Math.floor(p.sharpen/4),sourceBytes=n*6,outputBytes=m*6,workspaceBytes=native16AdjustWorkspace(width,height,rows,p);
 requireValue([n,m,sourceBytes,outputBytes,workspaceBytes].every(Number.isSafeInteger),'Unsafe native16 adjustment prefix plan.');
 const identity=radius===0&&!p.brightness&&!p.saturation&&!p.hue;
 return{halo:radius,hsv:!!(p.brightness||p.saturation||p.hue),identity,sourceBytes,outputBytes,ownedOutputBytes:target?0:outputBytes,wasmHeapBytes:identity?0:SEPARATION_HEAP_BYTES,wasmWorkspaceBytes:identity?0:workspaceBytes,wasmFits:identity||workspaceBytes<=SEPARATION_HEAP_BYTES,wasmStagingBytes:identity?0:sourceBytes+outputBytes+(gpu&&radius?outputBytes:0),gpu:gpu&&radius?separationGpuLayout(width,height,rows,{mode:1,radius,grayscale:false},{sampleDepth:16}):null};
}
const overlap=(a,b)=>a.buffer===b.buffer&&a.byteOffset<b.byteOffset+b.byteLength&&b.byteOffset<a.byteOffset+a.byteLength;
// The same arithmetic actor serves every source format, image size and radius.
// Its64MiB resident charge belongs to the producer/pool, as for separationRows.
export async function adjustNative16PrefixRows(image,input,start,rows,hooks={}){
 const p=native16AdjustPrefixParams(input),{budget,signal,target,gpu,nativeOriginX=0,nativeWidth=image.width}=hooks,plan=native16AdjustPrefixPlan(image.width,image.height,rows,p,{gpu:!!gpu,target:!!target});
 requireValue(image.data instanceof Uint16Array&&image.data.length===image.width*image.height*3&&Number.isSafeInteger(start)&&start>=0&&start+rows<=image.height,'Invalid native16 adjustment input.');
 if(target)requireValue(target instanceof Uint16Array&&target.length===image.width*rows*3&&!overlap(target,image.data),'Native16 prefix target must be separately owned.');else requireValue(budget?.reserve,'Native16 prefix output requires its shared budget.');
 checkAbort(signal);let owned,filtered,complete=false,retiring,retireRefused=false,usedGpu=false;
 const retire=async()=>{if(retiring)return retiring;const task=(async()=>{if(filtered){const ack=await filtered.release();if(ack===false||ack===0)throw ack;filtered=null;}if(!complete&&owned){owned.release();owned=null;}})();retiring=task;try{return await task;}finally{if(retiring===task)retiring=null;}};
 try{
  if(!target){owned=createGpuAttemptArray(Uint16Array,plan.outputBytes/2,{budget,owner:'adjust',label:'native16-adjust-prefix'});owned.allocate();}
  const data=target??owned.data;
  if(plan.identity){data.set(image.data.subarray(start*image.width*3,(start+rows)*image.width*3));}
  else{
   if(gpu&&plan.halo){filtered=await gpu.run(image,{mode:1,radius:plan.halo,sigma:1,grayscale:false},start,rows,hooks);usedGpu=!!filtered;}
   await native16AdjustRows(image,p,start,rows,{signal,target:data,blurred:filtered?.bytes,nativeOriginX,nativeWidth});
  }
  complete=true;try{await retire();}catch(error){retireRefused=true;throw error;}checkAbort(signal);
  return{data,release(){if(owned){owned.release();owned=null;}},metrics:{inputDepth:16,prefixBackend:usedGpu?'webgpu-gaussian+cpu-hsv':'cpu-native16',hsv:plan.hsv,halo:plan.halo}};
 }catch(error){complete=false;if(retireRefused)throw gpuRetirementFailure(error,{dispose:retire},error);try{await retire();}catch(cleanup){throw gpuRetirementFailure(error,{dispose:retire},cleanup);}throw error;}
}
export const native16AdjustPrefixRuntimeState=separationRuntimeState;
export const createNative16AdjustPrefixGpu=options=>createSeparationGpu({...options,sampleDepth:16,native16GaussianRadius:25});
export function native16AdjustPrefixGpuColdAdmission(width,height,rows,p){const radius=Math.floor(native16AdjustPrefixParams(p).sharpen/4);return radius?separationGpuColdAdmission(width,height,rows,{mode:1,radius,grayscale:false},{sampleDepth:16}):{known:true,state:'cold',available:true,missingResidentBytes:0,hostBytes:0};}

export function native16AdjustProgramGpuColdAdmission(width,height,rows,program=NATIVE16_ADJUST_LUT_PROGRAM){native16ProgramDescriptor(program);return separationGpuColdAdmission(width,height,rows,{mode:2,radius:1,grayscale:false,nativeProgram:true},{sampleDepth:16,nativeProgram:program});}

export function native16AdjustGpuAdmission(width,windowHeight,rows,input={},options={}){
 requireValue([width,windowHeight,rows].every(Number.isSafeInteger)&&width>0&&windowHeight>0&&rows>0&&rows<=windowHeight,'Invalid native16 adjustment GPU window.');
 const radius=Math.floor(native16AdjustPrefixParams(input).sharpen/4),requests=[];
 if(options.perceptualDomain)requests.push({width,height:windowHeight,rows:windowHeight,params:{mode:2,radius:1,grayscale:false,nativeProgram:true},nativeProgram:NATIVE16_ADJUST_LUT_PROGRAM});
 if(radius)requests.push({width,height:windowHeight,rows,params:{mode:1,radius,sigma:1,grayscale:false}});
 requests.push({width,height:rows,rows,params:{mode:2,radius:1,grayscale:false,nativeProgram:true},nativeProgram:NATIVE16_ADJUST_LUT_PROGRAM});
 if(options.nativeEqualizationProgram)requests.push({width,height:rows,rows,params:{mode:2,radius:1,grayscale:false,nativeProgram:true},nativeProgram:options.nativeEqualizationProgram});
 const {nativeEqualizationProgram,perceptualDomain,...admissionOptions}=options;
 return separationGpuSequenceAdmission(requests,admissionOptions);
}
