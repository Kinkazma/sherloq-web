import "../../runtime-context.js?v=0.25.0";
// Preserve the ORIGINAL failure before structured Error cloning can discard its
// code/details. These records describe two independent, unchanged budgets.
function plain(value){
 if(value===undefined)return undefined;
 try{return JSON.parse(JSON.stringify(value,(_key,v)=>typeof v==='bigint'?String(v):v));}
 catch{return{unserializable:Object.prototype.toString.call(value)};}
}
export function encodeMgcfdnWorkerError(value){
 if(value instanceof Error)return{type:'Error',name:value.name,message:value.message,stack:value.stack,...(Object.hasOwn(value,'code')?{code:plain(value.code)}:{}),...(Object.hasOwn(value,'details')?{details:plain(value.details)}:{}),frozen:Object.isFrozen(value)};
 if(value===undefined)return{type:'undefined'};
 if(value===null)return{type:'null',value:null};
 if(typeof value==='number'&&!Number.isFinite(value))return{type:'number',value:String(value)};
 if(typeof value==='bigint')return{type:'bigint',value:String(value)};
 return{type:typeof value,value:typeof value==='object'?plain(value):value,frozen:typeof value==='object'&&Object.isFrozen(value)};
}
const short=value=>typeof value==='string'?value.slice(0,96):null;
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const numericSnapshot=value=>Object.fromEntries(['budgetBytes','policyAvailableBytes','retainedBytes','cacheBytes','activeReservationBytes','peakAccountedBytes'].map(k=>[k,count(value?.[k])]));
const leases=value=>Array.isArray(value)?value.slice(0,32).map(v=>({id:count(v?.id),bytes:count(v?.bytes),stage:short(v?.stage)})):[];
function arenaSummary(value){
 if(!value)return null;const refusal=value.lastRefusal;
 return{...numericSnapshot(value),arena:short(value.arena),liveReservationCount:Array.isArray(value.liveReservations)?value.liveReservations.length:0,liveReservations:leases(value.liveReservations),lastRefusal:refusal?{arena:short(refusal.arena),stage:short(refusal.stage),requestedBytes:count(refusal.requestedBytes),snapshot:numericSnapshot(refusal.snapshot),liveReservationCount:Array.isArray(refusal.liveReservations)?refusal.liveReservations.length:0,liveReservations:leases(refusal.liveReservations)}:null};
}
// Whitelist metadata; never clone tensor values, weights, URLs or arbitrary
// nested errors from the diagnostic packet into the public failure journal.
export function boundedMgcfdnArenaDiagnostics(value){
 if(!value||typeof value!=='object')return undefined;
 const limits=v=>v?{maxBufferSize:count(v.maxBufferSize),maxStorageBufferBindingSize:count(v.maxStorageBufferBindingSize),requiredBufferBytes:count(v.requiredBufferBytes)}:null;
 return{schema:'mgcfdn-native-worker-arenas/public119',id:count(value.id),label:short(value.label),featureCells:count(value.featureCells),feeds:(Array.isArray(value.feeds)?value.feeds:[]).slice(0,8).map(v=>({name:short(v?.name),dims:(Array.isArray(v?.dims)?v.dims:[]).slice(0,8).map(count),bytes:count(v?.bytes)})),graph:arenaSummary(value.graph),gpu:arenaSummary(value.gpu),heapBytes:count(value.heapBytes),gpuLimits:value.gpuLimits?{adapter:limits(value.gpuLimits.adapter),device:limits(value.gpuLimits.device)}:null};
}
export function decodeMgcfdnWorkerError(record,arenaDiagnostics){
 if(record?.type==='undefined')return undefined;
 if(record?.type==='Error'){const error=new Error(record.message);error.name=record.name;if(record.stack!==undefined)error.stack=record.stack;if(Object.hasOwn(record,'code'))error.code=record.code;if(Object.hasOwn(record,'details'))error.details=record.details;const bounded=boundedMgcfdnArenaDiagnostics(arenaDiagnostics);if(bounded){const old=error.details;error.details={...(old&&Object.getPrototypeOf(old)===Object.prototype?old:Object.hasOwn(record,'details')?{originalDetails:old}:{}),arenaDiagnostics:bounded};}return record.frozen?Object.freeze(error):error;}
 if(record?.type==='bigint')return BigInt(record.value);
 if(record?.type==='number'&&typeof record.value==='string')return Number(record.value);
 const value=record?.value;return record?.frozen&&value&&typeof value==='object'?Object.freeze(value):value;
}
export function trackMgcfdnBudget(budget,arena,currentStage=()=>null){
 const leases=new Map();let next=0,lastRefusal;
 const snapshot=()=>({...budget.snapshot(),arena,liveReservations:[...leases.values()].map(v=>({...v})),lastRefusal});
 const proxy=new Proxy(budget,{get(target,key){
  if(key==='reserve')return bytes=>{let release;try{release=target.reserve(bytes);}catch(error){lastRefusal={arena,stage:currentStage(),requestedBytes:bytes,snapshot:{...target.snapshot()},liveReservations:[...leases.values()].map(v=>({...v})),originalError:encodeMgcfdnWorkerError(error)};throw error;}
   const id=++next;leases.set(id,{id,bytes,stage:currentStage()});let retired=false;return()=>{if(retired)return;release();retired=true;leases.delete(id);};};
  if(key==='snapshot')return snapshot;
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
 return Object.freeze({budget:proxy,snapshot,get lastRefusal(){return lastRefusal;}});
}
