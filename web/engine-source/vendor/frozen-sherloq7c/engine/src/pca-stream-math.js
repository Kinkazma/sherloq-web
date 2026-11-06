import {wasmAllocationFailure} from './allocation.js';
import {EngineError,requireValue} from './errors.js';
let ready,pending;
export const pcaStreamHeapBytes=()=>ready?.HEAPU8.byteLength??0;
export async function pcaStreamMath(){
 pending??=import('../vendor/pca-stream/pca-stream.js').then(({default:create})=>create());
 try{ready=await pending;}catch(error){pending=null;throw error;}const m=ready;
 function call(arrays,outputBytes,run,Type){
  const pointers=[];
  const alloc=n=>{const p=m._malloc(Math.max(1,n));if(!p)throw wasmAllocationFailure(m,'PCA block allocation failed.',Math.max(1,n));pointers.push(p);return p;};
  try{const inputs=arrays.map(a=>{const p=alloc(a.byteLength);m.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);return p;});const out=alloc(outputBytes);run(inputs,out);return new Type(m.HEAPU8.buffer.slice(out,out+outputBytes));}finally{for(const p of pointers)m._free(p);}
 }
 const rgb=a=>requireValue(a instanceof Uint8Array&&a.length%3===0&&a.length<=3*262144,'Invalid PCA pixel block.');
 return {
  mean(bytes,sums){rgb(bytes);return call([bytes,sums],24,([src,sum],out)=>{m._pca_stream_mean(src,bytes.length/3,sum);m.HEAPU8.copyWithin(out,sum,sum+24);},Float64Array);},
  covariance(bytes,mean,cov){rgb(bytes);return call([bytes,mean,cov],72,([src,mu,c],out)=>{m._pca_stream_cov(src,bytes.length/3,mu,c);m.HEAPU8.copyWithin(out,c,c+72);},Float64Array);},
  finish(mean,cov,total){return call([mean,cov],120,([mu,c],out)=>m._pca_stream_finish(mu,c,total,out),Float64Array);},
  project(bytes,basis,component,mode){rgb(bytes);const channels=mode===2?3:1;return call([bytes,basis],bytes.length/3*channels*8,([src,model],out)=>m._pca_stream_project(src,bytes.length/3,model,component,mode,out),Float64Array);},
  normalize(raw,channels,limits,total,invert){return call([raw,limits],raw.length/channels*3,([src,range],out)=>m._pca_stream_normalize(src,raw.length/channels,channels,range,total,+invert,out),Uint8Array);},
  lut(histogram,total){return call([histogram],768,([hist],out)=>m._pca_stream_lut(hist,total,out),Uint8Array);},
 };
}
