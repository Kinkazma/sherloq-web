// Two ordered calendars. All Philox arithmetic and tensor advance remain in
// the common NativeMpsRandom; a short-lived metadata-only clone reserves them.
import {NativeMpsRandom,fillNativeMpsSource} from './random-mps.js';
import {requireValue,checkAbort} from '../../src/errors.js';
const freezeState=s=>Object.freeze({...s,state:Object.freeze([...s.state])});
export class PairedNativeMpsRandom extends NativeMpsRandom {
 reserveCalendars(countsList,{signal,account=()=>{}}={}){
  this.live();requireValue(!this.busy&&Array.isArray(countsList)&&countsList.length>=1&&countsList.length<=2&&countsList.every(counts=>Array.isArray(counts)&&counts.length>=1&&counts.length<=6&&counts.every(n=>Number.isSafeInteger(n)&&n>0&&n<=2**28)),'One or two ordered Native calendars required');checkAbort(signal);account(16384);
  const parent=this,shadow=new NativeMpsRandom({stateBytes:this.stateBytes()}),snapshots=[freezeState(this.snapshot())],prepared=[Uint32Array.from(this.state)],metadata=[];
  let outstanding;
  try{
   for(const counts of countsList){outstanding=shadow.reserveSources([...counts],{signal});metadata.push({algorithm:outstanding.algorithm,kind:outstanding.kind,sources:outstanding.sources,key:outstanding.key});snapshots.push(freezeState(shadow.snapshot()));prepared.push(Uint32Array.from(shadow.state));outstanding.commit();outstanding=null;}
  }finally{outstanding?.rollback();shadow.dispose();}
  checkAbort(signal);let active=true,filling=false,prefix=0;this.busy=true;
  const apply=index=>{const s=snapshots[index];parent.state=prepared[index];parent.seedLo=s.seedLo;parent.seedHi=s.seedHi;parent.offsetLo=s.offsetLo;parent.offsetHi=s.offsetHi;};
  const calendars=Object.freeze(metadata.map((m,slot)=>Object.freeze({...m,
   get active(){return active&&slot>=prefix;},
   async fillSource(index,output,{signal:fillSignal=signal}={}){
    requireValue(active&&slot>=prefix&&!filling&&Number.isInteger(index)&&index>=0&&index<m.sources.length&&output instanceof Float32Array&&output.length===m.sources[index].count,'Active exact calendar source required');checkAbort(fillSignal);filling=true;
    try{const source=m.sources[index];if(parent.fillBackend)await parent.fillBackend.fill({counter:Uint32Array.from(source.counter),key:Uint32Array.from(m.key),output},{signal:fillSignal});else await fillNativeMpsSource({counter:source.counter,key:m.key,output},{signal:fillSignal});checkAbort(fillSignal);return output;}finally{filling=false;}
   }
  })));
  return Object.freeze({calendars,snapshots:Object.freeze(snapshots),get active(){return active;},get prefix(){return prefix;},
   commitPrefix(next){requireValue(active&&!filling&&next===prefix+1&&next<=calendars.length,'Ordered acknowledged calendar prefix required');apply(next);prefix=next;if(prefix===calendars.length){active=false;parent.busy=false;}},
   rollback(){requireValue(!filling,'Calendar source fill busy');if(!active)return;apply(prefix);active=false;parent.busy=false;}
  });
 }
}
// Product factories keep returning the SAME common NativeMpsRandom identity.
// This adapter adds only calendar ownership; it does not wrap/replace the RNG,
// recreate its fill backend, or convert another random algorithm to MPS.
export function reserveNativeMpsCalendars(random,countsList,hooks){
 requireValue(random instanceof NativeMpsRandom,'Qualified common NativeMpsRandom instance required');
 return PairedNativeMpsRandom.prototype.reserveCalendars.call(random,countsList,hooks);
}
