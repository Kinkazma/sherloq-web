import "../../runtime-context.js?v=0.14.5";
import {copyTypedArray,wasmAllocationFailure} from './allocation.js';
import {EngineError,requireValue} from './errors.js';
const messages={[-1]:'Invalid EM state or region.',[-2]:'The region is degenerate for this interpolation model.',[-3]:'The region has no valid interpolation weights.',[-4]:'The region is singular for this model. Select a more varied region.',[-5]:'The interpolation model returned non-finite coefficients.',[-6]:'EM workspace allocation failed.'};
export async function createResamplingEmMath(){
 const {default:create}=await import('../vendor/resampling-em/resampling-em.js'),m=await create();let handle=0,shape;
 const status=code=>{if(code<0)throw (code===-6?wasmAllocationFailure(m,messages[code]):new EngineError('NUMERIC_RANGE',messages[code]??'EM computation failed.'));return code;};
 return {heapBytes:()=>m.HEAPU8.byteLength,
  create(width,height,size){requireValue([width,height].every(n=>Number.isSafeInteger(n)&&n>=size&&n<=16384)&&[3,5].includes(size),'Invalid EM dimensions.');if(handle)m._em_stream_destroy(handle);handle=m._em_stream_create(width,height,size);if(!handle)throw wasmAllocationFailure(m,'EM state allocation failed.',undefined);shape={width,height,size,cols:width-size+1,n:(width-size+1)*(height-size+1)};},
  batch(gray,first,count,top,weights=null){requireValue(handle&&gray instanceof Float64Array&&Number.isSafeInteger(first)&&first>=0&&first%8192===0&&count===Math.min(8192,shape.n-first)&&count>0&&top===Math.floor(first/shape.cols)&&gray.length===shape.width*(Math.floor((first+count-1)/shape.cols)-top+shape.size)&&(!weights||weights instanceof Float64Array&&weights.length===count),'Invalid EM neighborhood page.');const p=m._malloc(gray.byteLength),q=weights?m._malloc(weights.byteLength):0;try{if(!p||weights&&!q)throw wasmAllocationFailure(m,'EM page allocation failed.',undefined);m.HEAPF64.set(gray,p/8);if(weights)m.HEAPF64.set(weights,q/8);status(m._em_stream_batch(handle,p,q,first,count,top));if(!weights){const at=m._em_stream_weights(handle)/8;return copyTypedArray(m.HEAPF64.subarray(at,at+count),{label:'resampling-em-math-output'});}return null;}finally{m._free(p);m._free(q);}},
  finish(){return {status:status(m._em_stream_finish(handle)),iterations:m._em_stream_iterations(handle),heapBytes:m.HEAPU8.byteLength};},
  dispose(){if(handle)m._em_stream_destroy(handle);handle=0;}
 };
}
