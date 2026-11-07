// Display-only feedback. Scientific/native dimensions are never modified.
export const PREVIEW_QUALITY_POLICY=Object.freeze({
 minimumCadenceMilliseconds:50,maximumCadenceMilliseconds:200,
 gentleReductionThresholdMilliseconds:300,gentleReductionEvidenceCount:2,
 gentleMinimumScale:.7,gentleMaximumScale:.9,
 reductionThresholdMilliseconds:500,reductionEvidenceCount:2,
 recoveryThresholdMilliseconds:150,
 noFrameWorkWindowMilliseconds:500,noFrameMinimumAttempts:2,
 noFrameGentleScale:.85,noFrameStrongWindows:2,maxNoFrameWindows:6
});
/** The caller must provide distinct, current, naturally completed frames.
 * Grid admission may reject a gentle request when its next legal grid would
 * lose more than30% per axis (e.g. integer decimation1→2). Such a grid stays
 * intact until the independently established hard-overload threshold.
 */
export function previewResolutionRequest({milliseconds,overloads,gentleOverloads,side,minimumSide,predictedSide}={}){
 const p=PREVIEW_QUALITY_POLICY;
 if(overloads>=p.reductionEvidenceCount)return{
  side:Math.max(minimumSide,Math.min(side*.5,Number.isFinite(predictedSide)?predictedSide:side*.5)),
  minimumScale:0,kind:'hard',thresholdMilliseconds:p.reductionThresholdMilliseconds
 };
 if(gentleOverloads>=p.gentleReductionEvidenceCount){
  const scale=Math.max(p.gentleMinimumScale,Math.min(p.gentleMaximumScale,Math.sqrt(p.gentleReductionThresholdMilliseconds/Math.max(milliseconds,1))*.98));
  return{side:Math.max(minimumSide,Math.floor(side*scale)),minimumScale:p.gentleMinimumScale,kind:'gentle',thresholdMilliseconds:p.gentleReductionThresholdMilliseconds};
 }
 return null;
}
// Choose the nearest smaller admissible integer grid when rounding the
// requested side would otherwise jump past the30% gentle limit.
export function gentlePreviewStep({width,height,currentSide,step,sampling='integer',minimumScale=PREVIEW_QUALITY_POLICY.gentleMinimumScale}){
 const minimumSide=Math.ceil(currentSide*minimumScale),longest=Math.max(width,height),maximumStep=minimumSide<=1?longest:Math.floor((longest-1)/(minimumSide-1));
 let chosen=Math.max(1,Math.min(step,maximumStep));
 if(sampling==='power-of-two')chosen=2**Math.floor(Math.log2(chosen));
 return chosen;
}
// Frequency keeps its own measured-grid policy. This is only an upstream
// provisional request bound from the same qualified no-frame work signal.
export function continuityPreviewSide({width,height,maxSide,maxPixels,continuity}={}){
 if(continuity?.schema!=='preview-continuity/1'||!Number.isInteger(continuity.misses)||continuity.misses<1||continuity.misses>PREVIEW_QUALITY_POLICY.maxNoFrameWindows)return maxSide;
 const longest=Math.max(width,height);let step=Math.max(1,Math.ceil(longest/maxSide));
 if(Math.ceil(width/step)*Math.ceil(height/step)>maxPixels){let low=step,high=longest;while(low<high){const mid=low+Math.floor((high-low)/2);if(Math.ceil(width/mid)*Math.ceil(height/mid)<=maxPixels)high=mid;else low=mid+1;}step=low;}
 const currentSide=Math.max(Math.ceil(width/step),Math.ceil(height/step)),requestedSide=Math.max(1,Math.floor(currentSide*PREVIEW_QUALITY_POLICY.noFrameGentleScale**continuity.misses));
 let next=Math.max(step,Math.ceil(longest/requestedSide));if(continuity.misses<PREVIEW_QUALITY_POLICY.noFrameStrongWindows)next=gentlePreviewStep({width,height,currentSide,step:next});
 return Math.min(maxSide,Math.max(Math.ceil(width/next),Math.ceil(height/next)));
}
