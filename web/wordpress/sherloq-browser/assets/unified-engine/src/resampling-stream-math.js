import "../../runtime-context.js?v=0.14.5";
import {copyTypedArray,wasmAllocationFailure} from './allocation.js';
import {EngineError,requireValue} from './errors.js';
let ready,pending;
export const resamplingStreamHeapBytes=()=>ready?.HEAPU8.byteLength??0;
export async function resamplingStreamMath(){
 if(!pending)pending=import('../vendor/resampling-stream/resampling-stream.js').then(({default:create})=>create()).then(m=>ready=m).catch(error=>{pending=null;throw error;});const m=await pending;
 const run=(values,count,fn)=>{requireValue(values instanceof Float64Array,'Binary64 resampling input required.');let src=0,out=0;try{src=m._malloc(values.byteLength);out=m._malloc(count*8);if(!src||!out)throw wasmAllocationFailure(m,'Resampling strip allocation failed.',undefined);m.HEAPF64.set(values,src/8);if(!fn(src,out))throw new EngineError('INVALID_INPUT','Resampling strip failed.');return copyTypedArray(m.HEAPF64.subarray(out/8,out/8+count),{label:'resampling-stream-math-output'});}finally{if(src)m._free(src);if(out)m._free(out);}};
 return {
  axis(values,length,lines,real=false){requireValue(Number.isInteger(length)&&length>0&&length<=16384&&Number.isInteger(lines)&&lines>0&&values.length===length*lines*(real?1:2),'Invalid resampling axes.');return run(values,length*lines*2,(p,q)=>m._resampling_stream_axis(p,q,length,lines,+real));},
  pyrup(values,width,height){requireValue(Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0&&width<=16384&&height<=16384&&values.length===width*height,'Invalid pyrUp strip.');return run(values,values.length*4,(p,q)=>m._resampling_pyrup(p,q,width,height));}
 };
}
