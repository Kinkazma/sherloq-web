import {copyTypedArray,wasmAllocationFailure} from './allocation.js';
import {EngineError,requireValue} from './errors.js';
import {wavelets} from './wavelets.js';
let ready,pending;
export const waveletStreamHeapBytes=()=>ready?.HEAPU8.buffer.byteLength??0;
export async function waveletStreamMath(){
 if(!pending)pending=import('../vendor/wavelet-stream/wavelet-stream.js').then(({default:create})=>create()).then(m=>ready=m).catch(e=>{pending=null;throw e;});
 const m=await pending;
 const identity=name=>{requireValue(wavelets.includes(name),'Invalid wavelet.');const [,family,order]=/^(db|sym|coif|bior)([\d.]+)$/.exec(name);return [['db','sym','coif','bior'].indexOf(family),Number(order.replace('.',''))];};
 const run=(inputs,fn)=>{const pointers=[];try{for(const a of inputs){const p=m._malloc(a.byteLength);if(!p)throw wasmAllocationFailure(m,'Wavelet strip allocation failed.',a.byteLength);pointers.push(p);m.HEAPF64.set(a,p/8);}if(!fn(...pointers))throw new EngineError('INVALID_INPUT','Wavelet strip transform failed.');const at=m._wavelet_data()/8;return copyTypedArray(m.HEAPF64.subarray(at,at+m._wavelet_size()),{label:'wavelet-stream-math-output'});}finally{m._wavelet_release();for(const p of pointers)m._free(p);}};
 return {
  noise(values,width,height,block){const out=run([values],p=>m._wavelet_noise(p,width,height,block));return {height:out[0],width:out[1],values:out.subarray(2)};},
  normalize(values,lo,hi,total){let input=0,output=0;try{input=m._malloc(values.byteLength);output=m._malloc(values.length);if(!input||!output)throw wasmAllocationFailure(m,'Noise normalization allocation failed.',undefined);m.HEAPF64.set(values,input/8);m._wavelet_stream_normalize(input,values.length,lo,hi,total,output);return copyTypedArray(m.HEAPU8.subarray(output,output+values.length),{label:'wavelet-stream-math-output'});}finally{if(input)m._free(input);if(output)m._free(output);}},
  info(name,width,height){const a=run([],()=>m._wavelet_stream_info(...identity(name),width,height));return {filterLength:a[0],maximumLevel:a[1]};},
  down(values,width,height,name,axis){const a=run([values],p=>m._wavelet_stream_down(p,width,height,...identity(name),axis)),n=a[0]*a[1];return {height:a[0],width:a[1],a:a.subarray(2,2+n),d:a.subarray(4+n)};},
  up(a,d,width,height,name,axis){const out=run([a,d],(ap,dp)=>m._wavelet_stream_up(ap,dp,width,height,...identity(name),axis));return {height:out[0],width:out[1],values:out.subarray(2)};},
  threshold(values,maximum,percent,mode){let p;try{p=m._malloc(values.byteLength);if(!p)throw wasmAllocationFailure(m,'Wavelet threshold allocation failed.',values.byteLength);m.HEAPF64.set(values,p/8);m._wavelet_stream_threshold(p,values.length,maximum,percent,['soft','hard','garrote','greater','less'].indexOf(mode));values.set(m.HEAPF64.subarray(p/8,p/8+values.length));return values;}finally{if(p)m._free(p);}}
 };
}
