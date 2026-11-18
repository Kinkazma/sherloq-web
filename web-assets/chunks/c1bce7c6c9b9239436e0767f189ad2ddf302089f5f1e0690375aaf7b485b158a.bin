import "../../runtime-context.js?v=0.33.3";
import {EngineError,requireValue,serializeEngineError,deserializeEngineError} from './errors.js';

const bindingKeys=['imageId','sourceSurfaceId','sourceRevision','sourceSha256','kind'];
const sameBinding=(a,b)=>!!a&&!!b&&bindingKeys.every(key=>a[key]===b[key]);
const nonce=()=>crypto.randomUUID();
const ack=async action=>{const value=await action();if(value===false||value===0)throw value;return value;};
const fail=(code,message)=>new EngineError(code,message);
const metadataBytes=(...strings)=>1024+4*strings.reduce((sum,value)=>sum+String(value??'').length,0);
const encode=value=>value===null||['undefined','boolean','number','string'].includes(typeof value)
 ?{primitive:true,type:typeof value,...(value===undefined?{}:{value})}:{engine:serializeEngineError(value)};
const decode=value=>value?.primitive?value.type==='undefined'?undefined:value.value:deserializeEngineError(value.engine);
function captureBinding(value){
 requireValue(value&&typeof value.imageId==='string'&&value.imageId.length&&typeof value.sourceSurfaceId==='string'&&value.sourceSurfaceId.length
  &&Number.isSafeInteger(value.sourceRevision)&&value.sourceRevision>0&&/^[a-f0-9]{64}$/.test(value.sourceSha256??'')
  &&['encoded','fixture'].includes(value.kind),'An established source content binding is required.');
 return Object.freeze(Object.fromEntries(bindingKeys.map(key=>[key,value[key]])));
}
function captureRequest(value){
 requireValue(value&&typeof value.sourceLeaseId==='string'&&value.sourceLeaseId.length&&typeof value.sourceId==='string'&&value.sourceId.length
  &&Number.isSafeInteger(value.revision)&&value.revision>0&&['decoded','sensor'].includes(value.domain)&&(value.frame===undefined||value.frame===0)
  &&(value.windowLeaseId===undefined||typeof value.windowLeaseId==='string'&&value.windowLeaseId.length),'Invalid source retirement request.');
 return Object.freeze({sourceLeaseId:value.sourceLeaseId,sourceId:value.sourceId,revision:value.revision,domain:value.domain,frame:0,
  bindingOriginal:captureBinding(value.bindingOriginal),...(value.windowLeaseId?{windowLeaseId:value.windowLeaseId}:{})});
}
const sameSource=(a,b)=>a.sourceLeaseId===b.sourceLeaseId&&a.sourceId===b.sourceId&&a.revision===b.revision&&a.domain===b.domain
 &&a.frame===b.frame&&sameBinding(a.bindingOriginal,b.bindingOriginal);
const requestIdentity=value=>JSON.stringify([value.sourceLeaseId,value.sourceId,value.revision,value.domain,value.frame,
 ...bindingKeys.map(key=>value.bindingOriginal[key]),value.windowLeaseId??null]);

function windowSequence(request){
 const prefix=request.sourceLeaseId+'/w/',id=request.windowLeaseId,sequence=Number(id?.slice(prefix.length));
 return id?.startsWith(prefix)&&Number.isSafeInteger(sequence)&&sequence>0&&String(sequence)===id.slice(prefix.length)?sequence:null;
}
const retiredWindow=(row,sequence)=>sequence!==null&&(sequence<=row.retiredThrough||row.retiredRanges.some(range=>sequence>=range.first&&sequence<=range.last));
function acknowledgeWindow(row,sequence,fee=()=>{}){
 if(retiredWindow(row,sequence)){fee();return;}
 row.retiredRanges.push({first:sequence,last:sequence,fee});row.retiredRanges.sort((a,b)=>a.first-b.first);
 for(let i=1;i<row.retiredRanges.length;){const previous=row.retiredRanges[i-1],next=row.retiredRanges[i];
  if(next.first<=previous.last+1){previous.last=Math.max(previous.last,next.last);next.fee();row.retiredRanges.splice(i,1);}else i++;
 }
 while(row.retiredRanges[0]?.first<=row.retiredThrough+1){const range=row.retiredRanges.shift();row.retiredThrough=Math.max(row.retiredThrough,range.last);range.fee();}
}

