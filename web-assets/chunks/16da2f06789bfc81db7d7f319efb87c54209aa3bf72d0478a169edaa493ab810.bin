import "../../runtime-context.js?v=0.30.0";
import {installWorkerMessageProtocol} from './worker-message-protocol.js';
import {EngineError,requireValue,serializeEngineError} from './errors.js';
import {captureNeuralWindowBinding,sameNeuralWindowBinding,createNeuralWindowJobOwner} from './neural-window-job-owner.js';

export const NEURAL_WINDOW_SCHEMA='sherloq.neural-window-rpc/1';
export const NEURAL_WINDOW_CONNECTION_BYTES=65536;
export function encodeNeuralWindowFailure(error){
 if(error===undefined)return{primitive:'undefined'};
 if(error===null||['number','boolean','string'].includes(typeof error))return{primitive:'value',value:error};
 return{engine:serializeEngineError(error,'NEURAL_EXECUTION'),frozen:Object.isFrozen(error)};
}
export function neuralWindowEnvelopeBytes(value){
 const buffers=new Set();let bytes=0;
 const visit=(item,depth)=>{requireValue(depth<=12,'Neural transport nesting exceeds its bound.');if(ArrayBuffer.isView(item)){if(!buffers.has(item.buffer)){buffers.add(item.buffer);bytes+=item.buffer.byteLength;}return;}if(item instanceof ArrayBuffer){if(!buffers.has(item)){buffers.add(item);bytes+=item.byteLength;}return;}if(item&&typeof item==='object'){requireValue(Object.getPrototypeOf(item)===Object.prototype||Array.isArray(item),'Neural transport requires plain records and typed arrays.');for(const child of Object.values(item))visit(child,depth+1);}};visit(value,0);return bytes;
}
/** Narrow data channel only. Runtime ownership stays in the separately funded
 * Window pool; this host owns transport/job credits until receiver adoption. */
