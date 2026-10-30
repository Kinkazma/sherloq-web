const PREFIX='ghost-native-exact/useful-cost/',REVISION='binary64-means-1',BYTES=2048,MAXIMUM=32,LIFETIME=5*60*1000;
const fresh=(value,now)=>value&&Number.isFinite(value.epoch)&&now>=value.epoch&&now-value.epoch<LIFETIME;
function put(budget,key,value){
 if(budget.recovering||budget.total()+BYTES>budget.limit)return false;
 const others=[...budget.cache.keys()].filter(k=>k.startsWith(PREFIX)&&k!==key);while(others.length>=MAXIMUM)budget.remove(others.shift());
 return budget.put(key,{value,byteLength:BYTES});
}
export function invalidateGhostJpegPolicies(budget){for(const key of [...budget.cache.keys()])if(key.startsWith(PREFIX))budget.remove(key);}
export function acquireGhostJpegPolicy({budget,width,height,count,storage='contiguous',maxWorkers=1,now=performance.now()}={}){
 const pixels=width*height;if(!Number.isSafeInteger(pixels)||pixels<=0||!Number.isInteger(count)||count<1||count>101)throw Error('A complete useful Native Ghost task is required.');
 const key=PREFIX+JSON.stringify([REVISION,budget.limit,width,height,count,storage,maxWorkers]);
 for(const k of [...budget.cache.keys()])if(k.startsWith(PREFIX)&&!fresh(budget.cache.get(k)?.value,now))budget.remove(k);
 const cached=budget.get(key)?.value,base=fresh(cached,now)?cached:null;
 const selected='cpu',reason='shared-before-owner-decision-required';
 // No synthetic codec run, duplicate quality, image sample or user-agent test.
 // This small bounded cache holds timing scalars only, never RGB or a device.
 return {selected,reason,reused:!!base,key,
  observe(backend,milliseconds){
   if(!['cpu','webgpu'].includes(backend)||!Number.isFinite(milliseconds)||milliseconds<=0)return false;
   const latest=budget.get(key)?.value,record=fresh(latest,now)?{...latest}:{epoch:now,cpuSamples:0,gpuSamples:0,cpuMs:0,gpuMs:0};
   const name=backend==='cpu'?'cpu':'gpu',samples=Math.min(record[name+'Samples']??0,3);record[name+'Ms']=(record[name+'Ms']*samples+milliseconds)/(samples+1);record[name+'Samples']=samples+1;
   return put(budget,key,record);
  },
  refuse(code){
   if(code==='GPU_FAILED'){invalidateGhostJpegPolicies(budget);return false;}
   const latest=budget.get(key)?.value,record=fresh(latest,now)?{...latest}:{epoch:now,cpuSamples:0,gpuSamples:0,cpuMs:0,gpuMs:0};record.failure=typeof code==='string'?code:'GPU_REFUSED';return put(budget,key,record);
  }
 };
}
export const GHOST_JPEG_POLICY_PREFIX=PREFIX;