/** The Original budget funds both endpoints' small transport records. Nothing
 * is registered or allocated until a real source owner adopts this link. */
export function createSourceSamplesControlServer({post}={}){
 requireValue(typeof post==='function','A captured Worker control sender is required.');
 let epoch,services,registrations;
 const getRegistration=control=>{const row=registrations?.get(control);requireValue(row,'Unknown captured source control registration.');return row;};
 const getSource=(row,request)=>{const source=row.sources.get(request.sourceLeaseId);requireValue(source&&sameSource(source.request,request),'Source control receipt binding differs.');return source;};
 const discardWindow=(source,id)=>{const value=source.windows.get(id);if(value){value.fee();source.windows.delete(id);}};
 const releaseWindow=(source,request)=>{const value=source.windows.get(request.windowLeaseId);if(value){source.windows.delete(request.windowLeaseId);acknowledgeWindow(source,windowSequence(request),value.fee);}};
 function finishService(row){
  for(const source of row.sources.values()){for(const window of source.windows.values())window.fee();source.windows.clear();for(const range of source.retiredRanges)range.fee();source.retiredRanges.length=0;source.fee();}
  row.sources.clear();for(const pending of row.requests.values())pending.fee();row.requests.clear();row.fee();row.acknowledged=true;
  services.delete(row.key.serviceId);row.closeResolve?.();
 }
 const server={
  register(service,bindingOriginal,budget){
   requireValue(service&&typeof service.retireSourceSamples==='function'&&budget?.reserve,'A source owner and its real budget are required.');
   const binding=captureBinding(bindingOriginal),bytes=metadataBytes(...bindingKeys.map(key=>binding[key])),fee=budget.reserve(bytes);
   let key;try{epoch??=nonce();key=Object.freeze({workerEpoch:epoch,serviceId:nonce(),nonce:nonce(),bindingOriginal:binding});}
   catch(error){fee();throw error;}
   services??=new Map();registrations??=new WeakMap();
   const row={key,service,budget,fee,registrationBytes:bytes,sources:new Map(),requests:new Map(),closeFlight:null,acknowledged:false,closure:null};
   services.set(key.serviceId,row);registrations.set(key,row);return key;
  },
  adoptSource(control,reply,{unpublished=false}={}){
   const row=getRegistration(control),request=captureRequest(reply);requireValue(!row.closure&&!row.acknowledged&&sameBinding(row.key.bindingOriginal,request.bindingOriginal),'Source registration is closing or belongs to another Original.');
   const existing=row.sources.get(request.sourceLeaseId);
   if(existing){requireValue(sameSource(existing.request,request),'Source lease was rebound.');return existing.capability;}
   // Source adoption pre-funds its control/response record. Retirement must
   // remain possible even when all useful RAM has subsequently been admitted.
   const bytes=2*metadataBytes(requestIdentity(request)),fee=row.budget.reserve(bytes);let capability;
   try{capability=Object.freeze({...row.key,sourceLeaseId:request.sourceLeaseId,sourceNonce:nonce(),metadataBytes:bytes+row.registrationBytes});}
   catch(error){fee();throw error;}
   row.sources.set(request.sourceLeaseId,{request,capability,fee,windows:new Map(),retiredThrough:0,retiredRanges:[],published:!unpublished});return capability;
  },
  async publishSource(control,reply,publish){
   const row=getRegistration(control),request=captureRequest(reply),source=getSource(row,request);
   requireValue(!source.published&&typeof publish==='function','Source response is already published.');
   // The pre-funded response permit owns this one-byte transfer witness. An
   // async publisher can reject after actually posting: detachment then keeps
   // the source owner alive for its real peer ACK, like read's pixel buffer.
   const token=source.publicationToken??=new ArrayBuffer(1);
   try{const result=await publish({...reply,sourceSamplesPublication:token},[token]);if(result===false||result===0)throw result;source.published=true;}
   catch(error){if(token.byteLength===0)source.published=true;throw error;}
  },
  sourceWasPublished(control,reply){return getSource(getRegistration(control),captureRequest(reply)).published;},
  discardUnpublishedSource(control,reply){
   const row=getRegistration(control),request=captureRequest(reply),source=getSource(row,request);
   requireValue(!source.published&&!source.windows.size&&!source.retiredRanges.length,'A published source cannot be discarded locally.');
   source.fee();row.sources.delete(request.sourceLeaseId);
  },
  async publishWindow(control,wire,transfer,publish){
   const row=getRegistration(control),request=captureRequest(wire),source=getSource(row,request);
   requireValue(!row.closure&&typeof publish==='function'&&wire.samples?.buffer instanceof ArrayBuffer,'Source window publication is unavailable.');
   const prefix=request.sourceLeaseId+'/w/',sequence=Number(request.windowLeaseId?.slice(prefix.length));
   requireValue(request.windowLeaseId?.startsWith(prefix)&&Number.isSafeInteger(sequence)&&sequence>0&&String(sequence)===request.windowLeaseId.slice(prefix.length)
    &&!source.windows.has(request.windowLeaseId)&&!retiredWindow(source,sequence),'Unexpected source window sequence.');
   const bytes=metadataBytes(request.windowLeaseId)+2*metadataBytes(requestIdentity(request)),fee=row.budget.reserve(bytes),window={fee,posted:false};source.windows.set(request.windowLeaseId,window);
   const buffer=wire.samples.buffer;
   try{await publish({...wire,sourceSamplesWindowCredit:{bytes,sourceNonce:source.capability.sourceNonce}},transfer);window.posted=true;}
   catch(error){if(buffer.byteLength>0)discardWindow(source,request.windowLeaseId);else window.posted=true;throw error;}
  },
  close(control){
   const row=getRegistration(control);if(row.acknowledged)return Promise.resolve();if(row.closeFlight)return row.closeFlight;
   requireValue(row.service.state?.closed===true,'A live source service cannot be retired.');
   if(!row.sources.size){finishService(row);return Promise.resolve();}
   row.closure??=nonce();const task=new Promise((resolve,reject)=>{
    row.closeResolve=resolve;row.closeReject=reject;try{post({sourceSamplesServiceClosed:{...row.key,closure:row.closure}});}catch(error){reject(error);}
   });row.closeFlight=task;task.then(()=>{row.closeFlight=null;},()=>{row.closeFlight=null;});return task;
  },
  accept(packet){
   const c=packet?.sourceSamplesControl;if(!c)return false;
   void(async()=>{
    let row,request,source,key,pending;
    try{
     requireValue(c&&Number.isSafeInteger(c.ticket)&&c.ticket>0&&c.workerEpoch===epoch&&typeof c.serviceId==='string','Invalid source control epoch or envelope.');
     row=services?.get(c.serviceId);requireValue(row&&c.nonce===row.key.nonce,'Unknown source control capability.');
     if(c.action==='service-closed-ack'){
      requireValue(row.closure&&c.closure===row.closure&&sameBinding(c.bindingOriginal,row.key.bindingOriginal)&&row.service.state?.closed===true,'Invalid service closure ACK.');
      post({sourceSamplesServiceClosedAck:{...row.key,closure:row.closure}});
      finishService(row);return;
     }
     requireValue(c.action==='retire'&&!row.acknowledged,'Unknown source control action.');request=captureRequest(c.request);source=getSource(row,request);
     requireValue(c.sourceNonce===source.capability.sourceNonce,'Source receipt capability differs.');
     if(request.windowLeaseId){const sequence=windowSequence(request);
      requireValue(sequence!==null&&(source.windows.has(request.windowLeaseId)||retiredWindow(source,sequence)),'Source window receipt was not published or acknowledged.');}
     key=requestIdentity(request);pending=row.requests.get(key);
     if(!pending){pending={fee:()=>{},ticket:c.ticket,posting:null,task:Promise.resolve().then(()=>row.service.retireSourceSamples(request))};row.requests.set(key,pending);}
     requireValue(pending.ticket===c.ticket,'A control retry must reuse its captured ticket.');
     if(!pending.posting){const posting=(async()=>{
      let result,error,rejected=false;try{result=await pending.task;}catch(reason){error=reason;rejected=true;}
      post({sourceSamplesControlAck:{ticket:pending.ticket,workerEpoch:epoch,serviceId:row.key.serviceId,nonce:row.key.nonce,sourceNonce:source.capability.sourceNonce,
       requestIdentity:key,...(rejected?{failed:true,error:encode(error)}:{result})}});
      if(row.requests.get(key)===pending){if(!rejected&&request.windowLeaseId)releaseWindow(source,request);pending.fee();row.requests.delete(key);}
     })();pending.posting=posting;posting.then(()=>{pending.posting=null;},()=>{pending.posting=null;});}
     await pending.posting;
    }catch(error){
     // A failed ACK publication keeps the funded receipt for retry. A malformed
     // or stale request never mutates the useful task's controller or owners.
     if(!pending)try{post({sourceSamplesControlAck:{ticket:c.ticket,workerEpoch:c.workerEpoch,serviceId:c.serviceId,nonce:c.nonce,sourceNonce:c.sourceNonce,
      requestIdentity:request?requestIdentity(request):null,failed:true,error:encode(error)}});}catch{}
     if(c.action==='service-closed-ack'&&row?.closure)row.closeReject?.(error);
    }
   })();return true;
  },
  get state(){return{services:services?.size??0,sources:[...services?.values()??[]].reduce((n,row)=>n+row.sources.size,0),
   windows:[...services?.values()??[]].reduce((n,row)=>n+[...row.sources.values()].reduce((m,source)=>m+source.windows.size,0),0),
   controls:[...services?.values()??[]].reduce((n,row)=>n+row.requests.size,0)};},
 };
 return server;
}

