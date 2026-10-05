import "../../runtime-context.js?v=0.14.5";
import {createSsimBand} from './comparison-ssim-band.js';let kernel;
self.onmessage=async({data})=>{try{kernel??=await createSsimBand();const result=kernel.run(data);self.postMessage({result},[result.values.buffer]);}catch(e){self.postMessage({error:{message:e.message,code:e.code??'WORKER_FAILED'}});}};
