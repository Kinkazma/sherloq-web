import {copyTypedArray,wasmAllocationFailure} from './allocation.js';
import {EngineError,requireValue} from './errors.js';
export async function createStereoStream(){
 const {default:create}=await import('../vendor/stereo-stream/stereo-stream.js'),m=await create();
 const input=(values,fn)=>{const p=m._malloc(Math.max(1,values.byteLength));if(!p)throw wasmAllocationFailure(m,'Stereo stream allocation failed.',Math.max(1,values.byteLength));try{m.HEAPU8.set(new Uint8Array(values.buffer,values.byteOffset,values.byteLength),p);return fn(p);}finally{m._free(p);}};
 const checked=v=>{if(!v)throw new EngineError('INVALID_INPUT','Native stereo stage failed.');};
 return {heapBytes:()=>m.HEAPU8.byteLength,
  search(rgb,width,height,outputRows){requireValue(rgb instanceof Uint8Array&&rgb.length===width*height*3,'Invalid stereo RGB strip.');return input(rgb,p=>{checked(m._stereo_stream_search(p,width,height,outputRows));const at=m._stereo_stream_sums()/8,values=copyTypedArray(m.HEAPF64.subarray(at,at+Math.max(0,Math.floor(width/3)-10)),{label:'stereo-stream-kernel-output'});m._stereo_stream_release();return values;});},
  normalize(values,lo,hi,maximum){requireValue(values instanceof Float32Array,'Stereo normalization requires float32.');return input(values,p=>{checked(m._stereo_stream_normalize(p,values.length,lo,hi,maximum));const at=m._stereo_stream_floating()/4,result=copyTypedArray(m.HEAPF32.subarray(at,at+values.length),{label:'stereo-stream-kernel-output'});m._stereo_stream_release();return result;});},
  create(width,height){checked(m._stereo_stream_create(width,height));},
  put(rgb,width,top,rows,offset){return input(rgb,p=>checked(m._stereo_stream_input(p,width,top,rows,offset)));},
  flow(original=false){checked(m._stereo_stream_flow(+original));const p=m._cv_stereo_timings()/8;return {heapBytes:m.HEAPU8.byteLength,timings:Array.from(copyTypedArray(m.HEAPF64.subarray(p,p+5),{label:'stereo-stream-kernel-output'}))};},
  read(offset,count){const p=m._stereo_stream_output()/4;return copyTypedArray(m.HEAPF32.subarray(p+offset,p+offset+count),{label:'stereo-stream-kernel-output'});},
  dispose:()=>m._stereo_stream_release()
 };
}
let pending,ready;
export const stereoStreamHeapBytes=()=>ready?.heapBytes()??0;
export function stereoStreamMath(){return pending??=createStereoStream().then(m=>ready=m).catch(e=>{pending=null;throw e;});}
