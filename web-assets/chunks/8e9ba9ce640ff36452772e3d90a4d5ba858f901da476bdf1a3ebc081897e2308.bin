import "../../runtime-context.js?v=0.30.0";
import {EngineError,requireValue,checkAbort} from './errors.js';
import {captureNeuralWindowBinding,neuralWindowAck} from './neural-window-job-owner.js';
import {openNeuralWindowConnection} from './neural-window-engine-link.js';
import {neuralWindowMemoryPlan} from './neural-window-memory-plan.js';
/** A target parent's exact connection and output debts. It changes no source
 * preparation or graph. Parent credit cannot leave until dispose ACKs. */
export function createNeuralWindowTargetRunner({budget,binding,hostMaximumBytes,maximumModelBytes,maximumInputBytes,maximumOutputBytes,gpuWorkingBytes,onOwner,signal,onFailure,openConnection=openNeuralWindowConnection}={}){
 const captured=captureNeuralWindowBinding(binding),plan=neuralWindowMemoryPlan({hostMaximumBytes,gpuWorkingBytes,modelBytes:maximumModelBytes,inputBytes:maximumInputBytes,outputBytes:maximumOutputBytes});requireValue(typeof onOwner==='function','Target native parent must adopt its Window connection.');
 let closed=false,opening=Promise.resolve(),connectionOwner,connection,flight,serial=Promise.resolve();const lifetime=new AbortController(),joined=AbortSignal.any([lifetime.signal,...(signal?[signal]:[])]),outputs=new Set();
 const runner={get snapshot(){return{closed,plan,outputs:outputs.size,connectionReady:!!connection};},
  async ready(){await opening;checkAbort(joined);if(!connection)throw new EngineError('GPU_UNAVAILABLE','Target Window connection did not attach.');},
  async run(payload,{modelBytes,inputBytes,outputBytes,workingBytes=gpuWorkingBytes,onOwner:adopt,reserveOutput}={}){
   const work=async()=>{
   requireValue(typeof adopt==='function'&&modelBytes<=maximumModelBytes&&inputBytes<=maximumInputBytes&&outputBytes<=maximumOutputBytes&&workingBytes<=gpuWorkingBytes,'Target native window exceeds its unchanged admitted plan.');await runner.ready();checkAbort(joined);let owner;
   let answer;try{answer=await connection.peer.run(payload,{sizes:{modelBytes,inputBytes,outputBytes,workingBytes},signal:joined,...(reserveOutput?{reserveOutput}:{}),onOwner:o=>{owner=o;outputs.add(o);adopt(o);}});}catch(error){try{onFailure?.(error);}catch{/* failure marker cannot replace the Native primary */}lifetime.abort();throw error;}checkAbort(joined);
   return{result:answer.result,execution:answer.execution,owner,async release(){await neuralWindowAck(()=>answer.release());outputs.delete(owner);}};
   };const result=serial.then(work,work);serial=result.then(()=>{},()=>{});return result;
  },
  stop(){lifetime.abort();},
  dispose(){closed=true;lifetime.abort();if(flight)return flight;flight=(async()=>{await opening.catch(()=>{});await serial;if(connectionOwner)await neuralWindowAck(()=>connectionOwner.close());outputs.clear();connection=null;})();void flight.catch(()=>{flight=null;});return flight;}
 };
 onOwner(runner);if(closed)return runner;
 opening=openConnection(budget,{binding:captured,memoryPlan:plan,maximumJobBytes:plan.jobBytes,onOwner:o=>{connectionOwner=o;}}).then(value=>{connection=value;return value;});void opening.catch(()=>{});return runner;
}
