import {installWorkerMessageProtocol} from './worker-message-protocol.js';
import {EngineError,requireValue,deserializeEngineError} from './errors.js';
import {captureNeuralWindowBinding,sameNeuralWindowBinding,neuralWindowAck} from './neural-window-job-owner.js';
import {NEURAL_WINDOW_SCHEMA,neuralWindowEnvelopeBytes} from './neural-window-host.js';
import {createNeuralWindowOutputOwner} from './neural-window-output-owner.js';
export function decodeNeuralWindowFailure(packet){
 requireValue(packet&&typeof packet==='object','Native Window failure receipt required.');
 if(packet.primitive==='undefined')return undefined;
 if(packet.primitive==='value')return packet.value;
 requireValue(packet.engine&&typeof packet.engine.code==='string'&&typeof packet.engine.message==='string','Malformed native Window failure.');
 const error=deserializeEngineError(packet.engine);return packet.frozen?Object.freeze(error):error;
}
/** Worker-side output ownership. Native acknowledgement and the local output
 * lease are separate; a NACK retries this ticket's retirement, never its graph. */
export function createNeuralWindowPeer({port,nonce,binding,budget,onOwner,onClosed=()=>{},releaseFunding}={}){
 requireValue(port?.postMessage&&/^[a-f0-9]{32}$/.test(nonce??'')&&budget?.reserve&&typeof onOwner==='function','Authenticated funded neural Window peer required.');
 let current=captureNeuralWindowBinding(binding),serial=0,closed=false,closing,protocol;const jobs=new Map();
 const post=(record,kind,fields={})=>protocol.post({schema:NEURAL_WINDOW_SCHEMA,nonce,ticket:record.ticket,kind,binding:record.binding,...fields});
 const peer={get state(){return{jobs:jobs.size,closed,closing:!!closing,bytes:[...jobs.values()].reduce((n,r)=>n+(r.fee?r.sizes.outputBytes+4096:0),0)};},
  // Only the owning client may call this over its separate guarded Worker
  // control channel after host.close() actually ACKed. Port failure is not ACK.
  async settleTransportFailure(error,{retired=false}={}){for(const r of jobs.values()){r.fail(error);r.cancelled=true;r.reject(r.primary);}if(!retired)return;let failed=false,primary;for(const r of [...jobs.values()]){r.remoteRetired=true;r.admittedResolve();for(const waiting of r.ackWaiters.splice(0))waiting.resolve();try{await r.close();}catch(cause){if(!failed){failed=true;primary=cause;}}}if(failed)throw primary;},
  updateBinding(next){current=captureNeuralWindowBinding(next);for(const r of jobs.values())if(!sameNeuralWindowBinding(r.binding,current)){r.cancelled=true;r.cancel?.();}},
  run(payload,{sizes,signal,onOwner:adopt,reserveOutput=bytes=>budget.reserve(bytes)}={}){
   requireValue(!closed&&!closing&&typeof adopt==='function'&&typeof reserveOutput==='function'&&sizes&&Number.isSafeInteger(sizes.outputBytes)&&sizes.outputBytes>0,'An adopted complete output and open peer are required.');
   const record={ticket:++serial,binding:current,payload,sizes:{...sizes},fee:null,outputOwner:null,admitted:false,remoteRetired:false,prepared:false,value:undefined,cancelled:false,failed:false,primary:undefined,closing:null,admission:null,ackWaiters:[],resolved:false};
   const fail=error=>{if(!record.failed){record.failed=true;record.primary=error;}};
   record.cancel=()=>{record.cancelled=true;if(record.admitted&&!record.remoteRetired)post(record,'cancel');};
   record.close=()=>{
    if(!jobs.has(record.ticket))return Promise.resolve();if(record.closing)return record.closing;
    record.closing=(async()=>{
     record.cancelled=true;await record.admission;
     if(!record.remoteRetired)await new Promise((resolve,reject)=>{record.ackWaiters.push({resolve,reject});post(record,'retire');});
     await record.outputOwner?.dispose();record.outputOwner=null;
     if(record.fee){await neuralWindowAck(()=>releaseFunding?releaseFunding(record.fee):record.fee());record.fee=null;}
     record.value=record.payload=undefined;signal?.removeEventListener('abort',record.cancel);jobs.delete(record.ticket);
    })();void record.closing.catch(()=>{record.closing=null;});return record.closing;
   };
   record.fail=fail;
   let resolve,reject;const result=new Promise((yes,no)=>{resolve=yes;reject=no;});record.resolve=resolve;record.reject=reject;
   let admittedResolve;record.admission=new Promise(resolve=>admittedResolve=resolve);record.admittedResolve=admittedResolve;
   // Keep the receiver owner before reservation or its first cross-agent await.
   jobs.set(record.ticket,record);try{adopt(record);record.fee=reserveOutput(sizes.outputBytes+4096);requireValue(typeof record.fee==='function','The adopted output must have an actual parent credit loan.');if(signal?.aborted){record.cancelled=true;record.remoteRetired=true;record.admittedResolve();void record.close().then(()=>reject(new EngineError('CANCELLED','Window request cancelled before admission.')),reject);return result;}
    signal?.addEventListener('abort',record.cancel,{once:true});post(record,'admit',{sizes:record.sizes});
   }catch(error){record.remoteRetired=true;record.admittedResolve();fail(error);void record.close().then(()=>reject(error),()=>reject(error));}
   return result;
  },
  close(){if(closed)return Promise.resolve();if(closing)return closing;closing=(async()=>{let failed=false,primary;for(const r of [...jobs.values()])try{await r.close();}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;protocol?.dispose();port.close?.();closed=true;onClosed(peer);})();void closing.catch(()=>{closing=null;});return closing;}
 };
 onOwner(peer);if(closed)return peer;
 protocol=installWorkerMessageProtocol(port,async packet=>{
  requireValue(packet.schema===NEURAL_WINDOW_SCHEMA&&packet.nonce===nonce&&Number.isSafeInteger(packet.ticket)&&['admitted','prepared','retired','failed'].includes(packet.kind),'Invalid neural Window peer receipt.');
  const r=jobs.get(packet.ticket);requireValue(r,'Unexpected retired or unknown Window receipt.');
  if(packet.kind==='admitted'){
   requireValue(!r.admitted&&sameNeuralWindowBinding(r.binding,packet.binding),'Window grant identity differs.');r.admitted=true;r.admittedResolve();
   if(r.cancelled||!sameNeuralWindowBinding(r.binding,current))post(r,'cancel');else post(r,'perform',{payload:r.payload});return;
  }
  if(packet.kind==='prepared'){
   // The real cloned output is adopted in the pre-existing funded record
   // before validation, cancellation checks or any subsequent await.
   r.value=packet.result;r.execution=packet.execution??null;r.prepared=true;
   try{createNeuralWindowOutputOwner({budget,maximumBytes:r.sizes.outputBytes,onOwner:owner=>{r.outputOwner=owner;}}).adopt(r.value);requireValue(sameNeuralWindowBinding(r.binding,packet.binding)&&neuralWindowEnvelopeBytes(r.value)<=r.sizes.outputBytes,'Complete neural output shape/ownership bound differs.');}catch(error){r.fail(error);}
   if(!sameNeuralWindowBinding(r.binding,current))r.cancelled=true;post(r,'received');return;
  }
  if(packet.kind==='failed'){
   const error=decodeNeuralWindowFailure(packet.failure);r.fail(error);r.admittedResolve();
   if(packet.retired!==true){for(const waiting of r.ackWaiters.splice(0))waiting.reject(r.primary);r.reject(r.primary);return;}
  }else requireValue(sameNeuralWindowBinding(r.binding,packet.binding),'Window retirement binding differs.');
  r.remoteRetired=true;post(r,'settled');for(const waiting of r.ackWaiters.splice(0))waiting.resolve();
  if(r.failed||r.cancelled||packet.cancelled){
   if(!r.failed)r.fail(new EngineError('CANCELLED','Window work cancelled after native retirement.'));
   try{await r.close();}catch{}r.reject(r.primary);return;
  }
  requireValue(r.prepared,'Native retirement arrived without a complete owned result.');r.payload=undefined;r.resolved=true;r.resolve({result:r.value,execution:r.execution,release:r.close,owner:r});
 },{label:'targeted-neural-window-peer',onFailure:error=>{for(const r of jobs.values()){r.fail(error);r.reject(error);r.cancelled=true;}}});
 port.start?.();return peer;
}