export function createNeuralWindowHost({port,nonce,binding,budget,maximumJobBytes,execute,describeResult=()=>null,onOwner,onClosed=()=>{},onTransportFailure=()=>{}}={}){
 requireValue(port?.postMessage&&/^[a-f0-9]{32}$/.test(nonce??'')&&budget?.reserve&&Number.isSafeInteger(maximumJobBytes)&&maximumJobBytes>0&&typeof execute==='function'&&typeof onOwner==='function','Authenticated bounded neural Window host required.');
 let current=captureNeuralWindowBinding(binding),closed=false,closing,serial=0,queue=Promise.resolve(),protocol,connectionFee,fatal,hasFatal=false;const jobs=new Map(),retired=new Map();
 const post=(ticket,kind,fields={})=>protocol.post({schema:NEURAL_WINDOW_SCHEMA,nonce,ticket,kind,...fields});
 const presentFailure=(ticket,error,ack)=>post(ticket,'failed',{failure:encodeNeuralWindowFailure(error),retired:ack});
 const host={get state(){return{closed,closing:!!closing,jobs:jobs.size,retirementReceipts:retired.size,connectionBytes:connectionFee?NEURAL_WINDOW_CONNECTION_BYTES:0,jobBytes:[...jobs.values()].reduce((n,r)=>n+(r.owner.state.funded?r.bytes:0),0),binding:current};},
  updateBinding(next){current=captureNeuralWindowBinding(next);for(const r of jobs.values())if(!sameNeuralWindowBinding(r.binding,current))r.owner.cancel();},
  close(){if(closed)return Promise.resolve();if(closing)return closing;closing=(async()=>{let failed=false,primary;for(const r of [...jobs.values()]){r.owner.cancel();try{await r.owner.close({peerTerminated:true});}catch(error){if(!failed){failed=true;primary=error;}}}if(failed)throw primary;protocol?.dispose();port.close?.();retired.clear();connectionFee?.();connectionFee=null;closed=true;onClosed(host);if(hasFatal)onTransportFailure(fatal,{retired:true});})();void closing.catch(()=>{closing=null;});return closing;}
 };
 onOwner(host);
 if(closed)return host;
 connectionFee=budget.reserve(NEURAL_WINDOW_CONNECTION_BYTES);
 protocol=installWorkerMessageProtocol(port,async packet=>{
  requireValue(packet.schema===NEURAL_WINDOW_SCHEMA&&packet.nonce===nonce&&Number.isSafeInteger(packet.ticket)&&packet.ticket>0&&['admit','perform','received','cancel','retire','settled'].includes(packet.kind),'Invalid neural Window RPC envelope.');
  const {ticket,kind}=packet;
  if(retired.has(ticket)){requireValue(sameNeuralWindowBinding(retired.get(ticket),packet.binding),'Changed binding on retired Window receipt.');if(kind==='settled')retired.delete(ticket);else requireValue(['received','cancel','retire'].includes(kind),'Science cannot be replayed after retirement.');return;}
  if(kind==='admit'){
   requireValue(!closed&&!closing&&ticket>serial&&!jobs.has(ticket),'Window ticket is stale or already admitted.');serial=ticket;
   requireValue(jobs.size+retired.size<16,'Window connection has reached its bounded pending-receipt capacity.');
   const captured=captureNeuralWindowBinding(packet.binding),sizes=packet.sizes;
   requireValue(sizes&&['modelBytes','inputBytes','outputBytes','workingBytes'].every(k=>Number.isSafeInteger(sizes[k])&&sizes[k]>=0)&&sizes.modelBytes>0&&sizes.outputBytes>0,'Neural Window admission sizes differ.');
   if(!sameNeuralWindowBinding(captured,current)){retired.set(ticket,captured);presentFailure(ticket,new EngineError('CANCELLED','Source/domain changed before Window admission.'),true);return;}
   const bytes=sizes.modelBytes*2+sizes.inputBytes*2+sizes.outputBytes*3+sizes.workingBytes+4096;
   if(!Number.isSafeInteger(bytes)||bytes<=0||bytes>maximumJobBytes){retired.set(ticket,captured);presentFailure(ticket,new EngineError('MEMORY_LIMIT','Neural Window job exceeds its fixed admission.',{details:{requestedBytes:bytes,maximumBytes:maximumJobBytes,phase:'before-input-clone'}}),true);return;}
   const record={ticket,binding:captured,sizes:{...sizes},bytes,owner:null,launched:false,result:null,finalReply:false};jobs.set(ticket,record);
   try{record.owner=createNeuralWindowJobOwner({binding:captured,budget,bytes,onOwner:owner=>{record.owner=owner;},onClosed:()=>{jobs.delete(ticket);retired.set(ticket,captured);},execute:async(payload,hooks)=>{
     requireValue(sameNeuralWindowBinding(record.binding,current),'Source/domain changed before Window execution.');
     return execute(payload,{...hooks,binding:record.binding,sizes:record.sizes});
    },validate:result=>{requireValue(neuralWindowEnvelopeBytes(result)<=sizes.outputBytes,'Complete neural output exceeds its admitted bound.');}});
    post(ticket,'admitted',{binding:captured,bytes});
   }catch(error){try{await record.owner?.close();}catch{}if(!record.owner)jobs.delete(ticket);presentFailure(ticket,error,!jobs.has(ticket));}
   return;
  }
  const record=jobs.get(ticket);requireValue(record?.owner&&sameNeuralWindowBinding(record.binding,packet.binding),'Unknown Window ticket or changed immutable binding.');
  if(kind==='perform'){
   requireValue(!record.launched,'Window science was already launched.');
   if(!sameNeuralWindowBinding(record.binding,current)){record.owner.cancel();await record.owner.close();presentFailure(ticket,new EngineError('CANCELLED','Source/domain changed before Window execution.'),true);return;}
   requireValue(neuralWindowEnvelopeBytes(packet.payload)<=record.sizes.modelBytes+record.sizes.inputBytes,'Typed input arrived outside its prepaid envelope.');record.launched=true;
   const work=async()=>{if(record.owner.state.closed)return;try{
     const result=await record.owner.start(packet.payload,record.binding);
     if(!sameNeuralWindowBinding(record.binding,current)){record.owner.cancel();await record.owner.close();throw new EngineError('CANCELLED','Source/domain changed during Window work.');}
     record.result=result;const execution=describeResult(result);post(ticket,'prepared',{binding:record.binding,result,execution:execution?{...execution,completedAfterNativeAck:true}:null});
    }catch(error){record.owner.cancel();let ack=false;try{await record.owner.close();ack=true;}catch{}if(!record.finalReply){record.finalReply=ack;presentFailure(ticket,error,ack);}}};
   queue=queue.then(work,work);void queue.catch(()=>{});return;
  }
  if(kind==='received'){
   try{await record.owner.acknowledgeReceived(record.binding);record.result=null;if(!record.finalReply){record.finalReply=true;post(ticket,'retired',{binding:record.binding});}}
   catch(error){presentFailure(ticket,error,false);}return;
  }
  record.owner.cancel();
  try{await record.owner.close({peerTerminated:kind==='retire'});record.result=null;if(!record.finalReply){record.finalReply=true;post(ticket,'retired',{binding:record.binding,cancelled:true});}}
  catch(error){presentFailure(ticket,error,false);}
 },{label:'targeted-neural-window-host',onFailure:error=>{hasFatal=true;fatal=error;for(const r of jobs.values())r.owner?.cancel();void host.close().catch(retirementError=>onTransportFailure(error,{retired:false,retirementError}));}});
 port.start?.();return host;
}
