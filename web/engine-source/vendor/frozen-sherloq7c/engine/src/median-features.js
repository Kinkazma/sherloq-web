import {nativeModuleFailure,copyTypedArray,wasmAllocationFailure} from './allocation.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
let ready,pending;
export async function initMedianWasm({wasmBinary}={}){
 const {default:create}=await import('../vendor/median/median.js');pending=create(wasmBinary?{wasmBinary}:{});
 try{ready=await pending;return ready;}catch(error){pending=null;throw error;}
}
async function moduleInstance(){try{return ready??(pending?await pending:await initMedianWasm());}catch(cause){pending=null;throw nativeModuleFailure(cause,'Local median-feature module could not load.');}}
export const medianHeapBytes=()=>ready?.HEAPU8.buffer.byteLength??0;
export const MEDIAN_HEAP_LIMIT=16*1024**2;
export const MEDIAN_FORMATS=Object.freeze({8:Object.freeze([1,1]),24:Object.freeze([3,1]),96:Object.freeze([3,4]),128:Object.freeze([4,4])});
export async function medianBlockFeatures(gray,featureCount,{signal,fast=true}={}){
 requireValue(gray instanceof Uint8Array&&gray.length===4096&&Object.hasOwn(MEDIAN_FORMATS,featureCount),'Median features require an exact64×64 gray8 block and supported feature count.');
 await controlCheckpoint(signal);const m=await moduleInstance();checkAbort(signal);let source=0,result=0;
 try{
  source=m._malloc(4096);result=m._malloc(featureCount*8);if(!source||!result)throw wasmAllocationFailure(m,'Median feature staging allocation failed.',undefined);m.HEAPU8.set(gray,source);
  const [windows,levels]=MEDIAN_FORMATS[featureCount];if(!m._median_features(source,windows,levels,result,Number(fast)))throw new EngineError('NUMERIC_RANGE','Median feature extraction failed.');checkAbort(signal);
  let sum=0,squares=0;for(const x of gray){sum+=x;squares+=x*x;}const mean=sum/4096,variance=squares/4096-mean*mean;
  return {features:copyTypedArray(m.HEAPF64.subarray(result/8,result/8+featureCount),{label:'median-features-output'}),variance};
 }finally{if(source)m._free(source);if(result)m._free(result);}
}