/** Only the captured Worker can receive controls. Capabilities are adopted from
 * matching prepare replies, never from caller/session transport hints. */
export function createSourceSamplesControlClient({worker,canPost=()=>true,onPeerRetire=async()=>{}}={}){
 requireValue(worker&&typeof worker.postMessage==='function'&&typeof onPeerRetire==='function','A captured source Worker owner is required.');
 const sources=new Map(),pending=new Map(),pendingKeys=new Map(),closingServices=new Map(),adoptedReceipts=new WeakMap();
 let serial=0,peerRetired=false,peerReceipt,closeFlight,peerFlight;
 const adopted=value=>{const request=captureRequest(value),row=sources.get(request.sourceLeaseId);
  requireValue(row&&sameSource(row.request,request),'Retirement requires an adopted source receipt.');return{row,request};};
 function sendClosureAck(c){
  requireValue(!peerRetired&&canPost(),'Captured Worker retired before service closure ACK.');
  const ticket=++serial;closingServices.set(c.serviceId,{...c,ticket});
  worker.postMessage({sourceSamplesControl:{ticket,action:'service-closed-ack',workerEpoch:c.workerEpoch,serviceId:c.serviceId,
   nonce:c.nonce,closure:c.closure,bindingOriginal:c.bindingOriginal}});
 }
 function finishClosure(c){
  for(const [id,row]of [...sources])if(row.control.workerEpoch===c.workerEpoch&&row.control.serviceId===c.serviceId&&row.control.nonce===c.nonce){
   for(const [ticket,p]of [...pending])if(p.row===row){pending.delete(ticket);pendingKeys.delete(p.key);p.resolve({retired:true,serviceClosed:true});}
   for(const output of row.windows.values())output.samples=null;row.windows.clear();row.retired=true;sources.delete(id);
  }closingServices.delete(c.serviceId);
 }
 const link={
  adoptSource(reply){
   const request=captureRequest(reply),control=reply.sourceSamplesControl;
   requireValue(control&&typeof control.workerEpoch==='string'&&typeof control.serviceId==='string'&&typeof control.nonce==='string'
    &&typeof control.sourceNonce==='string'&&control.sourceLeaseId===request.sourceLeaseId&&Number.isSafeInteger(control.metadataBytes)&&control.metadataBytes>0
    &&sameBinding(control.bindingOriginal,request.bindingOriginal),'A funded source capability is required.');
   const old=sources.get(request.sourceLeaseId);requireValue(!old||sameSource(old.request,request)&&old.control.sourceNonce===control.sourceNonce,'Source lease was rebound.');
   if(!old)sources.set(request.sourceLeaseId,{request,control:Object.freeze({...control,bindingOriginal:captureBinding(control.bindingOriginal)}),windows:new Map(),retiredThrough:0,retiredRanges:[],retired:false,closing:false});
   const {sourceSamplesControl,sourceSamplesPublication,...publicReply}=reply;adoptedReceipts.set(publicReply,request);return publicReply;
  },
  adoptWindow(reply){
   const {row,request}=adopted(reply),credit=reply.sourceSamplesWindowCredit;
   requireValue(request.windowLeaseId&&credit?.sourceNonce===row.control.sourceNonce&&Number.isSafeInteger(credit.bytes)&&credit.bytes>0,'A funded window transport receipt is required.');
   const {sourceSamplesWindowCredit,samples,...publicReply}=reply,output={samples};
   Object.defineProperty(publicReply,'samples',{enumerable:true,configurable:false,get:()=>output.samples});
   const prefix=request.sourceLeaseId+'/w/',sequence=Number(request.windowLeaseId.slice(prefix.length));
   requireValue(request.windowLeaseId.startsWith(prefix)&&Number.isSafeInteger(sequence)&&sequence>0&&String(sequence)===request.windowLeaseId.slice(prefix.length)
    &&!row.windows.has(request.windowLeaseId)&&!retiredWindow(row,sequence),'Invalid adopted window sequence.');
   row.windows.set(request.windowLeaseId,output);adoptedReceipts.set(publicReply,request);return publicReply;
  },
  retire(value){
   if(peerRetired){
    try{
     const issued=adoptedReceipts.get(value),request=captureRequest(value);
     requireValue(issued&&sameSource(issued,request)&&issued.windowLeaseId===request.windowLeaseId,
      'Retirement of a lost peer requires the exact adopted source or window receipt.');
     const output=request.windowLeaseId?sources.get(request.sourceLeaseId)?.windows.get(request.windowLeaseId):null;if(output)output.samples=null;
     if(peerReceipt)return Promise.resolve(peerReceipt);
     if(peerFlight)return peerFlight.then(()=>peerReceipt);
     return Promise.reject(fail('WORKER_RETIRED','Captured source Worker retirement is awaiting acknowledgement.'));
    }catch(error){return Promise.reject(error);}
   }
   let row,request;try{({row,request}=adopted(value));requireValue(canPost(),'Captured Worker retired; a control cannot create another engine.');}
   catch(error){return Promise.reject(error);}
   const key=requestIdentity(request),control=row.control,old=pendingKeys.get(key);
   const post=p=>{
    // This owner, not the public getter-only receipt, drops the sample view.
    // Callers reach post only after source/window validation; the funded
    // record and IDs remain here across post refusal/NACK until the real ACK.
    const output=request.windowLeaseId?row.windows.get(request.windowLeaseId):null;if(output)output.samples=null;
    worker.postMessage({sourceSamplesControl:{ticket:p.ticket,action:'retire',workerEpoch:control.workerEpoch,serviceId:control.serviceId,
     nonce:control.nonce,sourceNonce:control.sourceNonce,request}});
   };
   // A lost ACK is retried on the same pre-funded record/ticket. Fast repeated
   // calls do not allocate a list of new controls while the peer is occupied.
   if(old){try{post(old);}catch(error){return Promise.reject(error);}return old.promise;}
   if(request.windowLeaseId&&!row.windows.has(request.windowLeaseId)){
    if(retiredWindow(row,windowSequence(request)))return Promise.resolve({retired:true});
    return Promise.reject(fail('SOURCE_LEASE_NOT_ADOPTED','Window receipt was not adopted.'));
   }
   if(!request.windowLeaseId&&row.retired)return Promise.resolve({retired:true});
   const ticket=++serial,p={row,request,key,ticket};p.promise=new Promise((resolve,reject)=>{p.resolve=resolve;p.reject=reject;});
   pending.set(ticket,p);pendingKeys.set(key,p);
   try{post(p);}catch(error){pending.delete(ticket);pendingKeys.delete(key);p.reject(error);}return p.promise;
  },
  beginOriginalClose(imageId){for(const row of sources.values())if(imageId===undefined||row.request.bindingOriginal.imageId===imageId)row.closing=true;},
  accept(packet){
   const confirmed=packet?.sourceSamplesServiceClosedAck;
   if(confirmed){const waiting=closingServices.get(confirmed.serviceId);
    if(waiting&&waiting.workerEpoch===confirmed.workerEpoch&&waiting.nonce===confirmed.nonce&&waiting.closure===confirmed.closure
     &&sameBinding(waiting.bindingOriginal,confirmed.bindingOriginal))finishClosure(confirmed);return true;}
   const c=packet?.sourceSamplesServiceClosed;
   if(c){const matching=[...sources.values()].filter(row=>row.control.workerEpoch===c.workerEpoch&&row.control.serviceId===c.serviceId
     &&row.control.nonce===c.nonce&&sameBinding(row.request.bindingOriginal,c.bindingOriginal));
    if(!matching.length||typeof c.closure!=='string'||!c.closure)return true;
    const legitimate=matching.every(row=>(row.closing||row.retired)&&[...row.windows.keys()].every(windowLeaseId=>[...pending.values()]
     .some(p=>p.row===row&&p.request.windowLeaseId===windowLeaseId)));
    if(!legitimate)return true;
    closingServices.set(c.serviceId,c);try{sendClosureAck(c);}catch{}return true;
   }
   const a=packet?.sourceSamplesControlAck;if(!a)return false;const p=pending.get(a.ticket);
   if(!p){const waiting=closingServices.get(a.serviceId);if(waiting?.ticket===a.ticket&&waiting.workerEpoch===a.workerEpoch&&waiting.nonce===a.nonce&&a.failed)waiting.error=decode(a.error);return true;}const control=p.row.control;
   if(a.workerEpoch!==control.workerEpoch||a.serviceId!==control.serviceId||a.nonce!==control.nonce||a.sourceNonce!==control.sourceNonce)return true;
   if(a.requestIdentity!==p.key){pending.delete(a.ticket);pendingKeys.delete(p.key);p.reject(fail('WORKER_MESSAGE_FAILED','Source control ACK binding differs.'));return true;}
   pending.delete(a.ticket);pendingKeys.delete(p.key);if(a.failed)p.reject(decode(a.error));else{if(p.request.windowLeaseId){const output=p.row.windows.get(p.request.windowLeaseId);if(output)output.samples=null;p.row.windows.delete(p.request.windowLeaseId);acknowledgeWindow(p.row,windowSequence(p.request));}else p.row.retired=true;p.resolve(a.result);}return true;
  },
  close(){
   if(closeFlight)return closeFlight;link.beginOriginalClose();const task=(async()=>{
    for(const c of [...closingServices.values()])sendClosureAck(c);
    for(const row of [...sources.values()]){for(const windowLeaseId of [...row.windows.keys()])await link.retire({...row.request,windowLeaseId});if(!row.retired)await link.retire(row.request);}
   })();closeFlight=task;task.then(()=>{closeFlight=null;},()=>{closeFlight=null;});return task;
  },
  peerUnavailable(){
   peerRetired=true;for(const p of pending.values())p.reject(fail('WORKER_RETIRED','Captured source Worker is unavailable.'));
   pending.clear();pendingKeys.clear();
  },
  peerTerminated(certificate){
   requireValue(certificate?.terminated===true&&['node-worker-exit','browser-terminate-requested'].includes(certificate.kind),'A private transport termination certificate is required.');
   if(peerReceipt)return Promise.resolve();
   link.peerUnavailable();
   if(peerFlight)return peerFlight;
   const task=(async()=>{await ack(()=>onPeerRetire({sources:[...sources.values()].map(row=>row.request),certificate}));
    for(const row of sources.values())for(const output of row.windows.values())output.samples=null;sources.clear();closingServices.clear();
    peerReceipt=Object.freeze({retired:true,peerRetirement:certificate.kind});
    worker=null;canPost=()=>false;onPeerRetire=null;
   })();
   peerFlight=task;task.then(()=>{peerFlight=null;},()=>{peerFlight=null;});return task;
  },
  get state(){return{sources:sources.size,windows:[...sources.values()].reduce((n,row)=>n+row.windows.size,0),activeSources:[...sources.values()].filter(row=>!row.retired).length,
   pending:pending.size,pendingServiceClosures:closingServices.size,peerRetired};},
 };
 return link;
}
