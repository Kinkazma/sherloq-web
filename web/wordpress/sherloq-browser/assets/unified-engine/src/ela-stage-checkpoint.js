import "../../runtime-context.js?v=0.14.5";
import {requireValue} from './errors.js';

// Scientific stage arrays are authoritative, never part of the optional cache.
// Views sharing a buffer have one backing owner; memo hits make no copies.
export function createElaStageCheckpoint(budget){
 const entries=new Map(),buffers=new Map();let releaseEnvelope,capacity=0,bytes=0,disposed=false,phase;
 const collect=(value,found=new Set(),seen=new Set())=>{if(!value||typeof value!=='object'||seen.has(value))return found;seen.add(value);if(ArrayBuffer.isView(value)){found.add(value.buffer);return found;}for(const item of Object.values(value))collect(item,found,seen);return found;};
 function own(value){const unique=collect(value),fresh=[...unique].filter(buffer=>!buffers.has(buffer)),additional=fresh.reduce((sum,buffer)=>sum+buffer.byteLength,0);requireValue(bytes+additional<=capacity,'ELA checkpoint exceeds its declared stage envelope');
  for(const buffer of fresh){buffers.set(buffer,budget.registerBacking?.('array-buffer',buffer.byteLength,{owner:'ela',label:'ela-stage-checkpoint',identity:buffer}));bytes+=buffer.byteLength;}
  return value;
 }
 const api={
  ensure(cells){requireValue(!disposed,'ELA checkpoint disposed');const needed=cells*4096;requireValue(!capacity||capacity===needed,'ELA checkpoint grid changed');if(!releaseEnvelope){releaseEnvelope=budget.reserve(needed);capacity=needed;}},
  async memo(key,compute){requireValue(!disposed,'ELA checkpoint disposed');if(entries.has(key))return entries.get(key);const value=own(await compute());entries.set(key,value);return value;},
  async memoMany(names,compute){const missing=names.filter(name=>!entries.has(name));if(missing.length){const values=await compute(missing,async(name,value)=>{entries.set(name,own(value));});missing.forEach((name,i)=>{if(!entries.has(name))entries.set(name,own(values[i]));});}return names.map(name=>entries.get(name));},
  getPhase(identity){if(phase?.identity!==identity)return null;return phase.state;},
  async beginPhase(identity){if(phase?.identity!==identity){await phase?.state?.dispose();phase={identity,state:null};}},
  setPhase(identity,state){requireValue(phase?.identity===identity,'ELA Ghost phase owner changed');phase.state=state;},
  async finishPhase(identity){if(phase?.identity===identity){const previous=phase;phase=null;await previous.state?.dispose();}},
  compact(value){const keep=collect(value);entries.clear();entries.set('prepared',value);let released=0;for(const [buffer,unregister]of buffers)if(!keep.has(buffer)){const retired=unregister?.();buffers.delete(buffer);bytes-=buffer.byteLength;released+=retired??buffer.byteLength;}const retained=releaseEnvelope.split(bytes);releaseEnvelope();releaseEnvelope=retained;capacity=bytes;if(released)budget.notifyBackingRelease?.('array-buffer',released);},
  snapshot(){return {stages:[...entries.keys()],stageBytes:bytes,stageEnvelopeBytes:capacity,ghost:phase?.state?{committedQualities:phase.state.committed.reduce((a,b)=>a+b,0),aggregatedQualities:phase.state.quality}:null};},
  async dispose(){if(disposed)return;disposed=true;try{await phase?.state?.dispose();}finally{phase=null;entries.clear();let retired=0;for(const [buffer,unregister]of buffers)retired+=unregister?.()??buffer.byteLength;buffers.clear();releaseEnvelope?.();releaseEnvelope=null;if(retired)budget.notifyBackingRelease?.('array-buffer',retired);bytes=0;}}
 };return api;
}
