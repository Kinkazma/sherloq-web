import "../../runtime-context.js?v=0.14.5";
/** Adaptive decisions of the native Forgeryscope microscopy LightGlue profile.
 * Neural layers stay separate so export cannot freeze data-dependent early exit.
 * Native CPU/MPS pruning is used even when browser layers execute on WebGPU.
 */
import {requireValue} from './errors.js';
const f=Math.fround;
export function lightglueConfidenceThreshold(layer) {
  requireValue(Number.isInteger(layer)&&layer>=0&&layer<9,'Invalid LightGlue layer.');
  return f(.8+.1*Math.exp(-4*layer/9));
}
export function decideLightglueLayer({layer,totalPoints,confidence0,confidence1,matchability0,matchability1,depthConfidence=.9,widthConfidence=.9}) {
  const threshold=lightglueConfidenceThreshold(layer);
  requireValue(Number.isSafeInteger(totalPoints)&&totalPoints>0&&[depthConfidence,widthConfidence].every(Number.isFinite),'Invalid adaptive matching parameters.');
  const validate=a=>requireValue(a instanceof Float32Array&&a.every(Number.isFinite),'Invalid LightGlue control tensor.');
  [confidence0,confidence1,matchability0,matchability1].forEach(validate);
  requireValue(confidence0.length===matchability0.length&&confidence1.length===matchability1.length&&confidence0.length+confidence1.length<=totalPoints,'LightGlue control shape mismatch.');
  // Native returns before control when either side is empty. The last layer
  // performs neither early exit nor pruning.
  const identity=n=>Uint32Array.from({length:n},(_,i)=>i);
  if(layer===8||!confidence0.length||!confidence1.length)return {stop:!confidence0.length||!confidence1.length,keep0:identity(confidence0.length),keep1:identity(confidence1.length)};
  const low=confidence0.reduce((n,x)=>n+(x<threshold),0)+confidence1.reduce((n,x)=>n+(x<threshold),0);
  const stop=depthConfidence>0&&f(1-f(low/totalPoints))>f(depthConfidence);
  const keep=(confidence,scores)=>stop||widthConfidence<=0?identity(scores.length):Uint32Array.from(scores.reduce((indices,score,i)=>{if(score>f(1-widthConfidence)||(depthConfidence>0&&confidence[i]<=threshold))indices.push(i);return indices;},[]));
  return {stop,keep0:keep(confidence0,matchability0),keep1:keep(confidence1,matchability1)};
}

/** Gather indices once; keypoint identities survive repeated adaptive pruning. */
export function updateLightglueIndices(indices,keep,pruneCounts) {
  requireValue(indices instanceof Uint32Array&&keep instanceof Uint32Array&&pruneCounts instanceof Uint32Array,'Invalid LightGlue index buffers.');
  const next=new Uint32Array(keep.length);
  for(let i=0;i<keep.length;i++){
    requireValue(keep[i]<indices.length&&(i===0||keep[i]>keep[i-1]),'Pruning indices must be strictly increasing.');
    const id=indices[keep[i]];requireValue(id<pruneCounts.length,'Keypoint identity out of range.');next[i]=id;
  }
  for(const id of next)pruneCounts[id]++;
  return next;
}
