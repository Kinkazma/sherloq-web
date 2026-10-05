import "../../runtime-context.js?v=0.14.5";
import {serializeEngineError} from './errors.js';
import {adjustStage} from './adjust-stage.js';
self.onmessage=async({data})=>{try{const result=await adjustStage(data),transfer=[result.bytes.buffer];if(result.histogram)transfer.push(result.histogram.buffer);self.postMessage(result,transfer);}catch(error){self.postMessage({error:serializeEngineError(error,'WORKER_FAILED')});}};
