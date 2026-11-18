import "../../runtime-context.js?v=0.33.3";
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
 const rgb=a=>requireValue((a instanceof Uint8Array||a instanceof Uint16Array)&&a.length%3===0&&a.length<=3*262144,'Invalid PCA pixel block.');
 return {
  mean(bytes,sums){rgb(bytes);return call([bytes,sums],24,([src,sum],out)=>{(bytes instanceof Uint16Array?m._pca_stream_mean16:m._pca_stream_mean)(src,bytes.length/3,sum);m.HEAPU8.copyWithin(out,sum,sum+24);},Float64Array);},
  covariance(bytes,mean,cov){rgb(bytes);return call([bytes,mean,cov],72,([src,mu,c],out)=>{(bytes instanceof Uint16Array?m._pca_stream_cov16:m._pca_stream_cov)(src,bytes.length/3,mu,c);m.HEAPU8.copyWithin(out,c,c+72);},Float64Array);},
  covarianceRange(bytes,mean,cov,first,last){rgb(bytes);requireValue(Number.isInteger(first)&&Number.isInteger(last)&&first>=0&&last<=6&&first<last,'Invalid covariance entry range.');return call([bytes,mean,cov],72,([src,mu,c],out)=>{(bytes instanceof Uint16Array?m._pca_stream_cov_range16:m._pca_stream_cov_range)(src,bytes.length/3,mu,c,first,last);m.HEAPU8.copyWithin(out,c,c+72);},Float64Array);},
  finish(mean,cov,total){return call([mean,cov],120,([mu,c],out)=>m._pca_stream_finish(mu,c,total,out),Float64Array);},
  project(bytes,basis,component,mode){rgb(bytes);const channels=mode===2?3:1;return call([bytes,basis],bytes.length/3*channels*8,([src,model],out)=>(bytes instanceof Uint16Array?m._pca_stream_project16:m._pca_stream_project)(src,bytes.length/3,model,component,mode,out),Float64Array);},
  projector(basis,component,{inputDepth=8}={}){
   requireValue(inputDepth===8||inputDepth===16,'Invalid PCA projector input depth.');
   requireValue(basis instanceof Float64Array&&basis.length===15&&Number.isInteger(component)&&component>=0&&component<3,'Invalid cached PCA projector.');
   const pointers=[],entries=131072,keyBytes=inputDepth===16?8:4;let hits=0,misses=0,closed=false;
   const alloc=n=>{const p=m._malloc(n);if(!p)throw wasmAllocationFailure(m,'PCA projector cache allocation failed.',n);pointers.push(p);return p;};
   try{
    const model=alloc(120),keys=alloc(entries*keyBytes),values=alloc(entries*8),stats=alloc(8);m.HEAPU8.set(new Uint8Array(basis.buffer,basis.byteOffset,120),model);m.HEAPU8.fill(0,keys,keys+entries*keyBytes);
    return {project(bytes){requireValue(!closed,'PCA projector is closed.');rgb(bytes);requireValue((bytes instanceof Uint16Array?16:8)===inputDepth,'PCA cached projector type changed.');const out=call([bytes],bytes.length/3*8,([src],out)=>(inputDepth===16?m._pca_stream_project_cached16:m._pca_stream_project_cached)(src,bytes.length/3,model,component,keys,values,stats,out),Float64Array);const counters=new Uint32Array(m.HEAPU8.buffer,stats,2);hits+=counters[0];misses+=counters[1];return out;},get metrics(){return {entries,hits,misses,bytes:entries*(keyBytes+8)+128,...(inputDepth===16?{inputDepth:16,keyBits:48}:{})};},dispose(){if(closed)return;closed=true;for(const p of pointers)m._free(p);}};
   }catch(error){for(const p of pointers)m._free(p);throw error;}
  },
  normalize(raw,channels,limits,total,invert,{outputDepth=8}={}){requireValue(outputDepth===8||outputDepth===16,'Invalid PCA output depth.');const Type=outputDepth===16?Uint16Array:Uint8Array;return call([raw,limits],raw.length/channels*3*Type.BYTES_PER_ELEMENT,([src,range],out)=>(outputDepth===16?m._pca_stream_normalize16:m._pca_stream_normalize)(src,raw.length/channels,channels,range,total,+invert,out),Type);},
  lut(histogram,total,{outputDepth=8}={}){requireValue(outputDepth===8||outputDepth===16,'Invalid PCA LUT depth.');const Type=outputDepth===16?Uint16Array:Uint8Array,count=3*(outputDepth===16?65536:256);if(outputDepth===16)requireValue(histogram instanceof Float64Array&&histogram.length===count,'Complete16-bit PCA histogram required.');return call([histogram],count*Type.BYTES_PER_ELEMENT,([hist],out)=>(outputDepth===16?m._pca_stream_lut16:m._pca_stream_lut)(hist,total,out),Type);},
 };
}
