import "../../runtime-context.js?v=0.14.5";
import {prnuStreamMath} from './prnu-stream-math.js';
self.onmessage=async({data})=>{try{const math=await prnuStreamMath();let values;
 if(data.op==='axis')values=math.axis(data.values,data.length,data.lines,data.mode,data.factor);
 else if(data.op==='convolution')values=math.axis(math.multiply(math.axis(data.values,data.length,data.lines,1),math.axis(data.kernel,data.length,data.lines,1)),data.length,data.lines,2);
 else throw Error('Unknown PRNU strip operation');self.postMessage({result:{values}},[values.buffer]);
 }catch(error){self.postMessage({error:{code:error.code??'WORKER_FAILED',message:error.message}});}};
