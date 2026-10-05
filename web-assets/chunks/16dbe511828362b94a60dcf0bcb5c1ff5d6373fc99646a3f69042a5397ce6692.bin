import "../../runtime-context.js?v=0.14.5";
import {serializeEngineError} from './errors.js';
import {separationStage} from './separation-stage.js';
self.onmessage=async({data})=>{
 try{const result=await separationStage(data.image,data.params,data.start,data.rows),transfer=[result.bytes.buffer];if(result.histograms)transfer.push(result.histograms.buffer);self.postMessage(result,transfer);}
 catch(error){self.postMessage({error:serializeEngineError(error,'WORKER_FAILED')});}
};
