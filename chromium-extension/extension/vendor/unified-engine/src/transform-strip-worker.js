import "../../runtime-context.js?v=0.16.0";
import {serializeEngineError} from './errors.js';
import {installWorkerMessageProtocol} from './worker-message-protocol.js';

// Every endpoint used by WaveletStripPool settles malformed input and async
// failures through the same structured response, without losing its cause.
export function installTransformStripWorker(run,{target=globalThis.self,label='transform-strip'}={}){
 let protocol;
 protocol=installWorkerMessageProtocol(target,async data=>{
  const result=await run(data),buffers=[...new Set(Object.values(result).filter(ArrayBuffer.isView).map(value=>value.buffer).filter(buffer=>buffer instanceof ArrayBuffer))];
  protocol.post({result},buffers);
 },{label,onFailure:error=>target.postMessage({error:serializeEngineError(error,'WORKER_FAILED')})});
 return protocol;
}
