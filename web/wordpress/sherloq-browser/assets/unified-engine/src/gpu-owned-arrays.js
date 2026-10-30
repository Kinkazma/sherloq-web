import "../../runtime-context.js?v=0.30.0";
import {EngineError} from './errors.js';
// Named host outputs do not capture the producer's async activation/input.
// Successful siblings retire once; a refused or asynchronous ACK retains the
// remaining fee and can be retried. Published views are inaccessible meanwhile.
export function ownGpuArrays(values,free,owners,budget,metadata={},pendingRegistry){
 let closed=false,retiring=false,cursor=0,active;
 const done=()=>{closed=true;pendingRegistry?.delete(result);};
 const advance=()=>{while(cursor<owners.length){const owner=owners[cursor],ack=owner.release?.(),accept=bytes=>{cursor++;if(bytes!==0)budget.notifyBackingRelease?.('array-buffer',bytes??owner.bytes);};if(ack&&typeof ack.then==='function')return Promise.resolve(ack).then(accept).then(advance);accept(ack);}const ack=free();if(ack&&typeof ack.then==='function')return Promise.resolve(ack).then(done);done();};
 const result={...metadata,release(){if(closed)return;if(active)return active;retiring=true;pendingRegistry?.add(result);values=null;const ack=advance();if(ack&&typeof ack.then==='function'){active=Promise.resolve(ack).finally(()=>{active=null;});return active;}}};
 for(const name of Object.keys(values))Object.defineProperty(result,name,{enumerable:true,get(){if(closed||retiring)throw new EngineError('DISPOSED','Released GPU result.');return values[name];}});return result;
}
