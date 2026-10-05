import {serializeEngineError} from './errors.js';
import {plotsStreamMath} from './plots-stream-math.js';
self.onmessage=async({data})=>{try{const result=(await plotsStreamMath()).run(data);self.postMessage({result},[result.values.buffer]);}catch(e){self.postMessage({error:serializeEngineError(e,'WORKER_FAILED')});}};
