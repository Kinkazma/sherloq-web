import {createEmProductSelector} from './resampling-em-product-selector.js';
import {comparisonGpuBoundaryError} from './comparison-gpu-errors.js';
import {checkAbort} from './errors.js';
export const EM_POLICY_PREFIX='resampling-em/policy/';
const REVISION='integer-f64-tail-carry-simd-worker-mapped-ack-4',BYTES=2048,MAXIMUM=32,LIFETIME=5*60*1000;
const fields=['nativePoints','nativeMilliseconds','nativeSamples','gpuPoints','gpuMilliseconds','gpuSamples'];
function optionalPut(budget,key,value){
 if(budget.recovering)return false;const keys=[...budget.cache.keys()].filter(k=>k.startsWith(EM_POLICY_PREFIX));while(keys.length>=MAXIMUM)budget.remove(keys.shift());
 if(budget.total()+BYTES>budget.limit)return false;
 return budget.put(key,{value,byteLength:BYTES});
}
// Metadata only: adapters are one-shot and devices belong to an awaited fit.
// With redacted adapter identity, only a conservative CPU preference may cross
// fits in this budget/capability/profile/shape epoch. This estimates cost, never
// hardware identity or numerical qualification, and cannot select GPU.
export async function acquireEmProductPolicy({budget,width,height,size,profile='default',signal}={}){
 checkAbort(signal);let adapter;
 try{adapter=await globalThis.navigator?.gpu?.requestAdapter({powerPreference:'high-performance'});}catch(error){throw comparisonGpuBoundaryError(error,{signal});}checkAbort(signal);if(!adapter)return null;
 let key,base,epoch=performance.now(),reused=false,cpuOnly=false,preferCpu={};
 try{
  const info=adapter.info,identity=info?[info.vendor,info.architecture,info.device,info.description].map(v=>typeof v==='string'?v:''):[],capability=[...['maxBufferSize','maxStorageBufferBindingSize','maxComputeInvocationsPerWorkgroup','maxComputeWorkgroupStorageSize','maxComputeWorkgroupsPerDimension'].map(k=>adapter.limits[k]),[...(adapter.features??[])].sort()];
  let signature;
  if(identity.some(Boolean)&&globalThis.crypto?.subtle){signature=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([identity,capability]))))].map(v=>v.toString(16).padStart(2,'0')).join('');checkAbort(signal);}
  else{cpuOnly=true;signature=['anonymous-cpu-estimate',capability];}
  key=EM_POLICY_PREFIX+JSON.stringify([REVISION,signature,budget.limit,profile,width,height,size]);const hit=budget.get(key)?.value;
  if(hit&&epoch-hit.epoch<=LIFETIME){epoch=hit.epoch;if(cpuOnly){preferCpu={gram:hit.cpuPreferred?.gram===true,product:hit.cpuPreferred?.product===true};reused=Object.values(preferCpu).some(Boolean);}else{base=hit.observations;reused=!!base;}}
  else if(hit)budget.remove(key);
 }catch(error){checkAbort(signal);key=undefined;}
 const selector=createEmProductSelector(base,{preferCpu}),initial=selector.snapshot();let consumed=false,committed=false;
 return{selector,reused,cacheable:!!key,basis:cpuOnly?'budget-capability-profile-cpu-estimate':'adapter-signature-cost-estimate',cpuPreferred:{...preferCpu},
  takeAdapter(){if(consumed)return undefined;consumed=true;const result=adapter;adapter=null;return result;},
  commit(){
   if(committed)return;committed=true;if(!key)return;const observed=selector.snapshot(),current=budget.get(key)?.value,fresh=current&&performance.now()-current.epoch<=LIFETIME;
   if(cpuOnly){const cpuPreferred={};for(const mode of ['gram','product']){const s=observed[mode];cpuPreferred[mode]=preferCpu[mode]===true||fresh&&current.cpuPreferred?.[mode]===true||s.nativePoints>0&&s.nativeMilliseconds>0&&s.gpuPoints>0&&s.gpuMilliseconds/s.gpuPoints>=s.nativeMilliseconds/s.nativePoints*.9;}if(Object.values(cpuPreferred).some(Boolean))optionalPut(budget,key,{epoch,cpuPreferred});return;}
   const combined=createEmProductSelector(fresh?current.observations:undefined).snapshot();for(const mode of ['gram','product']){for(const field of fields)combined[mode][field]+=Math.max(0,observed[mode][field]-initial[mode][field]);combined[mode].domainRefusals=0;}optionalPut(budget,key,{epoch,observations:combined});
  },
  invalidate(){if(key)budget.remove(key);key=undefined;},
  release(){adapter=null;}
 };
}
