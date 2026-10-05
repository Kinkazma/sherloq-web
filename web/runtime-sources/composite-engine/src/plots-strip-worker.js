import {plotsStreamMath} from './plots-stream-math.js';
self.onmessage=async({data})=>{try{const result=(await plotsStreamMath()).run(data);self.postMessage({result},[result.values.buffer]);}catch(e){self.postMessage({error:{code:e.code??'WORKER_FAILED',message:e.message}});}};
