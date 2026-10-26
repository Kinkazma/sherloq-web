import {Budget} from '../../src/cache.js';
import {installWorkerMessageProtocol} from '../../src/worker-message-protocol.js';
import {requireValue,serializeEngineError} from '../../src/errors.js';
import {createStrictFragmentEvaluator} from './strict-fragment-evaluator.js';
let evaluator,budget;
installWorkerMessageProtocol(self,async data=>{
 let result;
 try{
  if(data.type==='init'){requireValue(!evaluator&&typeof data.moduleUrl==='string'&&Number.isSafeInteger(data.limitBytes)&&data.limitBytes>=32*1024**2&&data.limitBytes<=256*1024**2,'Bounded strict evaluator initialization required.');budget=new Budget(data.limitBytes);const factory=(await import(data.moduleUrl)).default;evaluator=await createStrictFragmentEvaluator(factory,{budget,residentForeignLimit:data.residentForeignLimit??0});}
  else{requireValue(evaluator,'Strict evaluator is not initialized.');if(data.type==='source-begin')evaluator.beginSource(data);else if(data.type==='source-chunk')await evaluator.sourceChunk(data);else if(data.type==='source-end')evaluator.endSource();else if(data.type==='supports')result=await evaluator.supports(data);else if(data.type==='evaluate')result=await evaluator.evaluate(data);else if(data.type==='dispose'){evaluator.cancelSource();evaluator.dispose();evaluator=null;}else requireValue(false,'Unknown strict native evaluator request.');}
  const snapshot=evaluator?.snapshot()??null;
  if(result){const value=result.data;self.postMessage({id:data.id,ok:true,values:value,snapshot},[value.buffer]);}
  else self.postMessage({id:data.id,ok:true,snapshot,policyBytes:budget?.total()??0});
 }catch(error){self.postMessage({id:data.id,ok:false,error:serializeEngineError(error),snapshot:evaluator?.snapshot()??null});}
 finally{result?.release();}
},{label:'d2prl-strict-evaluator',onFailure:error=>self.postMessage({protocolFailure:true,ok:false,error:serializeEngineError(error)})});
