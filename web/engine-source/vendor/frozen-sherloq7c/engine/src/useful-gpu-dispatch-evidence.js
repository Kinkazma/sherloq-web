// Worker-local factual attribution only. Counts existing dispatch/submit calls;
// creates no device, command, readback, timing probe or additional execution.
export function installUsefulGpuDispatchEvidence(scope=globalThis){
 const Pass=scope.GPUComputePassEncoder,Queue=scope.GPUQueue;if(!Pass?.prototype||!Queue?.prototype)return null;
 const marker=Symbol.for('sherloq.usefulGpuDispatchEvidence');if(Pass.prototype[marker])return Pass.prototype[marker];
 const originals=[],counts={dispatches:0,submissions:0};
 try{
  for(const[prototype,key,counter]of[[Pass.prototype,'dispatchWorkgroups','dispatches'],[Pass.prototype,'dispatchWorkgroupsIndirect','dispatches'],[Queue.prototype,'submit','submissions']]){
   const original=prototype[key];if(typeof original!=='function')continue;const wrapped=function(...args){const value=Reflect.apply(original,this,args);counts[counter]++;return value;};prototype[key]=wrapped;if(prototype[key]!==wrapped)throw Error('Read-only GPU method');originals.push([prototype,key,original]);
  }
  const value={snapshot:()=>({...counts}),since(before){if(!before)return null;const dispatches=counts.dispatches-before.dispatches,submissions=counts.submissions-before.submissions;return {observed:true,coverage:'worker-compute-dispatch-submit',dispatches,submissions,actualGpuWork:dispatches>0&&submissions>0};}};Object.defineProperty(Pass.prototype,marker,{value});return value;
 }catch{for(const[prototype,key,original]of originals)try{prototype[key]=original;}catch{}return null;}
}
