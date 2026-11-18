import {withRetirementOwner} from './unified-engine/src/owner-retirement-error.js';

const invalid=message=>Object.assign(Error(message),{code:'INVALID_INPUT'});
const busy=()=>Object.assign(Error('Retained histogram retirement was not acknowledged.'),{code:'BUSY'});
const cancelled=()=>Object.assign(Error('The histogram intention changed before retention.'),{code:'CANCELLED'});
const valid=b=>b&&b.identity!==undefined&&b.identity!==null&&typeof b.intention==='string'&&[8,16].includes(b.depth);
const matches=(a,b)=>a?.identity===b?.identity&&a?.intention===b?.intention&&a?.depth===b?.depth;

// Only completed aggregates and bounded local samples enter this bank. No
// Source, reader, Worker, canvas or numerical engine is captured by an entry.
function buffersOf(value,result=new Set(),visited=new Set()){
 if(!value||typeof value!=='object'||visited.has(value))return result;
 visited.add(value);
 if(ArrayBuffer.isView(value)){result.add(value.buffer);return result;}
 for(const child of Object.values(value))buffersOf(child,result,visited);
 return result;
}
function bufferParts(value){
 const parts=[value?.whole,value?.nativeWhole,value?.local&&{data:value.local.data,pixels:value.local.pixels},value?.local?.native].filter(Boolean).map(part=>buffersOf(part));
 return parts.length?parts:[buffersOf(value)];
}

