import{requireValue}from'./errors.js';
export const ZERO_VOTE_POLICY_PREFIX='zero-votes/policy/';
const VERSION='native-f64-gated-centered025-v1',BYTES=2048,MAXIMUM=32,TTL=5*60*1000;
// Only a conservative CPU preference crosses analysis/device lifetimes.
// No adapter, device, program, source array or scientific value is retained.
export function createZeroVotePolicy({budget,width,height,maxWorkers=1,now=()=>performance.now()}={}){
 requireValue(Number.isInteger(width)&&Number.isInteger(height)&&width>=16&&height>=16&&Number.isInteger(maxWorkers)&&maxWorkers>0,'Invalid ZERO useful-work policy shape.');
 const key=ZERO_VOTE_POLICY_PREFIX+JSON.stringify([VERSION,budget.limit,width,height,maxWorkers]),epoch=now();for(const[k,entry]of budget.cache)if(k.startsWith(ZERO_VOTE_POLICY_PREFIX)&&epoch-(entry.value?.epoch??-Infinity)>TTL)budget.remove(k);
 const value=budget.get(key)?.value,preferredCpu=value?.preferredCpu===true,cpu=[],gpu=[];let refused=false;
 function saveCpu(){if(budget.recovering||budget.total()+BYTES>budget.limit)return;const keys=[...budget.cache.keys()].filter(k=>k.startsWith(ZERO_VOTE_POLICY_PREFIX));if(!budget.cache.has(key))while(keys.length>=MAXIMUM)budget.remove(keys.shift());budget.put(key,{byteLength:BYTES,value:{epoch:now(),preferredCpu:true,kind:'useful-work-cpu-estimate',version:VERSION}});}
 return{choose(){return'cpu';},
  observe(backend,milliseconds,{fallback}={}){requireValue(['cpu','webgpu'].includes(backend)&&Number.isFinite(milliseconds)&&milliseconds>=0,'Invalid ZERO useful phase observation.');if(fallback){refused=true;saveCpu();return;}const observations=backend==='webgpu'?gpu:cpu;observations.push(milliseconds);if(observations.length>4)observations.shift();if(cpu.length&&gpu.length&&Math.min(...gpu)>=Math.min(...cpu)*.9)saveCpu();},
  invalidate(){budget.remove(key);refused=true;},snapshot(){return{basis:preferredCpu?'reused-conservative-cpu-estimate':'consumed-vote-phases',preferredCpu,refused,cpuMilliseconds:[...cpu],gpuMilliseconds:[...gpu],next:this.choose(),metadataBytes:budget.cache.has(key)?BYTES:0,includes:'native workers, compilation, transport, native threshold refinement, result acceptance and phase retirement; luminance preparation shared'};}
 };
}
