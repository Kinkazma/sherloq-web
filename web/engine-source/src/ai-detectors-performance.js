// CPU width follows the shared scheduler's grant, including single-thread
// browsers. The fixed ORT heap is funded separately by inference admission.
const failure=()=>Object.assign(new Error('Invalid detector performance policy.'),{code:'MODEL_CONTRACT'});
const widths=[1,2,4];
export function aiPerformancePolicy(configuration,method,backend){
 const value=configuration.performancePolicies?.[method]?.[backend]??configuration.performance??{};
 if(!value||typeof value!=='object'||Array.isArray(value))throw failure();
 const result={prefetch:value.prefetch===true,cpuThreads:value.cpuThreads??1,cpuEdges:value.cpuEdges===true,cpuHead:value.cpuHead===true};
 if(!widths.includes(result.cpuThreads))throw failure();
 return result;
}
export function aiRequestedCpu(policy,backend,{isolated=globalThis.crossOriginIsolated===true,capacity=1}={}){
 if(backend!=='cpu'||!isolated)return 1;
 const limit=Math.max(1,Math.min(policy.cpuThreads,Number.isSafeInteger(capacity)?capacity:1));
 return widths.filter(n=>n<=limit).at(-1);
}
export function aiGrantedPerformance(policy,backend,grantedCpu,options){
 return{...policy,cpuThreads:aiRequestedCpu(policy,backend,{...options,capacity:Number.isSafeInteger(grantedCpu)?grantedCpu:1})};
}
