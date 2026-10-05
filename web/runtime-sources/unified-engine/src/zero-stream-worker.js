import {serializeEngineError} from './errors.js';
import {createZeroStreamKernel} from './zero-stream.js';
import {Budget} from './cache.js';
let native;
self.onmessage=async({data})=>{try{
 if(data.action==='init'){native=await createZeroStreamKernel(data.plan,{budget:new Budget(data.plan.workingBytes)});self.postMessage({heapBytes:native.heapBytes()});return;}
 const result=native.votes(data.bytes,data.rows),values=result.values.subarray(data.offset,data.offset+data.length).slice();self.postMessage({values,fallbacks:result.fallbacks,heapBytes:native.heapBytes()},[values.buffer]);
 }catch(error){self.postMessage({error:serializeEngineError(error,'WORKER_FAILED')});}};
