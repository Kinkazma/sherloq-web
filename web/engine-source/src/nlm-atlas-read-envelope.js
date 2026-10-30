import {EngineError,requireValue} from './errors.js';

// One real reservation covers the largest sequential source/support read and
// its storage staging. Child ACKs return capacity to this job, not to Budget.
// It is never shared by another job or used to finance Native/GPU allocations.
export function createNlmAtlasReadEnvelope(budget,bytes){
 requireValue(budget&&typeof budget.reserve==='function'&&Number.isSafeInteger(bytes)&&bytes>=0,'A finite NLM source envelope is required');
 const free=budget.reserve(bytes);let used=0,peak=0,grants=0,closing=false,closed=false;
 function reserve(size){
  requireValue(Number.isSafeInteger(size)&&size>=0,'Invalid NLM source reservation');
  if(closing||closed)throw new EngineError('DISPOSED','NLM source envelope is retiring');
  if(size>bytes-used)throw new EngineError('MEMORY_LIMIT','NLM source read exceeds its admitted envelope');
  used+=size;grants++;peak=Math.max(peak,used);let live=true;
  const release=()=>{if(!live)return;live=false;used-=size;grants--;};
  Object.defineProperty(release,'bytes',{get:()=>live?size:0});return release;
 }
 return {reserve,get capacityBytes(){return bytes;},get usedBytes(){return used;},get peakBytes(){return peak;},get liveGrants(){return grants;},
  release(){if(closed)return;closing=true;if(grants)throw new EngineError('BUSY','NLM source loans must acknowledge before their envelope retires');free();closed=true;}
 };
}
