import "../../runtime-context.js?v=0.33.2";
import {EngineError,requireValue,checkAbort} from './errors.js';
import {withRetirementOwner} from './owner-retirement-error.js';

// Canonical local API. Never cloned, serialized, persisted or sent to a Worker.
export const CAPTURED_OWNERSHIP_CONTROL=Symbol('captured-ownership-control');
const accepted=value=>{if(value===false||value===0)throw value;return value;};
const stable=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const same=(a,b)=>stable(a)===stable(b);
const certified=value=>{requireValue(value?.terminated===true&&['node-worker-exit','browser-terminate-requested'].includes(value.kind),'The captured peer retirement is not certified.');return value;};

// One registry belongs to one engine client. `execute` must post to the exact
// peer supplied here, with no ensure/replacement; tickets are adopted before
// the transport is entered and before any ownership reply is published.
export function createCapturedOwnershipRegistry({isPeerCurrent,getBinding,execute,requestPeerRetirement}={}){
 requireValue([isPeerCurrent,getBinding,execute,requestPeerRetirement].every(fn=>typeof fn==='function'),'Captured ownership requires explicit peer/control adapters.');
 const peers=new Map(),issued=new WeakSet(),drainers=new WeakMap(),bindings=new WeakMap();let nextTicket=0;
 function rowFor(peer){let row=peers.get(peer);if(!row){row={peer,controls:new Set(),retiring:false,certificate:null,resume:null,drain:null};peers.set(peer,row);}return row;}
 async function proof(row){if(!row.certificate)void Promise.resolve(requestPeerRetirement(row.peer)).catch(()=>{});requireValue(row.certificate,'Captured retirement has no certificate provider.');return certified(await(typeof row.certificate==='function'?row.certificate():row.certificate));}
 function create({peer,purpose,binding,ownerId,onOwner,onPeerUnavailable}={}){
  requireValue(peer&&isPeerCurrent(peer)&&['final-result','external-memory'].includes(purpose)&&binding&&typeof ownerId==='string'&&ownerId&&typeof onOwner==='function'&&typeof onPeerUnavailable==='function','A live Original and an adopted local owner are required.');
  requireValue(![...peers.values()].some(row=>row.peer!==peer&&row.controls.size),'An earlier captured peer still owns unresolved tickets.');
  const row=rowFor(peer);requireValue(!row.retiring,'Captured peer is retiring.');
  requireValue(same(getBinding(peer,binding.imageId),binding),'Captured ownership needs the actual loaded Original.');
  const tokens=new Map(),leases=new Map(),retiredTokens=new Map(),retiredLeases=new Set(),pendingAcquisitions=new Map(),retiredAcquisitions=new Set(),pending=new Set(),uncertain=new Set();
  let closing=false,closed=false,disposing=null,localRetired=false,localRetiring=null;
  const identity=Object.freeze({...binding});
  async function retireLocal(){if(localRetired)return;if(localRetiring)return localRetiring;const task=Promise.resolve().then(()=>{const value=onPeerUnavailable();if(value&&typeof value.then==='function'){void Promise.resolve(value).catch(()=>{});throw new EngineError('INVALID_INPUT','Captured local invalidation must not await RPC/read retirement.');}accepted(value);localRetired=true;});localRetiring=task;try{return await task;}finally{localRetiring=null;}}
  function acknowledgeGone(){for(const [id,value]of tokens)retiredTokens.set(id,value);tokens.clear();for(const id of leases.keys())retiredLeases.add(id);leases.clear();for(const [token,entry]of pendingAcquisitions){entry.remaining.surfaces.clear();entry.remaining.tables.clear();retiredAcquisitions.add(token);}pendingAcquisitions.clear();uncertain.clear();}
  async function gone(){await retireLocal();await proof(row);acknowledgeGone();}
  const capturedGone=()=>gone().catch(primary=>{throw withRetirementOwner(primary,control,primary);});
  function adopt(ticket,reply){
   ticket.responded=true;ticket.reply=reply;
   if(!Object.hasOwn(reply,'result'))return;
   const output=reply.result;
   if(ticket.method==='reserveExternalMemory'&&output&&typeof output==='object'&&typeof output.id==='string'&&output.id)leases.set(output.id,{...output});
   if(ticket.method==='finalResultLifetime'&&ticket.args[0].action==='park'&&output&&typeof output.token==='string'&&output.token)tokens.set(output.token,{token:output.token,ownerId,key:ticket.args[0].key,binding:identity,resources:ticket.args[0].resources});
  }
  function validate(ticket,output){
   if(ticket.method==='reserveExternalMemory'){requireValue(output&&typeof output.id==='string'&&output.id&&output.bytes===ticket.args[0].bytes,'Captured reservation reply differs.');return;}
   if(['releaseExternalMemory','releaseSurface','releaseTable'].includes(ticket.method))return accepted(output);
   const request=ticket.args[0];requireValue(output?.acknowledged===true&&output.ownerId===ownerId,'Captured final transition was not acknowledged.');
   const acquired=request.action==='park'?output.acquisition:request.action==='acquire'?output:null,old=ticket.previous;
   if(acquired){requireValue(old&&acquired.token===old.token&&acquired.ownerId===ownerId,'Acquired captured token differs.');if(acquired.hit)requireValue(same(acquired.resources,old.resources),'Acquired captured resources differ.');else requireValue(acquired.retired===true,'A captured final miss needs retirement acknowledgement.');}
   if(request.action==='park'&&output.parked!==false)requireValue(output.parked===true&&typeof output.token==='string'&&output.token&&same(output.resources,request.resources),'Parked captured resources differ.');
   if(request.action==='release')requireValue(output.retired===true&&output.token===request.token,'Captured final release differs.');
  }
  function commit(ticket,output){
   if(ticket.method==='releaseExternalMemory'){leases.delete(ticket.args[0]);retiredLeases.add(ticket.args[0]);return;}
   if(ticket.method!=='finalResultLifetime')return;
   const request=ticket.args[0],acquired=request.action==='park'?output.acquisition:request.action==='acquire'?output:null;
   if(acquired){tokens.delete(ticket.previous.token);retiredTokens.set(ticket.previous.token,ticket.previous);if(acquired.hit){const resources=Object.fromEntries(['surfaces','tables'].map(kind=>[kind,(acquired.resources[kind]??[]).map(d=>({...d}))]));pendingAcquisitions.set(ticket.previous.token,{token:ticket.previous.token,resources,signal:ticket.signal,state:'pending',remaining:Object.fromEntries(['surfaces','tables'].map(kind=>[kind,new Map(resources[kind].map(d=>[d.id,d]))])),flight:null});}}
   if(request.action==='release'){const old=tokens.get(request.token);tokens.delete(request.token);if(old)retiredTokens.set(request.token,old);}
  }
  async function command(method,args,{signal,retirement=false}={}){
   checkAbort(signal);if(closed)throw new EngineError('DISPOSED','Captured ownership is closed.');
   if(closing&&!retirement)throw new EngineError('DISPOSED','Captured ownership is closing.');
   if(row.retiring||!isPeerCurrent(peer))throw new EngineError('WORKER_RETIRED','The captured peer is unavailable for admission.');
   if(!retirement)requireValue(same(getBinding(peer,identity.imageId),identity),'Captured Original changed before admission.');
   const request=args[0],previous=method==='finalResultLifetime'?tokens.get(request.token??request.take?.token):null;
   const ticket={id:++nextTicket,peer,control,method,args,previous,signal,posted:false,responded:false,reply:null,done:null};ticket.accept=reply=>adopt(ticket,reply);issued.add(ticket);pending.add(ticket);
   const task=(async()=>{
    try{const output=await execute(method,args,{peer,ticket,signal});
     if(!ticket.responded)adopt(ticket,{result:output});
     try{validate(ticket,output);}catch(primary){uncertain.add(ticket);void Promise.resolve().then(()=>requestPeerRetirement(peer)).catch(()=>{});throw primary;}
     commit(ticket,output);return output;
    }catch(primary){
     if(ticket.posted&&!ticket.responded)uncertain.add(ticket);
     if(tokens.size||leases.size||pendingAcquisitions.size||uncertain.size||[...pending].some(other=>other!==ticket&&other.posted&&!other.responded))throw withRetirementOwner(primary,control,primary);throw primary;
    }finally{pending.delete(ticket);}
   })();ticket.done=task;return task;
  }
  function disposeLocal(){
   if(closed)return Promise.resolve();if(disposing)return disposing;closing=true;
   const task=(async()=>{
    await Promise.allSettled([...pending].map(ticket=>ticket.done));await retireLocal();
    if(row.retiring||!isPeerCurrent(peer)||uncertain.size)await gone();
    else{let failed=false,primary;for(const token of [...tokens.keys()])try{await control.finalResultLifetime({action:'release',token,ownerId});}catch(error){if(!failed){failed=true;primary=error;}}for(const token of [...pendingAcquisitions.keys()])try{await control.abandonFinalAcquisition(token);}catch(error){if(!failed){failed=true;primary=error;}}for(const id of [...leases.keys()])try{await control.releaseExternalMemory(id);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}
    closed=true;row.controls.delete(control);
   })().catch(primary=>{throw withRetirementOwner(primary,control,primary);});disposing=task;void task.finally(()=>{if(disposing===task)disposing=null;}).catch(()=>{});return task;
  }
  const control={
   finalResultLifetime(request,hooks={}){
    requireValue(purpose==='final-result'&&request?.ownerId===ownerId,'Final command belongs to another captured owner.');
    const old=tokens.get(request.token??request.take?.token)??retiredTokens.get(request.token??request.take?.token);
    if(request.action==='park'){requireValue(!request.binding||same(request.binding,identity),'Final command belongs to another captured Original.');const held=new Set([...pendingAcquisitions.values()].flatMap(entry=>[...entry.resources.surfaces,...entry.resources.tables].map(d=>d.id)));requireValue([...(request.resources?.surfaces??[]),...(request.resources?.tables??[])].every(d=>!held.has(d.id)),'A final acquisition must be adopted before it can be parked again.');}
    else requireValue(old,'Final token was not adopted by this captured owner.');
    if(row.retiring||!isPeerCurrent(peer)){
     if(request.action==='park')return Promise.reject(new EngineError('WORKER_RETIRED','Cannot park a final on a retired peer.'));
     return capturedGone().then(()=>request.action==='release'?{acknowledged:true,token:request.token,ownerId,retired:true}:{acknowledged:true,token:request.token,ownerId,key:old.key,binding:old.binding,hit:false,retired:true});
    }
    if(request.action==='release'&&!tokens.has(request.token))return Promise.resolve({acknowledged:true,token:request.token,ownerId,retired:true});
    if(request.action==='acquire'&&!tokens.has(request.token))return Promise.resolve({acknowledged:true,token:request.token,ownerId,key:old.key,binding:old.binding,hit:false,retired:true});
    return command('finalResultLifetime',[request],{...hooks,retirement:request.action==='release'});
   },
   acceptFinalAcquisition(token){
    const entry=pendingAcquisitions.get(token);
    requireValue(purpose==='final-result'&&entry&&entry.state==='pending'&&!entry.signal?.aborted&&!entry.flight&&!closing&&!closed&&!row.retiring&&isPeerCurrent(peer)&&same(getBinding(peer,identity.imageId),identity),'Final acquisition is not admitted for synchronous adoption.');
    pendingAcquisitions.delete(token);return{acknowledged:true,ownerId,token,transferred:true};
   },
   abandonFinalAcquisition(token){
    requireValue(purpose==='final-result','Final acquisition belongs to another captured purpose.');
    const receipt=()=>({acknowledged:true,ownerId,token,retired:true}),entry=pendingAcquisitions.get(token);
    if(!entry){requireValue(retiredAcquisitions.has(token),'Final acquisition was not adopted by this captured control.');return Promise.resolve(receipt());}
    if(entry.flight)return entry.flight;entry.state='retiring';
    const task=(async()=>{
     if(row.retiring||!isPeerCurrent(peer)){await gone();return receipt();}
     let failed=false,primary;
     for(const [kind,method]of [['surfaces','releaseSurface'],['tables','releaseTable']])for(const id of [...entry.remaining[kind].keys()])try{await command(method,[id],{retirement:true});entry.remaining[kind].delete(id);}catch(error){if(!failed){failed=true;primary=error;}}
     // A lost child response can be settled only by this peer's certificate,
     // never by a lookup/NOT_FOUND on a replacement Worker.
     if(row.retiring||!isPeerCurrent(peer)){try{await gone();return receipt();}catch(cleanup){if(failed)throw withRetirementOwner(primary,control,cleanup);throw cleanup;}}
     if(failed)throw primary;
     pendingAcquisitions.delete(token);retiredAcquisitions.add(token);return receipt();
    })().catch(primary=>{throw withRetirementOwner(primary,control,primary);});entry.flight=task;void task.finally(()=>{if(entry.flight===task)entry.flight=null;}).catch(()=>{});return task;
   },
   reserveExternalMemory(request,hooks={}){requireValue(purpose==='external-memory'&&Number.isSafeInteger(request?.bytes)&&request.bytes>0,'A captured external workspace is required.');return command('reserveExternalMemory',[request],hooks);},
   releaseExternalMemory(id){
    requireValue(purpose==='external-memory'&&(leases.has(id)||retiredLeases.has(id)),'External lease was not adopted by this captured owner.');
    if(retiredLeases.has(id))return Promise.resolve();
    return row.retiring||!isPeerCurrent(peer)?capturedGone():command('releaseExternalMemory',[id],{retirement:true});
   },
   dispose(){return row.retiring&&row.resume?row.resume().then(disposeLocal):disposeLocal();},
   snapshot(){return{purpose,ownerId,closing:closing||!isPeerCurrent(peer)||!same(getBinding(peer,identity.imageId),identity),closed,retiring:row.retiring,localRetired,pending:pending.size,tokens:tokens.size,leases:leases.size,acquisitions:pendingAcquisitions.size,acquisitionChildren:[...pendingAcquisitions.values()].reduce((n,entry)=>n+entry.remaining.surfaces.size+entry.remaining.tables.size,0),uncertain:uncertain.size};},
  };
  bindings.set(control,identity);drainers.set(control,disposeLocal);row.controls.add(control);try{const ack=onOwner(control);if(ack&&typeof ack.then==='function')void Promise.resolve(ack).catch(()=>{});requireValue(ack!==false&&ack!==0&&!(ack&&typeof ack.then==='function'),'Captured owner registration must be synchronous.');}catch(primary){row.controls.delete(control);closed=true;throw primary;}
  return control;
 }
 return{
  create,
  hasPeer:peer=>(peers.get(peer)?.controls.size??0)>0,
  ownsTicket:ticket=>!!ticket&&issued.has(ticket),
  posted(ticket){requireValue(issued.has(ticket),'Unknown captured command ticket.');ticket.posted=true;},
  response(ticket,reply){requireValue(issued.has(ticket),'Unknown captured reply ticket.');return adoptReply(ticket,reply);},
  peerUnavailable(peer,{certificate,resume}={}){const row=rowFor(peer);row.retiring=true;if(certificate)row.certificate=certificate;if(resume)row.resume=resume;},
  peerRetiring(peer,{certificate,resume}={}){
   const row=rowFor(peer);row.retiring=true;if(certificate)row.certificate=certificate;if(resume)row.resume=resume;
   if(row.drain)return row.drain;const task=allAcknowledged([...row.controls].map(control=>drainers.get(control)())).then(()=>{if(!row.controls.size&&peers.get(peer)===row)peers.delete(peer);});row.drain=task;void task.finally(()=>{if(row.drain===task)row.drain=null;}).catch(()=>{});return task;
  },
  closeImage(imageId){return allAcknowledged([...peers.values()].flatMap(row=>[...row.controls].filter(control=>bindings.get(control)?.imageId===imageId).map(control=>control.dispose())));},
  closeAll(){return allAcknowledged([...peers.values()].flatMap(row=>[...row.controls].map(control=>control.dispose())));},
  snapshot(){return[...peers.values()].map(row=>({retiring:row.retiring,controls:row.controls.size}));},
 };
 async function allAcknowledged(tasks){const results=await Promise.allSettled(tasks),failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;}
 function adoptReply(ticket,reply){return ticket.control&&ticket.accept?.(reply);}
}
