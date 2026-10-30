import "../../runtime-context.js?v=0.30.0";
import {requireValue,checkAbort,createCooperator} from './errors.js';
const f=Math.fround;
// Exact CPU recovery after an admitted GPU refusal. The original preparation
// has already fixed each panel mean and the final per-pixel panel identity.
// No quantile, threshold, JPEG or segmentation stage is recomputed or changed.
export async function nativeEnergyScores(planes,scope,summaries,{low,high,log,signal}={}){
 const n=scope.length,cooperate=createCooperator(signal),centers=new Map();
 for(const panel of summaries)centers.set(panel.id,panel.probes.map(probe=>f(probe.central_mean+.25)));
 for(let i=0;i<n;i++){
  if((i&8191)===0)await cooperate();
  if(!scope[i]){low[i]=0;high[i]=0;continue;}
  const center=centers.get(scope[i]);requireValue(center,'Native energy scope has no panel mean.');
  const x=f(log(f(center[0]/f(planes[i]+.25)))/f(.2)),y=f(log(f(center[1]/f(planes[n+i]+.25)))/f(.2)),z=f(log(f(center[2]/f(planes[n*2+i]+.25)))/f(.2));
  const median=x>y?(y>z?y:Math.min(x,z)):(x>z?x:Math.min(y,z));low[i]=Math.max(median,0);high[i]=Math.max(-median,0);
 }
 checkAbort(signal);
}
