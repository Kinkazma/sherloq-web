import "../../runtime-context.js?v=0.30.0";
import {requireValue} from './errors.js';
import {retireCompositeOwners} from './composite-owner-release.js';

function buffersOf(value,found=new Set(),seen=new Set()){
 if(!value||typeof value!=='object'||seen.has(value))return found;seen.add(value);
 if(ArrayBuffer.isView(value)){found.add(value.buffer);return found;}
 for(const child of Object.values(value))buffersOf(child,found,seen);return found;
}
// Authoritative scientific stages, never an optional display proxy. Failed
// backing ACKs keep their arrays and envelope reachable for the next retry.
export function createScopedElaStages(budget){
 const entries=new Map(),buffers=new Map(),pendingValues=new Set();let envelope,capacity=0,bytes=0,closed=false,retiring=false,retirement;
 function own(value){
  pendingValues.add(value);const fresh=[...buffersOf(value)].filter(buffer=>!buffers.has(buffer)),additional=fresh.reduce((n,b)=>n+b.byteLength,0);
  requireValue(bytes+additional<=capacity,'Scoped Native ELA stages exceed their admitted envelope.');
  for(const buffer of fresh){const entry={buffer,bytes:buffer.byteLength,release:null,retired:false,notified:false};buffers.set(buffer,entry);bytes+=buffer.byteLength;entry.release=budget.registerBacking?.('array-buffer',entry.bytes,{owner:'ela',label:'scoped-biomes-scientific-stage',identity:buffer});}
  pendingValues.delete(value);return value;
 }
 return {
  get retiring(){return retiring;},
  ensure(cells){requireValue(!closed&&!retiring,'Scoped ELA stages are retiring.');const needed=cells*4096;requireValue(!capacity||capacity===needed,'Scoped ELA grid changed.');if(!envelope){const free=budget.reserve(needed);capacity=needed;envelope=free;}},
  async memo(key,compute){requireValue(!closed&&!retiring,'Scoped ELA stages are retiring.');if(entries.has(key))return entries.get(key);const value=own(await compute());entries.set(key,value);return value;},
  async memoMany(names,compute){requireValue(!closed&&!retiring,'Scoped ELA stages are retiring.');const missing=names.filter(key=>!entries.has(key));if(missing.length){const values=await compute(missing);requireValue(values.length===missing.length,'Scoped ELA stage count changed.');missing.forEach((key,i)=>entries.set(key,own(values[i])));}return names.map(key=>entries.get(key));},
  snapshot(){return {stages:[...entries.keys()],stageBytes:bytes,stageEnvelopeBytes:capacity};},
  dispose(){if(closed)return Promise.resolve();if(retirement)return retirement;retiring=true;
   const task=(async()=>{
    for(const [buffer,entry]of buffers){if(!entry.retired){entry.retiredBytes=await entry.release?.();entry.retired=true;}if(!entry.notified){if(entry.retiredBytes!==0)budget.notifyBackingRelease?.('array-buffer',entry.retiredBytes??entry.bytes);entry.notified=true;}buffers.delete(buffer);bytes-=entry.bytes;}
    entries.clear();pendingValues.clear();await envelope?.();envelope=null;capacity=0;closed=true;
   })();retirement=task;void task.finally(()=>{if(retirement===task)retirement=null;}).catch(()=>{});return task;
  }
 };
}

export function createScopedElaOwner(budget,fingerprint){
 const stages=new Map(),codecs=new Set(),temporary=new Set(),afterCodecs=new Set();let closed=false,retiring=false,retirement,clock=0;
 const closeCodecs=async()=>{await retireCompositeOwners([...codecs].map(image=>async()=>{await image.rgbRecompression?.dispose();codecs.delete(image);}));await retireCompositeOwners([...temporary].map(owner=>()=>owner.release()));await retireCompositeOwners([...afterCodecs].map(close=>async()=>{await close();afterCodecs.delete(close);}));};
 return {fingerprint,codecs,temporary,afterCodecs,
  async stage(key){
   requireValue(!closed&&!retiring,'Scoped Native ELA owner is retiring.');let entry=stages.get(key);if(entry?.value.retiring){await entry.value.dispose();stages.delete(key);entry=null;}
   if(!entry){if(stages.size>=2){const oldest=[...stages].sort((a,b)=>a[1].last-b[1].last)[0];await oldest[1].value.dispose();stages.delete(oldest[0]);}entry={last:++clock,value:createScopedElaStages(budget)};stages.set(key,entry);}else entry.last=++clock;return entry.value;
  },
  retireCodecs:closeCodecs,
  dispose(){if(closed)return Promise.resolve();if(retirement)return retirement;retiring=true;const task=(async()=>{await closeCodecs();await retireCompositeOwners([...stages].map(([key,entry])=>async()=>{await entry.value.dispose();stages.delete(key);}));closed=true;})();retirement=task;void task.finally(()=>{if(retirement===task)retirement=null;}).catch(()=>{});return task;},
  snapshot(){return {scientificVariants:stages.size,codecDebts:codecs.size,temporaryDebts:temporary.size,parentDebts:afterCodecs.size};}
 };
}
