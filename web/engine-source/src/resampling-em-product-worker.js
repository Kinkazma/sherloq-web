import {createResamplingEmGpuMath} from './resampling-em-gpu-math.js';
import {EngineError,serializeEngineError} from './errors.js';
let math;
const methods=new Set(['create','batch','gramCarry','inverse','accept','acceptCpu','finish']);
self.onmessage=async({data:j})=>{
 try{
  if(j.method==='initialize'){math??=await createResamplingEmGpuMath();self.postMessage({id:j.id,heapBytes:math.heapBytes()});return;}
  if(j.method==='dispose'){math?.dispose();self.postMessage({id:j.id,closed:true,heapBytes:math?.heapBytes()??0});self.close();return;}
  if(!math||!methods.has(j.method)||!Array.isArray(j.args))throw new EngineError('INVALID_INPUT','Invalid ordered native EM worker command.');
  const value=math[j.method](...j.args);self.postMessage({id:j.id,value,heapBytes:math.heapBytes()},value instanceof Float64Array?[value.buffer]:[]);
 }catch(error){self.postMessage({id:j.id,error:serializeEngineError(error,'WORKER_FAILED')});}
};