// The allocator is the existing Original's external-memory allocator. Shared
// array buffers keep one credit group even when both depth entries use them.
// The caller drops its active aggregate references before deactivate/dispose.
export function createRetainedChannelHistograms({reserve,onRevoke=()=>{}}={}){
 const slots=new Map(),retiring=new Set(),protectedEntries=new Set(),bufferGroups=new Map(),groupsOwned=new Set(),flights=new Set();
 let context=null,epoch=0,closed=false,disposal=null,queue=Promise.resolve(),refusalSequence=0;
 const sameIntention=b=>context?.identity===b?.identity&&context?.intention===b?.intention;
 function retire(record){if(!record)return;record.eligible=false;retiring.add(record);if(slots.get(record.binding.depth)===record)slots.delete(record.binding.depth);}
 function dropGroupReferences(group){for(const buffer of group.buffers)if(bufferGroups.get(buffer)===group)bufferGroups.delete(buffer);group.buffers.clear();}
 function abandonGroup(group,{retiring:peerRetiring=false}={}){
  if(group.abandoned)return;
  for(const record of group.records){retire(record);protectedEntries.delete(record);}
  // The callback has only borrowed access to this Set and must release its
  // matching active data/jobs/export references before acknowledging locally.
  const ack=onRevoke({buffers:group.buffers,retiring:peerRetiring});
  if(ack&&typeof ack.then==='function'){void Promise.resolve(ack).catch(()=>{});throw invalid('Histogram invalidation must be synchronous.');}
  if(ack===false||ack===0)throw busy();
  for(const record of group.records){record.value=null;record.buffers.clear();record.dropPending?.();}
  dropGroupReferences(group);group.abandoned=true;group.retiring=true;
 }
 function releaseRecord(record){
  if(record.releasing)return record.releasing;
  const task=(async()=>{
   record.value=null;record.buffers.clear();record.dropPending?.();
   let failed=false,primary;
   for(const group of record.groups)try{
    if(group.records.size===1){
     abandonGroup(group);
     const ack=await group.release();if(ack===false||ack===0)throw busy();
     groupsOwned.delete(group);
    }
    group.records.delete(record);record.groups.delete(group);
   }catch(error){if(!failed){failed=true;primary=error;}}
   if(failed)throw primary;
   retiring.delete(record);
  })().catch(primary=>{record.failureSequence=++refusalSequence;record.failure=withRetirementOwner(primary,retryOwner,primary);throw record.failure;}).finally(()=>{record.releasing=null;});
  record.releasing=task;return task;
 }
 async function drain({skipRefusalsAfter=Infinity}={}){let failed=false,primary;for(const record of [...retiring])if(!record.inFlight&&!protectedEntries.has(record))try{if(record.failureSequence>skipRefusalsAfter)throw record.failure;await releaseRecord(record);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}
 async function deactivate(){const sequence=refusalSequence,waiting=[...flights];protectedEntries.clear();if(waiting.length)await Promise.allSettled(waiting);protectedEntries.clear();await drain({skipRefusalsAfter:sequence});}
 const retryOwner={dispose:()=>drain()};
 function bind(binding){
  if(!valid(binding)){context=null;epoch++;for(const record of [...slots.values()])retire(record);return false;}
  if(!sameIntention(binding)){epoch++;for(const record of [...slots.values()])retire(record);}
  context={...binding};return true;
 }
 const owner={
  bind,
  acquire(binding){
   if(closed||!valid(binding)||!sameIntention(binding)||retiring.size)return null;
   const record=slots.get(binding.depth);if(!record?.eligible||!matches(record.binding,binding))return null;
   protectedEntries.add(record);return record.value;
  },
  park(binding,value,{isCurrent=()=>true}={}){
   if(closed||!valid(binding)||typeof reserve!=='function')return Promise.resolve(false);
   bind(binding);const version=epoch;
   const task=queue.catch(()=>{}).then(async()=>{
    await drain();if(closed||version!==epoch||!sameIntention(binding)||!isCurrent())throw cancelled();
    const previous=slots.get(binding.depth),buffers=buffersOf(value),groups=new Set();
    for(const buffer of buffers){const group=bufferGroups.get(buffer);if(group){if(group.retiring)throw busy();groups.add(group);}}
    if(previous?.eligible&&matches(previous.binding,binding)&&buffers.size===previous.buffers.size&&[...buffers].every(buffer=>previous.buffers.has(buffer))){previous.value=value;protectedEntries.add(previous);return true;}
    let parts=bufferParts(value);
    const record={binding:{...binding},value,buffers,groups,eligible:false,releasing:null,inFlight:true,dropPending(){value=null;for(const part of parts)part.clear();parts=[];}};
    for(const g of groups)g.records.add(record);
    retiring.add(record);
    try{
     // Whole RGB/native and local RGB/native aggregates have independent
     // lifetimes. A changed local rectangle cannot pin an obsolete window
     // merely because it still shares the completed whole-image counts.
     for(const part of parts){
      const missing=new Set([...part].filter(buffer=>!bufferGroups.has(buffer))),bytes=[...missing].reduce((sum,buffer)=>sum+buffer.byteLength,0);
      if(!Number.isSafeInteger(bytes))throw invalid('Retained histogram byte count is invalid.');
      if(bytes){
       const group={release:null,buffers:missing,bytes,records:new Set([record]),retiring:false,abandoned:false};record.groups.add(group);groupsOwned.add(group);
       try{const release=await reserve(bytes,{sourceIdentity:binding.identity,
        onOwner(owner){if(typeof owner?.dispose!=='function')throw invalid('A captured histogram owner is required before admission.');group.release=()=>owner.dispose();},
        onPeerUnavailable:event=>abandonGroup(group,event),
       });if(!group.release)throw invalid('The retained histogram owner was not adopted before admission.');if(typeof release!=='function')throw invalid('The retained histogram needs a retryable retirement handle.');group.release=release;}
       catch(primary){if(!group.release){record.groups.delete(group);groupsOwned.delete(group);dropGroupReferences(group);}throw primary;}
       if(!group.abandoned)for(const buffer of group.buffers)bufferGroups.set(buffer,group);
      }
      if(closed||version!==epoch||!sameIntention(binding)||!isCurrent()||record.value===null)throw cancelled();
     }
    }catch(primary){record.inFlight=false;try{await releaseRecord(record);}catch(cleanup){throw withRetirementOwner(primary,retryOwner,cleanup);}throw primary;}
    record.inFlight=false;record.dropPending=null;record.eligible=true;retiring.delete(record);
    // park describes the complete currently referenced bundle. A new lease
    // covers any newly retained arrays before the previous credit is retired.
    if(previous){protectedEntries.delete(previous);retire(previous);}
    slots.set(binding.depth,record);protectedEntries.add(record);await drain();return true;
   });queue=task;
   flights.add(task);void task.then(()=>flights.delete(task),()=>flights.delete(task));return task;
  },
  // Called after the UI has discarded its old data/plot/summary references.
  deactivate,
  drain,
  dispose(){
   if(disposal)return disposal;closed=true;epoch++;context=null;
   const sequence=refusalSequence,task=(async()=>{await Promise.allSettled([...flights]);for(const record of [...slots.values()])retire(record);protectedEntries.clear();await drain({skipRefusalsAfter:sequence});})();
   disposal=task;void task.catch(()=>{if(disposal===task)disposal=null;});return task;
  },
  snapshot(){return{slots:slots.size,retiring:retiring.size,protected:protectedEntries.size,flights:flights.size,bytes:[...groupsOwned].reduce((sum,g)=>sum+g.bytes,0),referencedBuffers:bufferGroups.size,closed};},
 };
 return owner;
}
