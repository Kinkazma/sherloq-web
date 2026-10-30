import "../../runtime-context.js?v=0.30.0";
// Pure observations of requested work. No algorithm is run or source retained.
// Auto is decided by the shared before-owner service. Without that decision,
// keep the admitted CPU fallback; observations never schedule a GPU trial.
export function createElaUsefulBackendPolicy({minimumPixels=262144}={}){
 const sources=new WeakMap();
 const entry=({source,method,width,height,profileKey='',budgetBytes=0,linear=false,grayscale=false},create=true)=>{if(!source||typeof source!=='object'||!['compose','residual'].includes(method)||![width,height].every(n=>Number.isInteger(n)&&n>0))return null;let map=sources.get(source);if(!map){if(!create)return null;sources.set(source,map=new Map());}const key=JSON.stringify([method,width,height,profileKey,budgetBytes,linear,grayscale]);let state=map.get(key);if(!state&&create){if(map.size>=32)map.delete(map.keys().next().value);map.set(key,state={cpu:[],gpu:[],cpuCount:0,gpuCount:0,gpuRefused:false,cpuFirstMs:null,gpuFirstMs:null});}return state;};
 const estimate=samples=>samples.length?Math.min(...samples):null;
 return{
  choose(context,{requested='auto',gpuAvailable=true}={}){if(requested==='cpu'||!gpuAvailable)return'cpu';if(requested==='webgpu')return'webgpu';return'cpu';},
  observe(context,{backend,milliseconds,compileMs=0}){if(!['cpu','webgpu'].includes(backend)||!Number.isFinite(milliseconds)||milliseconds<0||!Number.isFinite(compileMs)||compileMs<0)throw Error('A completed useful ELA body is required.');const s=entry(context);if(!s)return;const gpu=backend==='webgpu',list=gpu?s.gpu:s.cpu;list.push(gpu?Math.max(0,milliseconds-compileMs):milliseconds);if(list.length>4)list.shift();if(gpu){if(!s.gpuCount)s.gpuFirstMs=milliseconds;s.gpuCount++;s.gpuRefused=false;}else{if(!s.cpuCount)s.cpuFirstMs=milliseconds;s.cpuCount++;}},
  refuse(context){const s=entry(context);if(s)s.gpuRefused=true;},
  snapshot(context){const s=entry(context,false);return s?{cpuCompleted:s.cpuCount,gpuCompleted:s.gpuCount,cpuWarmMs:estimate(s.cpu),gpuWarmMs:estimate(s.gpu),gpuRefused:s.gpuRefused,cpuFirstMs:s.cpuFirstMs,gpuFirstMs:s.gpuFirstMs}:null;}
 };
}
