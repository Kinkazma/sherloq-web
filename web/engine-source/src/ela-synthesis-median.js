import {requireValue,checkAbort,createCooperator} from './errors.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {createElaSynthesisSimdWorkspace} from './ela-synthesis-median-kernel.js';

// In-place selection over one channel's small byte vector. For an even count,
// selecting the upper middle partitions the lower half; its maximum is the
// lower middle. Truncation exactly matches np.median(...).astype(np.uint8).
export function elaSynthesisMedianByte(values){
 requireValue(values instanceof Uint8Array&&values.length>0,'A nonempty byte vector is required.');
 const k=values.length>>1;let left=0,right=values.length-1;
 while(left<right){const pivot=values[(left+right)>>1];let i=left,j=right;while(i<=j){while(values[i]<pivot)i++;while(values[j]>pivot)j--;if(i<=j){const v=values[i];values[i++]=values[j];values[j--]=v;}}if(k<=j)right=j;else if(k>=i)left=i;else break;}
 const upper=values[k];if(values.length&1)return upper;let lower=0;for(let i=0;i<k;i++)if(values[i]>lower)lower=values[i];return(lower+upper)>>>1;
}
export async function reduceElaSynthesisBlock(matrix,output,values,{signal,workspace}={}){
 requireValue(matrix instanceof Uint8Array&&output instanceof Uint8Array&&values instanceof Uint8Array&&values.length>0&&matrix.length===output.length*values.length,'Complete frame-major byte blocks are required.');
 if(workspace?.backend==='wasm-simd16')return workspace.reduce(matrix,output,values,{signal});
 checkAbort(signal);if(values.length===1){output.set(matrix);checkAbort(signal);return output;}
 const cooperate=createCooperator(signal);for(let i=0;i<output.length;i++){if((i&1023)===0){await cooperate();checkAbort(signal);}for(let q=0;q<values.length;q++)values[q]=matrix[q*output.length+i];output[i]=elaSynthesisMedianByte(values);}checkAbort(signal);return output;
}

// One owner per reduction phase, not one Wasm heap per block. A low-memory or
// non-SIMD environment retains the previous exact bounded JS implementation.
export async function createElaSynthesisMedianWorkspace({count,frameBytes,maximumWorkingBytes,budget,signal,fetcher}={}){
 const simd=await createElaSynthesisSimdWorkspace({count,frameBytes,maximumWorkingBytes,budget,signal,fetcher});if(simd.backend)return simd;
 checkAbort(signal);const blockBytes=Math.min(frameBytes,196608,Math.floor((maximumWorkingBytes-count)/(count+1)/3)*3);requireValue(blockBytes>=3,'Synthesis reduction cannot admit one RGB pixel.');
 let matrix,output,values,closed=false;
 try{
  matrix=allocateOwnedTypedArray(Uint8Array,count*blockBytes,{budget,owner:'ela-synthesis',label:'median-native-blocks'});
  output=allocateOwnedTypedArray(Uint8Array,blockBytes,{budget,owner:'ela-synthesis',label:'median-output-block'});
  values=allocateOwnedTypedArray(Uint8Array,count,{budget,owner:'ela-synthesis',label:'median-channel-vector'});
 }catch(error){values?.release();output?.release();matrix?.release();throw error;}
 return{blockBytes,workingBytes:(count+1)*blockBytes+count,backend:'javascript-exact',fallbackReason:simd.unavailable,get matrix(){return matrix?.data;},get output(){return output?.data;},get values(){return values?.data;},dispose(){if(closed)return;closed=true;values.release();output.release();matrix.release();values=output=matrix=null;}};
}
