import "../../runtime-context.js?v=0.30.0";
import {EngineError,requireValue} from './errors.js';
// Cache ownership and published handles are independent. All reads still use
// the original store and return owned pages/windows; no full-image clone occurs.
export function retainResult(master){
 requireValue(master?.descriptor&&typeof master.dispose==='function','Invalid retained result.');let refs=1,ownerReleased=false,closing,closed=false;
 // Reference removal happens once per owner. The final master ACK may fail,
 // so any released owner can retry that same retirement without a second drop.
 const retire=()=>{
  if(refs||closed)return closing;if(closing)return closing;
  const task=Promise.resolve(master.dispose()).then(()=>{closed=true;},error=>{if(closing===task)closing=null;throw error;});closing=task;return task;
 };
 return {
  descriptor:master.descriptor,
  lease(){requireValue(!ownerReleased,'Result cache entry has been released.');refs++;let disposed=false;
   const descriptor=Object.freeze({...master.descriptor,id:crypto.randomUUID()}),result={descriptor,dispose(){if(!disposed){disposed=true;refs--;}return retire();}};
   for(const method of ['readWindow','readSampledWindow','readRows','readCsv'])if(master[method])result[method]=async(...args)=>{if(disposed)throw new EngineError('DISPOSED','Result handle released.');const value=await master[method](...args);return {...value,...(['readWindow','readSampledWindow'].includes(method)?{surfaceId:descriptor.id}:{tableId:descriptor.id})};};
   return result;
  },
  dispose(){if(!ownerReleased){ownerReleased=true;refs--;}return retire();}
 };
}
