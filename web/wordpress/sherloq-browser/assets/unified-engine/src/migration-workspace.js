import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,checkAbort} from './errors.js';

// One accounted migration window per engine budget. It is created before RAM
// banks fill that budget, and shared by their owners through a serialized queue.
// This is useful I/O capacity, never a probe allocation or a second data copy.
const workspaces=new WeakMap(),DEFAULT_PAGE_BYTES=1024**2;
export function migrationWorkspaceBytes(byteLength,session){return 2*Math.min(byteLength,session?.snapshot?.().pageBytes??DEFAULT_PAGE_BYTES);}
export function missingMigrationWorkspaceBytes(budget,bytes){const current=workspaces.get(budget);return Math.max(0,bytes-(current?.closing?0:current?.capacity??0));}
export function acquireMigrationWorkspace(budget,bytes,{reserve=amount=>budget.reserve(amount)}={}){
 requireValue(Number.isSafeInteger(bytes)&&bytes>=0,'Invalid migration window.');let record=workspaces.get(budget);
 if(!record||record.closing){record={capacity:0,refs:0,used:0,borrowers:0,drained:null,reservations:[],tail:Promise.resolve(),closing:false};workspaces.set(budget,record);}
 if(bytes>record.capacity){const extra=bytes-record.capacity;record.reservations.push(reserve(extra));record.capacity=bytes;}
 record.refs++;let released=false;
 const borrow=size=>{requireValue(Number.isSafeInteger(size)&&size>=0,'Invalid migration staging request.');if(size>record.capacity-record.used)throw new EngineError('MEMORY_LIMIT','Migration staging exceeds its reserved window.');record.used+=size;record.borrowers++;let done=false;return()=>{if(done)return;done=true;record.used-=size;if(--record.borrowers===0){record.drained?.();record.drained=null;}};};
 return {
  run(operation,{signal}={}){if(released)return Promise.reject(new EngineError('DISPOSED','Migration owner released.'));const execute=async()=>{checkAbort(signal);const value=await operation(borrow);checkAbort(signal);return value;};const task=record.tail.then(execute,execute);record.tail=task.catch(()=>{});return task;},
  async release(){if(released)return;released=true;if(--record.refs)return;record.closing=true;await record.tail;if(record.borrowers)await new Promise(resolve=>{record.drained=resolve;});for(const drop of record.reservations)drop();record.reservations.length=0;if(workspaces.get(budget)===record)workspaces.delete(budget);}
 };
}
