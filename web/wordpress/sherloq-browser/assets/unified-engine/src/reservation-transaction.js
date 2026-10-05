import "../../runtime-context.js?v=0.14.5";
import {EngineError,normalizeResourceError,requireValue} from './errors.js';

// An attempt can return its prefix during cleanup before recovery observes the
// budget. Track that ownership explicitly: peer releases and retained outputs
// cannot masquerade as credit that the same attempt must reacquire. Tracking is
// bookkeeping only; the original Budget reservation remains the sole charge.
const tracked=new WeakMap();
function trackReservation(release){
 let record=tracked.get(release);if(record)return record;
 requireValue(typeof release==='function'&&Number.isSafeInteger(release.bytes)&&release.bytes>=0&&typeof release.split==='function','An owned splittable reservation is required.');
 record={release,bytes:release.bytes,scopes:new Set(),failures:new Map()};
 const free=()=>{
  if(!record.release)return;record.release();record.release=null;
  for(const scope of record.scopes)scope.records.delete(record);record.scopes.clear();
  for(const [error,{bytes}]of record.failures){const admission=error.details.admission,rollbackBytes=admission.rollbackBytes+bytes;error.details={...error.details,admission:{...admission,rollbackBytes,retryBytes:admission.requestedBytes+rollbackBytes}};}
  record.failures.clear();record.bytes=0;
 };
 free.split=bytes=>{
  requireValue(record.release&&Number.isSafeInteger(bytes)&&bytes>=0&&bytes<=record.bytes,'Invalid tracked reservation split.');
  const child=trackReservation(record.release.split(bytes));record.bytes-=bytes;
  for(const scope of record.scopes){scope.records.add(child);child.scopes.add(scope);}
  for(const [error,failure]of record.failures){failure.bytes-=bytes;child.failures.set(error,{bytes,scopes:new Set(failure.scopes)});}
  return child.free;
 };
 Object.defineProperty(free,'bytes',{get:()=>record.bytes});record.free=free;tracked.set(release,record);tracked.set(free,record);return record;
}
export function createReservationTransaction(budget){
 const state={records:new Set()},captured=new Set();let closed=false;
 const open=()=>{if(closed)throw new EngineError('DISPOSED','Reservation transaction closed.');};
 function capture(error){
  open();const value=normalizeResourceError(error);
  if(value?.code!=='MEMORY_LIMIT'||value.details?.admissionScope==='fixed'||captured.has(value))return value;
  const requested=value.details?.requestedBytes;if(!Number.isSafeInteger(requested)||requested<=0)return value;
  captured.add(value);value.details={...value.details,admission:value.details.admission??{requestedBytes:requested,rollbackBytes:0,retryBytes:requested}};
  for(const record of state.records)if(record.bytes){let failure=record.failures.get(value);if(!failure){failure={bytes:record.bytes,scopes:new Set()};record.failures.set(value,failure);}failure.scopes.add(state);}
  return value;
 }
 function track(release){open();const record=trackReservation(release);state.records.add(record);record.scopes.add(state);return record.free;}
 return {
  reserve(bytes){open();try{return track(budget.reserve(bytes));}catch(error){throw capture(error);}},
  // Transfer tracking ownership: callers must use the returned release/split,
  // not the original unwrapped release, from this point onward.
  track,capture,
  // Call after the attempt's cleanup. Surviving output owners keep their credit
  // and no later release is charged to this completed attempt's retry demand.
  close(){if(closed)return;closed=true;for(const record of state.records){record.scopes.delete(state);for(const [error,failure]of record.failures){failure.scopes.delete(state);if(!failure.scopes.size)record.failures.delete(error);}}state.records.clear();captured.clear();}
 };
}
