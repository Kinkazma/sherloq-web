import {EngineError,requireValue} from './errors.js';
import {captureNeuralWindowBinding,sameNeuralWindowBinding} from './neural-window-job-owner.js';
import {createNeuralWindowRuntimeEscrow} from './neural-window-runtime-escrow.js';
import {createNeuralWindowPeer,decodeNeuralWindowFailure} from './neural-window-peer.js';
/** One main Worker control link. Child Glue Workers receive only the dedicated
 * peer port. Their physical lifetime remains with the existing Glue context. */
export function createNeuralWindowWorkerLink({post,budget,onOwner}={}){
 requireValue(typeof post==='function'&&budget?.reserve&&typeof onOwner==='function','Owned Worker Window-control link required.');let serial=0,closed=false;const records=new Map();let escrow;
 const link={get snapshot(){return{connections:records.size,escrow:escrow?.snapshot??null};},
  async open({binding,memoryPlan,maximumJobBytes,onOwner:adopt,delegate=false}={}){
   requireValue(!closed&&typeof adopt==='function','Worker Window link closed or missing owner.');const captured=captureNeuralWindowBinding(binding),ticket=++serial;memoryPlan=Object.freeze({...memoryPlan});let resolve,reject,admitResolve,hostRetired=false,peer,port,nonce,flight;const ready=new Promise((yes,no)=>{resolve=yes;reject=no;}),admission=new Promise(r=>admitResolve=r),waiters=[];
   const record={binding:captured,nonce:null,delegate,forward:null,close(){if(flight)return flight;flight=(async()=>{await admission;if(peer)await peer.close();if(!hostRetired)await new Promise((yes,no)=>{waiters.push({yes,no});post({neuralWindowRequest:{ticket,kind:'disconnect'}});});port?.close();records.delete(ticket);detach?.();})();void flight.catch(()=>{flight=null;});return flight;},forwardTo(worker){requireValue(delegate&&worker?.postMessage,'Only a delegated child Worker can receive transport ACKs.');record.forward=message=>worker.postMessage(message);}};
   records.set(ticket,record);let detach;record.receive=async control=>{
    if(control.kind==='connected'){requireValue(!nonce&&sameNeuralWindowBinding(captured,control.binding)&&/^[a-f0-9]{32}$/.test(control.nonce)&&control.port?.postMessage,'Window attachment binding differs.');port=control.port;nonce=record.nonce=control.nonce;const actualQuota=control.persistentRuntime?.persistentQuotaBytes;requireValue(Number.isSafeInteger(actualQuota)&&actualQuota>=memoryPlan.persistentQuotaBytes,'Window actual persistent quota must attest the complete funded peak.');escrow.admit(actualQuota);
     if(!delegate)peer=createNeuralWindowPeer({port,nonce,binding:captured,budget,onOwner:o=>{peer=o;}});admitResolve();resolve({peer,port:delegate?port:null,nonce,binding:captured,close:record.close,forwardTo:record.forwardTo,owner:record});return;}
    if(control.kind==='transport-failure'){requireValue(nonce===control.nonce,'Window transport ACK capability differs.');const error=decodeNeuralWindowFailure(control.failure);if(delegate)record.forward?.({neuralWindowControl:{kind:'transport-failure',nonce,failure:control.failure,retired:control.retired===true}});else await peer?.settleTransportFailure(error,{retired:control.retired===true});if(control.retired===true){hostRetired=true;for(const w of waiters.splice(0))w.yes();}return;}
    if(control.kind==='retired'){hostRetired=true;admitResolve();for(const w of waiters.splice(0))w.yes();return;}
    requireValue(control.kind==='failed','Unknown Window-control receipt.');const error=decodeNeuralWindowFailure(control.failure);admitResolve();hostRetired=control.retired===true;for(const w of waiters.splice(0))w.no(error);reject(error);
   };
   try{adopt(record);detach=escrow.attach(record);escrow.admit(memoryPlan.persistentQuotaBytes);post({neuralWindowRequest:{ticket,kind:'connect',binding:captured,memoryPlan,maximumJobBytes}});}catch(error){hostRetired=true;admitResolve();try{await record.close();}catch{}reject(error);}return ready;
  },
  accept(message){const c=message?.neuralWindowControl;if(!c)return false;requireValue(Number.isSafeInteger(c.ticket)&&c.ticket>0,'Invalid Window-control ticket.');const record=records.get(c.ticket);if(!record&&c.ticket<=serial&&['retired','transport-failure'].includes(c.kind))return true;requireValue(record,'Unknown Window-control connection.');void record.receive(c).catch(error=>{record.receive({kind:'failed',failure:{engine:{code:error.code??'WORKER_MESSAGE_FAILED',message:error.message??String(error)}},retired:false});});return true;},
  async close(){closed=true;await escrow?.dispose();}
 };onOwner(link);if(!closed)escrow=createNeuralWindowRuntimeEscrow({budget,onOwner});return link;
}
