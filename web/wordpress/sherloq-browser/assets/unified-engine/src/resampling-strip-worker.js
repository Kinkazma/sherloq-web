import "../../runtime-context.js?v=0.14.5";
import {serializeEngineError} from './errors.js';
import {resamplingStreamMath} from './resampling-stream-math.js';
self.onmessage=async({data})=>{try{const math=await resamplingStreamMath();let values;if(data.op==='axis')values=math.axis(data.values,data.length,data.lines,data.real);else if(data.op==='pyrup')values=math.pyrup(data.values,data.width,data.height);else throw Error('Unknown resampling strip operation');self.postMessage({result:{values}},[values.buffer]);}catch(error){self.postMessage({error:serializeEngineError(error,'WORKER_FAILED')});}};
