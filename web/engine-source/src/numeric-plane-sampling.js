import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {retireCompositeOwners} from './composite-owner-release.js';

export const NUMERIC_SAMPLE_MAX_POINTS=8*1024**2;
export const NUMERIC_SAMPLE_MAX_SIDE=4096;
const MAX_ELEMENTS=262144;
const coordinate=(i,source,target,centers,step)=>centers?Math.min(source-1,Math.floor((i+.5)*source/target)):i*step;
export function unsupportedNumericSampling(message,reason){return new EngineError('UNSUPPORTED_LAYOUT',message,{details:{samplePlane:{phase:'validation',fallbackSafe:true,reason}}});}
export function markNumericSamplingAdmission(error){if(error?.code==='MEMORY_LIMIT'&&typeof error==='object'&&Object.isExtensible(error))try{error.details={...error.details,samplePlane:{phase:'admission',fallbackSafe:true}};}catch{}return error;}

// Pure admission geometry shared with the optional UI caller. Coordinates are
// the existing UI sampling formula, in this numeric store's local native grid.
export function numericPlaneSamplePlan(descriptor,{sourceWidth,sourceHeight,width,height,centers=false,step}={}){
 requireValue([sourceWidth,sourceHeight,width,height].every(v=>Number.isSafeInteger(v)&&v>0)&&typeof centers==='boolean','Invalid numeric sampling dimensions.');
 if(!['float32','int32'].includes(descriptor?.format))throw unsupportedNumericSampling('This numeric format has no direct sampled-plane reader.','format');
 if(sourceWidth!==descriptor.width||sourceHeight!==descriptor.height)throw unsupportedNumericSampling('The declared sampling grid differs from the numeric store.','source-dimensions');
 requireValue(width<=NUMERIC_SAMPLE_MAX_SIDE&&height<=NUMERIC_SAMPLE_MAX_SIDE&&Number.isSafeInteger(sourceWidth*sourceHeight*4),'The numeric sampling dimensions exceed exact bounds.');
 if(width*height>NUMERIC_SAMPLE_MAX_POINTS)throw unsupportedNumericSampling('The sampled plane exceeds the optional direct-reader output bound.','output-bound');
 requireValue(centers||Number.isSafeInteger(step)&&step>0,'An exact positive numeric sampling step is required.');
 const at=i=>coordinate(i,sourceWidth,width,centers,step),lastX=at(width-1),lastY=coordinate(height-1,sourceHeight,height,centers,step);
 requireValue(Number.isSafeInteger(lastX)&&lastX>=0&&lastX<sourceWidth&&Number.isSafeInteger(lastY)&&lastY>=0&&lastY<sourceHeight,'The sampled plane includes a point outside its native grid.');
 let scratchElements=0;for(let start=0;start<width;){const x0=at(start);let end=start+1;while(end<width&&at(end)-x0<MAX_ELEMENTS)end++;scratchElements=Math.max(scratchElements,at(end-1)-x0+1);start=end;}
 const outputPixels=width*height,outputBytes=outputPixels*4,scratchBytes=scratchElements*4,coordinateBytes=width*8,requiredBytes=outputBytes+scratchBytes+coordinateBytes;
 requireValue(Number.isSafeInteger(requiredBytes),'Numeric sampling admission is outside exact byte bounds.');
 return Object.freeze({width,height,sourceWidth,sourceHeight,format:descriptor.format,centers,step,outputPixels,outputBytes,scratchBytes,coordinateBytes,requiredBytes});
}

export async function sampleStoredNumericPlane(store,descriptor,request,{budget,signal,alive=()=>{},workspace}={}){
 if(workspace)requireValue(typeof workspace.allocate==='function'&&typeof workspace.check==='function','A Core-owned numeric workspace allocator is required.');
 const current=()=>{alive();workspace?.check();};checkAbort(signal);current();const plan=numericPlaneSamplePlan(descriptor,request);
 if(typeof store?.readInto!=='function')throw unsupportedNumericSampling('The numeric store has no direct read interface.','store');
 const Type=plan.format==='float32'?Float32Array:Int32Array;let reservation,output,scratch,xs;
 if(!workspace)try{reservation=budget.reserve(plan.requiredBytes);}catch(error){throw markNumericSamplingAdmission(error);}
 try{
  // Split the real combined reservation: every buffer is admitted before any
  // allocation or I/O, with no duplicate credit and no unfunded coordinates.
  const covered=bytes=>reservation.split(bytes),allocate=(Type,length,label)=>{
   if(!workspace)return allocateOwnedTypedArray(Type,length,{budget,reserve:covered,label});
   // The external frame already finances this storage and owns its lifetime.
   // Do not report a fictitious backing retirement when Core hands it back.
   const owned={data:workspace.allocate(Type,length,label),release(){owned.data=null;}};return owned;
  };
  output=allocate(Type,plan.outputPixels,'sampled-numeric-plane');
  scratch=allocate(Uint32Array,plan.scratchBytes/4,'sampled-numeric-row');
  xs=allocate(Float64Array,plan.width,'sampled-numeric-columns');
  for(let x=0;x<plan.width;x++)xs.data[x]=coordinate(x,plan.sourceWidth,plan.width,plan.centers,plan.step);
  const words=new Uint32Array(output.data.buffer,output.data.byteOffset,output.data.length),row=scratch.data,cooperate=createCooperator(signal);let sourceBytes=0,readCalls=0;
  for(let start=0;start<plan.width;){const x0=xs.data[start];let end=start+1;while(end<plan.width&&xs.data[end]-x0<MAX_ELEMENTS)end++;const span=xs.data[end-1]-x0+1,bytes=new Uint8Array(row.buffer,row.byteOffset,span*4);let previousY=-1;
   for(let y=0;y<plan.height;y++){
    await cooperate();current();checkAbort(signal);const sy=coordinate(y,plan.sourceHeight,plan.height,plan.centers,plan.step);
    if(sy!==previousY){const read=store.readInto(bytes,(sy*plan.sourceWidth+x0)*4,{signal});if(read?.then)await read;current();checkAbort(signal);sourceBytes+=bytes.byteLength;readCalls++;previousY=sy;}
    const to=y*plan.width;for(let x=start;x<end;x++)words[to+x]=row[xs.data[x]-x0];
   }start=end;
  }
  current();checkAbort(signal);const pixels={width:plan.width,height:plan.height,format:plan.format,data:output.data},release=output.release;
  await retireCompositeOwners([()=>scratch.release(),()=>xs.release(),()=>reservation?.()]);
  return {pixels,release,metrics:{sourceBytes,readCalls,outboundBytes:plan.outputBytes,workingBytes:plan.requiredBytes,scratchBytes:plan.scratchBytes,coordinateBytes:plan.coordinateBytes,sampling:plan.centers?'native-centers':'native-integer-step'}};
 }catch(error){await retireCompositeOwners([()=>output?.release(),()=>scratch?.release(),()=>xs?.release(),()=>reservation?.()],{primary:error});throw error;}
}
