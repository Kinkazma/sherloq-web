const PREFIX='resampling-fourier-fft/policy/',REVISION='stockham-DD-resident-magnitude-1',BYTES=2048,MAXIMUM=32,LIFETIME=5*60*1000;
export const FOURIER_FFT_AUTO_ENABLED=true;
function put(budget,key,value){
 if(budget.recovering||budget.total()+BYTES>budget.limit)return false;
 const keys=[...budget.cache.keys()].filter(k=>k.startsWith(PREFIX)&&k!==key);while(keys.length>=MAXIMUM)budget.remove(keys.shift());
 return budget.put(key,{value,byteLength:BYTES});
}
function fresh(value,now){return value&&Number.isFinite(value.epoch)&&now-value.epoch<LIFETIME&&now>=value.epoch;}
export function invalidateFourierFftPolicies(budget){for(const key of [...budget.cache.keys()])if(key.startsWith(PREFIX))budget.remove(key);}
export function acquireFourierFftPolicy({budget,side,outputSide,window,highpass,storage='auto',maxWorkers=1,now=performance.now()}={}){
 const key=PREFIX+JSON.stringify([REVISION,budget.limit,side,outputSide,window,highpass,storage,maxWorkers]);
 for(const k of [...budget.cache.keys()])if(k.startsWith(PREFIX)&&!fresh(budget.cache.get(k)?.value,now))budget.remove(k);
 const value=budget.get(key)?.value,base=fresh(value,now)?value:null;
 const selected='cpu',reason='shared-before-owner-decision-required';
 // These are session cost estimates, never device identity or numerical
 // qualification. No adapter/device/pipeline is retained here. Each selected
 // GPU owner must pass its current capability and arithmetic admission.
 return {selected,reason,reused:!!base,key,
  observe(backend,milliseconds){
   if(!['cpu','webgpu'].includes(backend)||!Number.isFinite(milliseconds)||milliseconds<=0)return false;
   const current=budget.get(key)?.value,record=fresh(current,now)?{...current}:{epoch:now,cpuSamples:0,gpuSamples:0,cpuMs:0,gpuMs:0};
   const name=backend==='cpu'?'cpu':'gpu',samples=Math.min(record[name+'Samples']??0,3);record[name+'Ms']=(record[name+'Ms']*samples+milliseconds)/(samples+1);record[name+'Samples']=samples+1;delete record.failure;
   return put(budget,key,record);
  },
  refuse(code){
   if(code==='GPU_FAILED'){invalidateFourierFftPolicies(budget);return false;}
   const current=budget.get(key)?.value,record=fresh(current,now)?{...current}:{epoch:now,cpuSamples:0,gpuSamples:0,cpuMs:0,gpuMs:0};record.failure=typeof code==='string'?code:'GPU_REFUSED';return put(budget,key,record);
  },
  invalidate(){budget.remove(key);}
 };
}
export const FOURIER_FFT_POLICY_PREFIX=PREFIX;
