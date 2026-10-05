import "../../runtime-context.js?v=0.14.5";
import {requireValue,checkAbort,createCooperator} from './errors.js';
import {estimateEnergy,energyDeviations} from './energy-auto.js';
const BLOCK=65536;
// Extract exactly the existing native sampling lattice. The qualified algorithms
// then see at most131072 samples and therefore use step1, without a second sample.
async function samples(stores,types,{budget,signal,onProgress}={}){
 const n=stores[0]?.byteLength/4;requireValue(Number.isInteger(n)&&n>0&&n<2**31&&stores.every(s=>s?.byteLength===n*4),'Matching segmented scientific planes required.');const step=Math.max(1,Math.ceil(n/131072)),count=Math.ceil(n/step),release=budget.reserve(count*4*stores.length+Math.min(BLOCK,n)*4);let output;const cooperate=createCooperator(signal);
 try{output=types.map(Type=>new Type(count));const buffer=new Uint8Array(Math.min(BLOCK,n)*4);
  for(let plane=0;plane<stores.length;plane++){const typed=new types[plane](buffer.buffer);let emitted=0;for(let at=0;at<n;at+=BLOCK){await cooperate();const length=Math.min(BLOCK,n-at);await stores[plane].readInto(buffer.subarray(0,length*4),at*4);for(let i=Math.ceil(at/step)*step;i<at+length;i+=step)output[plane][emitted++]=typed[i-at];onProgress?.({phase:'energy-profile-samples',fraction:(plane+(at+length)/n)/stores.length});}requireValue(emitted===count,'Energy sample count mismatch.');}
  checkAbort(signal);return {output,step,count,release};
 }catch(error){release();throw error;}
}
async function scientificCall(compute,budget){const releases=[];try{return await compute(bytes=>{const free=budget.reserve(bytes);releases.push(free);return free;});}finally{for(const free of releases)free();}}
export async function estimateSegmentedEnergy(base,log,{budget,signal,onProgress}={}){
 requireValue(Array.isArray(base.energy_planes)&&base.energy_planes.length===3&&Array.isArray(base.energy_summary)&&typeof log==='function','Segmented energy planes and summaries required.');const sampled=await samples([base.energy_scope,...base.energy_planes],[Int32Array,Float32Array,Float32Array,Float32Array],{budget,signal,onProgress});let combinedRelease;
 try{combinedRelease=budget.reserve(sampled.count*12);const combined=new Float32Array(sampled.count*3);for(let q=0;q<3;q++)combined.set(sampled.output[q+1],q*sampled.count);return await scientificCall(account=>estimateEnergy({energy_planes:combined,energy_scope:sampled.output[0],energy_summary:base.energy_summary},log,{signal,account}),budget);}finally{combinedRelease?.();sampled.release();}
}
export async function segmentedEnergyDeviations(base,{budget,signal,onProgress}={}){
 const sampled=await samples([base.energy_low_score,base.energy_high_score],[Float32Array,Float32Array],{budget,signal,onProgress});try{return await scientificCall(account=>energyDeviations({energy_low_score:sampled.output[0],energy_high_score:sampled.output[1]},{signal,account}),budget);}finally{sampled.release();}
}
