import "../../runtime-context.js?v=0.30.0";
// Useful completed tasks only. No duplicate codec work, calibration, UA rule or
// image-dependent observation survives service retirement.
export function createJpegGrayCurvePolicy(){
 let cpuUnits=0,cpuMs=0,cpuSamples=0,gpuUnits=0,gpuMs=0,gpuSamples=0,gpuFloor=Infinity;
 const eligible=(pixels,count,milliseconds)=>Number.isSafeInteger(pixels)&&pixels>0&&Number.isSafeInteger(count)&&count>=16&&count<=101&&Number.isFinite(milliseconds)&&milliseconds>0;
 return{
  observeCpu(pixels,count,milliseconds){if(!eligible(pixels,count,milliseconds))return;cpuUnits+=pixels*count;cpuMs+=milliseconds;cpuSamples++;},
  observeGpu(pixels,count,milliseconds){if(pixels<65536||!eligible(pixels,count,milliseconds))return;gpuUnits+=pixels*count;gpuMs+=milliseconds;gpuFloor=Math.min(gpuFloor,milliseconds);gpuSamples++;},
  choose(pixels,count){return{gpu:false,reason:'shared-before-owner-decision-required'};},
  snapshot(){return{cpuUnits,cpuMs,cpuSamples,gpuUnits,gpuMs,gpuSamples,gpuFloor:Number.isFinite(gpuFloor)?gpuFloor:null};}
 };
}
