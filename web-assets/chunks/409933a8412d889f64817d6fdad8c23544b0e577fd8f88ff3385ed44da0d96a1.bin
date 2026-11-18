import "../../runtime-context.js?v=0.33.3";
import {requireValue} from './errors.js';
import {nativeGpuSync,nativeGpuAsync} from './gpu-native-boundary.js';

// A pre-adopted GPU buffer prefix serves both native gradient and HE100. Its
// release callback returns a byte count, so 0 remains a valid retired extent.
export async function retireNativeGpuBufferPrefixes(owner){
 const prefixes=owner.nativePrefixes;if(!prefixes?.size)return;
 let materialized=false;for(const entry of prefixes)if(entry.buffer){materialized=true;if(!entry.destroyed){nativeGpuSync(()=>entry.buffer.destroy());entry.destroyed=true;}}
 if(materialized&&owner.device)try{await nativeGpuAsync(()=>owner.device.queue.onSubmittedWorkDone());}catch(error){if(!owner.deviceDestroyed||!owner.device.lost)throw error;await owner.device.lost;}
 for(const entry of [...prefixes]){if(!entry.backingRetired){entry.retiredBytes=await entry.release?.();entry.backingRetired=true;}if(!entry.notified){if(entry.buffer&&entry.retiredBytes!==0)owner.budget.notifyBackingRelease?.('gpu',entry.retiredBytes??entry.bytes);entry.notified=true;}prefixes.delete(entry);}
}

// Private, per-call proof only. It creates neither admission nor scheduling.
// Expected ports and tickets precede option forwarding: a lost option cannot
// look like an empty, successfully retired GPU attempt.
const tickets=new WeakMap(),caches=new WeakMap(),object=value=>value!==null&&['object','function'].includes(typeof value),ref=value=>typeof WeakRef==='function'?new WeakRef(value):{deref:()=>value};
export function createNativeGpuRetirementObserver(binding,{ports=[]}={}){
 const identity=Object.freeze({...binding}),states=new Map(ports.map(name=>[name,{name,state:'expected',owner:null,tickets:new Set()}]));
 let sealed=false,serial=0,retired=0,transferred=0,retainedCacheTransfers=0;
 const port=name=>{const value=states.get(name);requireValue(value,'Unknown native GPU retirement port.');return value;};
 const owned=token=>{const value=tickets.get(token);requireValue(value?.observer===observer,'A GPU retirement ticket belongs to another call.');return value;};
 const same=(value,owner)=>value.owner?.deref()===owner;
 const observer={
  identity,
  get sealed(){return sealed;},
  hasPort:name=>states.has(name),
  cacheOwner(owner,role){requireValue(!sealed&&object(owner)&&typeof owner.dispose==='function'&&typeof role==='string'&&role.length>0,'A durable GPU cache owner and its real disposal are required.');const token=Object.freeze({});caches.set(token,{observer,owner:ref(owner),role});return token;},
  enter(name,owner){requireValue(!sealed&&object(owner),'An open retirement call and captured owner are required.');const value=port(name);requireValue(value.state==='expected','The GPU retirement port was already entered.');value.state='entered';value.owner=ref(owner);},
  finish(name,owner){const value=port(name);requireValue(!sealed&&value.state==='entered'&&same(value,owner),'The GPU retirement port differs from its captured owner.');value.state='finished';},
  skip(name,owner,reason){requireValue(!sealed&&object(owner)&&typeof reason==='string'&&reason.length>0,'A captured non-entry proof is required.');const value=port(name);requireValue(value.state==='expected'&&!value.tickets.size,'An entered GPU port cannot be marked unentered.');value.state='skipped';value.owner=ref(owner);value.reason=reason;},
  expect(name,caller,label){const value=port(name);requireValue(!sealed&&value.state==='entered'&&object(caller)&&typeof label==='string','An entered GPU port and captured caller are required.');const token=Object.freeze({}),entry={observer,serial:++serial,label,port:value,state:'expected',caller:ref(caller),owner:null,unproven:false};tickets.set(token,entry);value.tickets.add(entry);return token;},
  adopt(token,owner){const value=owned(token);requireValue(!sealed&&value.state==='expected'&&object(owner),'A GPU prefix owner must be adopted once before allocation.');value.owner=ref(owner);value.state='owned';
   return Object.freeze({
    acknowledge(actualOwner){requireValue(same(value,actualOwner)&&['owned','acknowledged'].includes(value.state),'The GPU ACK differs from its captured owner.');if(!value.unproven&&value.state==='owned'){value.state='acknowledged';value.port.tickets.delete(value);retired++;}return!value.unproven;},
    unproven(actualOwner){requireValue(same(value,actualOwner),'The GPU registration owner differs.');value.unproven=true;},
    retainCache(actualOwner,cacheToken){const cache=caches.get(cacheToken);requireValue(!sealed&&same(value,actualOwner)&&cache?.observer===observer&&cache.owner.deref()&&!value.unproven&&value.state==='owned','The GPU prefix cannot transfer to an unproven cache owner.');retainedCacheTransfers++;},
    transfer(actualOwner,cacheToken){const cache=caches.get(cacheToken);requireValue(!sealed&&same(value,actualOwner)&&cache?.observer===observer&&cache.owner.deref()&&!value.unproven&&value.state==='owned','The GPU prefix cannot transfer an unproven retirement.');value.state='transferred';value.port.tickets.delete(value);transferred++;}
   });
  },
  seal(){sealed=true;return observer.snapshot();},
  snapshot(){const values=[...states.values()],pending=values.reduce((n,value)=>n+value.tickets.size,0),complete=sealed&&values.every(value=>['finished','skipped'].includes(value.state))&&pending===0&&serial===retired+transferred;return Object.freeze({acknowledged:complete,identity,ports:Object.freeze(values.map(value=>Object.freeze({name:value.name,state:value.state,reason:value.reason??null}))),tickets:serial,retired,transferred,retainedCacheTransfers,pending});}
 };
 return observer;
}
