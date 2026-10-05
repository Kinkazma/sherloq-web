import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue} from './errors.js';
// Cache ownership and published handles are independent. All reads still use
// the original store and return owned pages/windows; no full-image clone occurs.
export function retainResult(master){
 requireValue(master?.descriptor&&typeof master.dispose==='function','Invalid retained result.');let refs=1,ownerReleased=false,closing;
 const drop=()=>{if(--refs===0)closing=Promise.resolve(master.dispose());return closing;};
 return {
  descriptor:master.descriptor,
  lease(){requireValue(!ownerReleased,'Result cache entry has been released.');refs++;let disposed=false;
   const descriptor=Object.freeze({...master.descriptor,id:crypto.randomUUID()}),result={descriptor,dispose(){if(disposed)return;disposed=true;return drop();}};
   for(const method of ['readWindow','readRows','readCsv'])if(master[method])result[method]=async(...args)=>{if(disposed)throw new EngineError('DISPOSED','Result handle released.');const value=await master[method](...args);return {...value,...(method==='readWindow'?{surfaceId:descriptor.id}:{tableId:descriptor.id})};};
   return result;
  },
  dispose(){if(ownerReleased)return closing;ownerReleased=true;return drop();}
 };
}
