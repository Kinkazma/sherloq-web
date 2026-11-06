import "../../runtime-context.js?v=0.31.0";
import {EngineError,requireValue} from './errors.js';
export const FROZEN_7C_CEILING=4_000_000_000;

// A scoped ledger of real parent tokens, never a second allocation bank.
// Local ceilings cover 7C; every useful byte still needs the parent's admission.
export function createFrozen7cBudget(actualBudget,{ceilingBytes=FROZEN_7C_CEILING,memoryBudgetBytes=2*1024**3}={}){
 requireValue(actualBudget&&typeof actualBudget.reserve==='function'&&typeof actualBudget.total==='function'&&typeof actualBudget.registerBacking==='function'&&actualBudget.resources?.backings&&typeof actualBudget.resourceSnapshot==='function','A real shared parent budget and backing registry are required.');
 requireValue(Number.isSafeInteger(ceilingBytes)&&ceilingBytes>0&&ceilingBytes<=FROZEN_7C_CEILING&&Number.isSafeInteger(memoryBudgetBytes)&&memoryBudgetBytes>0,'Invalid frozen 7C ceiling or admitted budget.');
 let policyLimit=Math.min(ceilingBytes,memoryBudgetBytes),held=0,peak=0;const backings=new Set(),backingRefs=new Map();
 function token(parent,bytes){
  let remaining=bytes,closed=false,pending;
  const acknowledge=()=>{held-=remaining;remaining=0;closed=true;};
  const release=()=>{
   if(closed)return;if(pending)return pending;
   const value=parent();
   if(value?.then){const task=Promise.resolve(value).then(acknowledge).finally(()=>{if(pending===task)pending=null;});pending=task;return task;}
   acknowledge();return value;
  };
  release.split=size=>{requireValue(!closed&&!pending&&Number.isSafeInteger(size)&&size>=0&&size<=remaining&&typeof parent.split==='function','Invalid scoped parent reservation transfer.');const child=parent.split(size);remaining-=size;return token(child,size);};
  Object.defineProperty(release,'bytes',{get:()=>remaining});return release;
 }
 return{
  get limit(){return Math.min(ceilingBytes,policyLimit,actualBudget.limit);},get peak(){return peak;},resources:{backings},total:()=>held,
  setLimit(bytes){requireValue(Number.isSafeInteger(bytes)&&bytes>0,'Invalid frozen 7C admission target.');policyLimit=Math.min(bytes,ceilingBytes);},
  reserve(bytes){
   requireValue(Number.isSafeInteger(bytes)&&bytes>=0,'Invalid frozen 7C reservation.');const limit=this.limit;
   if(held+bytes>limit)throw new EngineError('MEMORY_LIMIT','Frozen 7C exceeds its scoped admission target.',{details:{requestedBytes:bytes,availableBytes:Math.max(0,limit-held),budgetBytes:limit,parentBudgetBytes:actualBudget.limit,ceilingBytes,admissionScope:'fixed'}});
   const parent=actualBudget.reserve(bytes);held+=bytes;peak=Math.max(peak,held);return token(parent,bytes);
  },
  registerBacking(...args){
   const parent=actualBudget.registerBacking(...args),record=[...actualBudget.resources.backings].find(row=>row.id===parent.id);requireValue(!!record,'Parent backing identity is required.');backings.add(record);backingRefs.set(record,(backingRefs.get(record)??0)+1);let closed=false,pending;
   const acknowledge=()=>{if(closed)return;closed=true;const count=backingRefs.get(record)-1;if(count)backingRefs.set(record,count);else{backingRefs.delete(record);backings.delete(record);}};
   return new Proxy(parent,{apply(target,receiver,values){if(closed)return;if(pending)return pending;const value=Reflect.apply(target,receiver,values);if(value?.then){const task=Promise.resolve(value).then(bytes=>{acknowledge();return bytes;}).finally(()=>{if(pending===task)pending=null;});pending=task;return task;}acknowledge();return value;}});
  },
  notifyBackingRelease:(...args)=>actualBudget.notifyBackingRelease?.(...args),
  resourceSnapshot:()=>({...actualBudget.resourceSnapshot(),frozen7c:{scopedBytes:held,scopedPeakBytes:peak,backingIds:[...backings].map(row=>row.id)}}),
  snapshot:()=>({budgetBytes:Math.min(ceilingBytes,policyLimit,actualBudget.limit),policyAvailableBytes:Math.max(0,Math.min(ceilingBytes,policyLimit,actualBudget.limit)-held),retainedBytes:0,cacheBytes:0,activeReservationBytes:held,peakAccountedBytes:peak,parent:actualBudget.snapshot()})
 };
}
