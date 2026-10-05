import "../../runtime-context.js?v=0.14.5";
import {createResamplingEmMath} from './resampling-em-math.js';
let ready;
self.onmessage=async({data:j})=>{try{const math=await(ready??=createResamplingEmMath());let result={};if(j.op==='create')math.create(j.width,j.height,j.size);else if(j.op==='batch')result={weights:math.batch(j.gray,j.first,j.count,j.top,j.weights)};else if(j.op==='finish')result=math.finish();else throw Error('Unknown EM stage.');self.postMessage({result},result.weights?[result.weights.buffer]:[]);}catch(error){self.postMessage({error:{code:error.code??'WORKER_FAILED',message:error.message}});}};
