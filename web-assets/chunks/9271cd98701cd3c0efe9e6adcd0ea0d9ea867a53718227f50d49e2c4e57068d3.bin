import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
let ready,pending;
export const QUALITY_HEAP_LIMIT=128*1024;
export const qualityHeapBytes=()=>ready?.HEAPU8.buffer.byteLength??0;
export async function initQualityArithmetic({wasmBinary}={}){
 const {default:create}=await import('../vendor/quality/quality.js');pending=create(wasmBinary?{wasmBinary}:{});
 try{ready=await pending;return ready;}catch(error){pending=null;throw error;}
}
export async function normalizeQualityCurve(values,{signal}={}){
 requireValue(values instanceof Float64Array&&values.length===100,'Quality normalization requires exactly100 binary64 samples.');await controlCheckpoint(signal);let m;
 try{m=ready??(pending?await pending:await initQualityArithmetic());}catch{throw new EngineError('CODEC_UNAVAILABLE','Local quality arithmetic module could not load.');}checkAbort(signal);let source=0,result=0;
 try{
  source=m._malloc(800);result=m._malloc(800);if(!source||!result)throw new EngineError('MEMORY_LIMIT','Quality arithmetic staging allocation failed.');m.HEAPF64.set(values,source/8);
  if(!m._quality_normalize(source,result,100))throw new EngineError('NUMERIC_RANGE','Non-finite quality curve.');checkAbort(signal);return m.HEAPF64.slice(result/8,result/8+100);
 }finally{if(source)m._free(source);if(result)m._free(result);}
}
