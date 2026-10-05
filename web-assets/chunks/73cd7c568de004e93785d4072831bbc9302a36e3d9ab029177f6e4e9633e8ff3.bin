import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue} from './errors.js';
let pending,ready;
export const noisesnifferStreamHeapBytes=()=>ready?.HEAPU8.byteLength??0;
export async function noisesnifferStreamMath(){
 pending??=import('../vendor/noisesniffer-stream/noisesniffer-stream.js').then(({default:create})=>create()).then(m=>ready=m).catch(e=>{pending=null;throw e;});const m=await pending;
 const run=(rgb,fn)=>{let p=0;try{p=m._malloc(Math.max(1,rgb.byteLength));if(!p)throw new EngineError('MEMORY_LIMIT','Noisesniffer strip allocation failed.');m.HEAPU8.set(rgb,p);return fn(p);}finally{m._noisesniffer_stream_release();if(p)m._free(p);}};
 const means=n=>{const p=m._noisesniffer_stream_means()/8;return m.HEAPF64.slice(p,p+n);};
 return {optimal:n=>m._noisesniffer_stream_optimal(n),tail:(K,N,w,p)=>m._cv_noisesniffer_log_tail(K,N,w,p),
  blocks(rgb,width,height,w,extrema){requireValue(rgb instanceof Uint8Array&&rgb.length===width*height*3&&[3,5,7,8].includes(w)&&width>=w&&height>=w&&extrema.length===6,'Invalid Noisesniffer statistics strip.');return run(rgb,p=>{const q=m._malloc(24);if(!q)throw new EngineError('MEMORY_LIMIT','Noisesniffer extrema allocation failed.');try{m.HEAP32.set(extrema,q/4);if(!m._noisesniffer_stream_blocks(p,width,height,w,q))throw new EngineError('NUMERIC_RANGE','Noisesniffer statistics strip failed.');const n=(width-w+1)*(height-w+1),v=m._noisesniffer_stream_valid(),a=m._noisesniffer_stream_variance()/4;return {valid:m.HEAPU8.slice(v,v+n),means:w===8?null:means(n*3),variance:m.HEAPF32.slice(a,a+n*3)};}finally{m._free(q);}});},
  mean8(rgb,width,height,dftWidth,dftHeight,blockHeight){requireValue(rgb instanceof Uint8Array&&rgb.length===(width+7)*(height+7)*3,'Invalid Noisesniffer global FFT tile.');return run(rgb,p=>{if(!m._noisesniffer_stream_mean8(p,width,height,dftWidth,dftHeight,blockHeight))throw new EngineError('NUMERIC_RANGE','Noisesniffer global FFT tile failed.');return {means:means(width*height*3)};});}
 };
}
