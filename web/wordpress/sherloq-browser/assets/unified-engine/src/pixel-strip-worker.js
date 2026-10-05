import "../../runtime-context.js?v=0.14.5";
import {serializeEngineError} from './errors.js';
import {pixelStripStage} from './pixel-strip-stage.js';
self.onmessage=async({data})=>{try{const result=await pixelStripStage(data),transfer=[...new Set(Object.values(result).filter(ArrayBuffer.isView).map(v=>v.buffer))];self.postMessage({result},transfer);}catch(e){self.postMessage({error:serializeEngineError(e,'COMPUTE_FAILED')});}};
