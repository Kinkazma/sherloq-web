import "../../runtime-context.js?v=0.25.0";
import{requireValue}from'./errors.js';
/** A native TopK prerequisite is not a negative learned observation. No zero
 * probability, mask, fabricated neighbour or lower TopK is produced here. */
export function nativeInsufficientSupport(raw){
 const r=raw?.receipt,o=raw?.observations;
 requireValue(raw?.status==='empty'&&Array.isArray(raw.contexts)&&raw.contexts.length===0&&r?.topk===40&&r.learnedCalls===0&&Number.isSafeInteger(r.candidateCells)&&r.candidateCells>=0&&r.candidateCells<r.topk&&Number.isSafeInteger(r.contextCells)&&r.contextCells>=r.candidateCells&&o?.rgbReadCalls===0&&o.rgbObservedPixels===0&&o.rgbForbiddenPixels===0&&raw.provenance?.backend==='not-executed','Only the explicit native pre-model TopK support boundary may publish insufficient support');
 return Object.freeze({status:'insufficient-support',reason:'native-topk-support-required',requiredCandidates:r.topk,availableCandidates:r.candidateCells,contextCells:r.contextCells,calculationPerformed:false,learnedCalls:0,negativeModelObservation:false,policy:'Original TopK40 retained; no candidate padding or fallback model calculation'});
}
