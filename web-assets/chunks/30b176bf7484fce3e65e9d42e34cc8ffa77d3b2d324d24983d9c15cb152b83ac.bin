import "../../runtime-context.js?v=0.30.0";
import {EngineError,requireValue,deserializeEngineError} from './errors.js';
import {installWorkerMessageProtocol,workerMessageFailure} from './worker-message-protocol.js';
/** An idle GPU worker must acknowledge native cleanup before its owner may
 * terminate the context and refund its resident memory. Failure is explicit;
 * no ACK means that native retirement has not been certified. */
export async function retireIdleNeuralWorker(worker,{timeoutMs=5000,retryableAliked=false}={}){
 requireValue(worker&&typeof worker.postMessage==='function'&&typeof worker.terminate==='function'&&Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=60000&&typeof retryableAliked==='boolean','Bounded neural worker retirement required');
 let protocol,timer;try{return await new Promise((resolve,reject)=>{
  protocol=installWorkerMessageProtocol(worker,data=>{if(data.error){if(typeof data.error.code!=='string'||typeof data.error.message!=='string')throw workerMessageFailure('neural-retirement','message','invalid-error');reject(deserializeEngineError(data.error));return;}const receipt=data.cleanupReceipt,gpu=receipt?.gpu??receipt?.nativeGpu;if(data.disposed!==true||receipt?.schema!=='sherloq.neural-worker-cleanup/1'||!Number.isSafeInteger(receipt.reusableInputs)||receipt.reusableInputs<0||typeof receipt.currentSessionReleased!=='boolean'||typeof receipt.cachedSessionsReleased!=='boolean'||!gpu||!['queueSettled','deviceDestroyed','deviceLost'].every(key=>gpu[key]===true))throw workerMessageFailure('neural-retirement','message','missing-native-cleanup-ack');resolve(receipt);},{label:'neural-retirement',onFailure:reject});
  worker.onerror=event=>protocol.fail(new EngineError('WORKER_FAILED',event?.message||'Neural worker failed during native cleanup.'));
  timer=setTimeout(()=>reject(new EngineError('NEURAL_RETIREMENT_TIMEOUT','The GPU worker did not acknowledge native cleanup before its retirement deadline.')),timeoutMs);
  try{protocol.post({command:'dispose',...(retryableAliked?{retryableAliked:true}:{})});}catch(error){reject(error);}
 });}finally{clearTimeout(timer);protocol?.dispose();worker.onerror=null;}
}
