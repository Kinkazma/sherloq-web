import {serializeEngineError} from './errors.js';
import {createSsimBand} from './comparison-ssim-band.js';let kernel;
self.onmessage=async({data})=>{try{kernel??=await createSsimBand();const result=kernel.run(data);self.postMessage({result},[result.values.buffer]);}catch(e){self.postMessage({error:serializeEngineError(e,'WORKER_FAILED')});}};
