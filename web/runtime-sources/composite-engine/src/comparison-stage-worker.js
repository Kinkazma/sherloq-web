import {createComparisonStageKernel} from './comparison-stage-kernel.js';
let kernel;
self.onmessage=async({data})=>{try{kernel??=await createComparisonStageKernel();const result=kernel.call(data);self.postMessage({result},Object.values(result).filter(ArrayBuffer.isView).map(a=>a.buffer));}catch(error){self.postMessage({error:{code:error.code??'WORKER_FAILED',message:error.message}});}};
