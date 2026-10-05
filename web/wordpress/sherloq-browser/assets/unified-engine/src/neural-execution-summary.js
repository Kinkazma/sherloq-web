/** Bound provenance by operator count, not by the number of image windows. */
export function executionSummary(){
 const records=new Map();
 return {add(name,metrics){const key=name+'/'+metrics.provider;let r=records.get(key);if(!r){r={name,provider:metrics.provider,calls:0,milliseconds:0,maximumMemoryBytes:0,preflightExecutions:0};records.set(key,r);}r.reusedInputBytes=(r.reusedInputBytes??0)+(metrics.reusedInputBytes??0);r.calls++;r.milliseconds+=metrics.milliseconds;r.maximumMemoryBytes=Math.max(r.maximumMemoryBytes,metrics.memoryMaximumBytes);if(metrics.retry)r.retries=(r.retries??0)+1;},values(){return [...records.values()];}};
}
