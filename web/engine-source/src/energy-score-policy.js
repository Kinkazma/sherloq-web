// Observations of completed requested score bodies only. A policy belongs to
// its immutable source/context owner and never retains planes or summaries.
// Enabled only after actual Worker qualification; private harnesses can opt in
// by serving this exact module with the flag set to true.
export const ENERGY_SCORE_AUTO_ENABLED=true;
export function createEnergyScorePolicy({minimumPixels=262144}={}){
 const states=new Map(),valid=value=>Number.isSafeInteger(value)&&value>0;
 const state=(pixels,create=true)=>{if(!valid(pixels))throw Error('A native score population is required.');let s=states.get(pixels);if(!s&&create){if(states.size>=16)states.delete(states.keys().next().value);states.set(pixels,s={cpu:[],gpu:[],cpuCount:0,gpuCount:0,refused:false});}return s;};
 return{
  choose(pixels){if(!valid(pixels))throw Error('A native score population is required.');return'cpu';},
  observe(pixels,backend,milliseconds){if(!['cpu','webgpu'].includes(backend)||!Number.isFinite(milliseconds)||milliseconds<0)throw Error('A completed score body with its actual full cost is required.');const s=state(pixels),list=s[backend==='cpu'?'cpu':'gpu'];list.push(milliseconds);if(list.length>4)list.shift();s[backend==='cpu'?'cpuCount':'gpuCount']++;},
  refuse(pixels){state(pixels).refused=true;},
  snapshot(pixels){const s=state(pixels,false);return s?{cpuCompleted:s.cpuCount,gpuCompleted:s.gpuCount,cpuMs:s.cpu.length?Math.min(...s.cpu):null,gpuMs:s.gpu.length?Math.min(...s.gpu):null,refused:s.refused}:null;}
 };
}
