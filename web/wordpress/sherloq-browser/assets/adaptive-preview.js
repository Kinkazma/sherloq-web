import {isFrequencyPreviewToken,frequencyPreviewPresented} from './frequency-preview-sizing.js?v=0.33.1';
// Provisional display sizing only. Native analysis parameters never change.
const STORE_KEY='sherloq.preview-calibration.v5',MAX_ENTRIES=128,MODEL=5;
import {ADAPTIVE_PREVIEW_MAX_SIDE,ADAPTIVE_PREVIEW_MAX_PIXELS} from './preview-limits.js?v=0.33.1';
export {ADAPTIVE_PREVIEW_MAX_SIDE,ADAPTIVE_PREVIEW_MAX_PIXELS};
import {PREVIEW_QUALITY_POLICY,previewResolutionRequest,gentlePreviewStep} from './preview-quality-policy.js?v=0.33.1';
export {PREVIEW_QUALITY_POLICY};
const shared=new Map();let serial=0,loaded=false;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),clock=()=>globalThis.performance?.now?.()??Date.now(),epoch=()=>Date.now(),valid=v=>Number.isFinite(v)&&v>=0;
function storage(){try{return globalThis.localStorage;}catch{return null;}}
function qualityState(value){
 if(!value||value.version!==2||![value.width,value.height].every(v=>Number.isSafeInteger(v)&&v>0)||!['integer','power-of-two','proportional'].includes(value.sampling)||!Number.isFinite(value.side)||value.side<1)return null;
 return{version:2,width:value.width,height:value.height,sampling:value.sampling,sourceIdentity:typeof value.sourceIdentity==='string'?value.sourceIdentity:null,side:value.side,overloads:Number.isInteger(value.overloads)?clamp(value.overloads,0,2):0,gentleOverloads:Number.isInteger(value.gentleOverloads)?clamp(value.gentleOverloads,0,2):0,recovery:Number.isInteger(value.recovery)?clamp(value.recovery,0,2):0,evidenceId:Number.isSafeInteger(value.evidenceId)?value.evidenceId:0,evidenceStartedAt:valid(value.evidenceStartedAt)?value.evidenceStartedAt:0,reductions:Number.isSafeInteger(value.reductions)&&value.reductions>=0?value.reductions:0,...(Number.isSafeInteger(value.biomesGridRevision)&&value.biomesGridRevision>=0?{biomesGridRevision:value.biomesGridRevision}:{})};
}
function clean(value){return value&&value.costModel===MODEL&&Number.isFinite(value.side)&&value.side>=1&&Number.isFinite(value.cost)&&value.cost>0&&Number.isSafeInteger(value.samples)&&value.samples>=0?{costModel:MODEL,side:value.side,cost:value.cost,samples:value.samples,variance:valid(value.variance)?value.variance:0,overhead:valid(value.overhead)?value.overhead:0,lastMs:valid(value.lastMs)?value.lastMs:0,lastStartedAt:valid(value.lastStartedAt)?value.lastStartedAt:0,lastId:Number.isSafeInteger(value.lastId)?value.lastId:0,painted:value.painted===true,completed:value.completed===true,...(qualityState(value.qualityPolicy)?{qualityPolicy:qualityState(value.qualityPolicy)}:{})}:null;}
// Source scope and the two-frame proof are deliberately not durable. A reload
// or a different source starts at its largest admitted grid, not an old penalty.
function durable(row){const value={...row};delete value.qualityPolicy;return value;}
function load(){if(loaded)return;loaded=true;try{const rows=JSON.parse(storage()?.getItem(STORE_KEY)??'null');if(rows?.version===MODEL&&Array.isArray(rows.entries))for(const[key,value]of rows.entries.slice(-MAX_ENTRIES)){const row=clean(value);if(typeof key==='string'&&key.length<=192&&row)shared.set(key,row);}}catch{}}
function save(){try{storage()?.setItem(STORE_KEY,JSON.stringify({version:MODEL,entries:[...shared.entries()].map(([key,row])=>[key,durable(row)])}));}catch{}}
const older=(row,current)=>current&&(row.lastStartedAt<current.lastStartedAt||row.lastStartedAt===current.lastStartedAt&&(row.lastId<current.lastId||row.lastId===current.lastId&&current.painted&&!row.painted));
function remember(map,key,row,persist){map.delete(key);map.set(key,row);while(map.size>MAX_ENTRIES)map.delete(map.keys().next().value);if(persist&&map===shared)save();}
function dimensions(width,height,side,sampling,pixels){if(sampling==='proportional'){const ratio=Math.min(1,side/Math.max(width,height),Math.sqrt(pixels/(width*height))),w=Math.min(Math.floor(pixels),Math.max(1,Math.floor(width*ratio))),h=Math.min(Math.floor(pixels/w),Math.max(1,Math.floor(height*ratio)));return{width:w,height:h,step:Math.max(width/w,height/h)};}let step=Math.max(1,Math.ceil(Math.max(width,height)/side));if(Math.ceil(width/step)*Math.ceil(height/step)>pixels){let low=step,high=Math.max(width,height);while(low<high){const middle=low+Math.floor((high-low)/2);if(Math.ceil(width/middle)*Math.ceil(height/middle)<=pixels)high=middle;else low=middle+1;}step=low;}if(sampling==='power-of-two'){let power=1;while(power<step)power*=2;step=power;}return{width:Math.ceil(width/step),height:Math.ceil(height/step),step};}
function predictedGrid(width,height,maximum,minimum,sampling,pixels,row,budget){if(sampling==='proportional'){const scale=Math.sqrt(Math.max(1,budget-(row.overhead??0))/(row.cost*width*height));return dimensions(width,height,Math.max(minimum,Math.min(maximum,Math.floor(Math.max(width,height)*scale))),sampling,pixels);}const finest=dimensions(width,height,maximum,sampling,pixels);let low=finest.step,high=Math.max(low,dimensions(width,height,minimum,sampling,pixels).step);while(low<high){const middle=low+Math.floor((high-low)/2),cost=Math.ceil(width/middle)*Math.ceil(height/middle)*row.cost+(row.overhead??0);if(cost<=budget)high=middle;else low=middle+1;}if(sampling==='power-of-two'){let power=1;while(power<low)power*=2;low=power;}return{width:Math.ceil(width/low),height:Math.ceil(height/low),step:low};}
function stateFor(row,{width,height,sampling,sourceIdentity,side}){const old=qualityState(row?.qualityPolicy);return old&&old.width===width&&old.height===height&&old.sampling===sampling&&old.sourceIdentity===(sourceIdentity??null)?old:{version:2,width,height,sampling,sourceIdentity:sourceIdentity??null,side,overloads:0,gentleOverloads:0,recovery:0,evidenceId:0,evidenceStartedAt:0,reductions:0};}
const cadence=milliseconds=>clamp(milliseconds,PREVIEW_QUALITY_POLICY.minimumCadenceMilliseconds,PREVIEW_QUALITY_POLICY.maximumCadenceMilliseconds);
/** Source identity is an opaque, temporary proof scope. It is never stored in
 * localStorage; keys remain public operation/cost families. Completed/presented
 * evidence, not queue age, cancellation or skipped values, controls reductions.
 */
export function createAdaptivePreview({targetMs=100,fallbackMs=200,maxSide=ADAPTIVE_PREVIEW_MAX_SIDE,initialSide=maxSide,minSide=16,maxPixels=ADAPTIVE_PREVIEW_MAX_PIXELS,calibrations=shared,persist=true,now=clock,wallNow=epoch}={}){
 if(!Number.isFinite(targetMs)||targetMs<=0||!Number.isFinite(fallbackMs)||fallbackMs<=0)throw TypeError('Invalid preview latency target.');fallbackMs=Math.max(targetMs,fallbackMs);if(calibrations===shared)load();
 const continuityCaps=new Map();
 function importFeedback(feedback){const row=clean(feedback?.calibration);if(feedback?.schema==='adaptive-preview-feedback/1'&&typeof feedback.key==='string'&&feedback.key.length<=192&&row&&!older(row,calibrations.get(feedback.key)))remember(calibrations,feedback.key,row,persist);}
 function plan({key,width,height,sourceIdentity,maxSide:bound=maxSide,maxPixels:pixels=maxPixels,minSide:minimum=minSide,sampling='integer',feedback,continuity,integerHalving=false}={}){
  if(typeof integerHalving!=='boolean')throw TypeError('Invalid integer preview reduction permission.');
  const halfStep=integerHalving&&sampling==='integer';if(halfStep&&typeof key==='string')key+='/half-step';
  importFeedback(feedback);
  if(typeof key!=='string'||!key||key.length>192||![width,height].every(v=>Number.isSafeInteger(v)&&v>0)||!['integer','power-of-two','proportional'].includes(sampling)||!Number.isFinite(bound)||bound<1||!Number.isFinite(pixels)||pixels<1||sourceIdentity!==undefined&&(typeof sourceIdentity!=='string'||sourceIdentity.length>4096))throw TypeError('Invalid adaptive preview bounds.');
  const maximum=Math.max(1,Math.min(Math.max(width,height),Math.floor(bound),Math.floor(Math.sqrt(pixels*Math.max(width,height)/Math.min(width,height))))),lower=Math.min(maximum,Math.max(1,Math.floor(minimum))),prior=clean(calibrations.get(key)),initial=clamp(initialSide,lower,maximum),policy=stateFor(prior,{width,height,sampling,sourceIdentity,side:initial});let chosen=dimensions(width,height,clamp(policy.side,lower,maximum),sampling,pixels);
  // A statistical prediction can increase quality after two fast completed
  // frames. Smaller grids require distinct completed-frame latency evidence.
  if(prior?.samples>0&&policy.recovery===2){const finer=predictedGrid(width,height,maximum,lower,sampling,pixels,prior,fallbackMs*.96);if(finer.step<chosen.step){chosen=finer;policy.recovery=policy.overloads=policy.gentleOverloads=0;}}
  // This separate signal contains actual dispatched work without a painted
  // frame. It never becomes a per-pixel cost or completed-frame sample.
  let continuityDecision=null;
  if(continuity?.schema==='preview-continuity/1'&&typeof continuity.scope==='string'&&continuity.scope.length<=4096&&Number.isInteger(continuity.misses)&&continuity.misses>=0&&continuity.misses<=PREVIEW_QUALITY_POLICY.maxNoFrameWindows){
   if(!continuity.misses)continuityCaps.delete(key);
   else{
    const scope=JSON.stringify([continuity.scope,sourceIdentity??null,width,height,sampling,maximum,pixels]);let cap=continuityCaps.get(key);
    if(cap?.scope!==scope){cap={scope,side:Math.max(chosen.width,chosen.height)};continuityCaps.delete(key);continuityCaps.set(key,cap);while(continuityCaps.size>MAX_ENTRIES)continuityCaps.delete(continuityCaps.keys().next().value);}
    const currentSide=Math.max(chosen.width,chosen.height),requestedSide=Math.max(lower,Math.floor(cap.side*PREVIEW_QUALITY_POLICY.noFrameGentleScale**continuity.misses));let next=dimensions(width,height,Math.min(currentSide,requestedSide),sampling,pixels);
    if(continuity.misses<PREVIEW_QUALITY_POLICY.noFrameStrongWindows&&sampling!=='proportional'){const step=gentlePreviewStep({width,height,currentSide,step:next.step,sampling});next={width:Math.ceil(width/step),height:Math.ceil(height/step),step};}
    const smaller=Math.max(next.width,next.height)<currentSide;if(smaller)chosen=next;
    continuityDecision={missedWorkWindows:continuity.misses,windowMilliseconds:PREVIEW_QUALITY_POLICY.noFrameWorkWindowMilliseconds,minimumAttemptsPerWindow:PREVIEW_QUALITY_POLICY.noFrameMinimumAttempts,requestedSide,resolutionReduced:smaller,gridDeferred:!smaller,reason:'dispatched-owned-work-without-presentation'};
   }
  }
  if(halfStep)policy.biomesGridRevision??=0;
  const side=Math.max(chosen.width,chosen.height);if(side!==policy.side){policy.side=side;policy.overloads=policy.gentleOverloads=policy.recovery=0;if(halfStep)policy.biomesGridRevision++;}
  const latencyTarget={preferredTargetMs:targetMs,fallbackTargetMs:fallbackMs,selectedTargetMs:targetMs,reason:'quality-first-tiered-completed-frame-hysteresis',misses:policy.overloads,gentleMisses:policy.gentleOverloads,gentleReductionThresholdMilliseconds:300,recovery:policy.recovery,reductionThresholdMilliseconds:500,requiredCompletedFrames:2};
  const token={schema:'adaptive-preview-token/1',costModel:MODEL,id:++serial,key,targetMs,preferredTargetMs:targetMs,fallbackTargetMs:fallbackMs,qualityPolicy:policy,latencyTarget,...(halfStep?{integerHalving:true}:{}),...(continuityDecision?{continuity:continuityDecision}:{}),width,height,side,pixels:chosen.width*chosen.height,step:chosen.step,sampling,maximumSide:maximum,maximumPixels:pixels,minimumSide:Math.min(lower,side),startedAt:wallNow(),startedClock:now(),priorSamples:prior?.samples??0,priorCalibration:prior?{...prior}:null};
  return{...token,width:chosen.width,height:chosen.height,logicalWidth:width,logicalHeight:height,token,calibrated:!!prior};
 }
 function observe(choice,measurement={}){
  const {milliseconds,setupMilliseconds=0,cold=false,cached=false,initializationUnknown=false,displayMilliseconds=0,pixels:count}=measurement,painted=Object.hasOwn(measurement,'displayMilliseconds'),completed=painted||measurement.completed===true;
  const token=choice?.token??choice;if(token?.schema!=='adaptive-preview-token/1'||token.costModel!==MODEL||!valid(milliseconds)||!valid(setupMilliseconds)||!valid(displayMilliseconds)||measurement.stale===true||measurement.cancelled===true||measurement.aborted===true||measurement.presented===false)return null;
  const current=clean(calibrations.get(token.key));if(older({lastStartedAt:token.startedAt,lastId:token.id,painted},current)||current?.lastId===token.id&&current.lastStartedAt===token.startedAt&&(current.painted&&painted||current.completed&&!painted))return null;
  const n=Number.isSafeInteger(count)&&count>0?count:token.pixels,measured=Math.max(.01,milliseconds-Math.min(milliseconds,setupMilliseconds)),previous=current&&current.lastId!==token.id?current:token.priorCalibration;
  if(initializationUnknown||cold&&setupMilliseconds===0)return{schema:'adaptive-preview-feedback/1',key:token.key,calibration:previous?{...previous}:null,calibrationDeferred:true,targetMs:token.targetMs,measuredMs:milliseconds,calibrationMs:measured,setupMilliseconds,cold,cached,initializationUnknown,suggestedCadenceMilliseconds:cadence(measured),token};
  const fixed=Math.min(measured,displayMilliseconds),variable=Math.max(.01,measured-fixed),cost=variable/n,alpha=(cold||cached)&&previous?.samples?0:.65,variance=previous&&alpha?Math.min(2,(previous.variance??0)*.5+Math.abs(cost/previous.cost-1)*.5):previous?.variance??0,smoothed=previous&&alpha<1?previous.cost*(1-alpha)+cost*alpha:cost,overhead=(cold||cached)&&previous?previous.overhead??0:previous?(previous.overhead??0)*.35+fixed*.65:fixed;
  let policy=stateFor(previous,{width:token.width,height:token.height,sampling:token.sampling,sourceIdentity:token.qualityPolicy?.sourceIdentity,side:token.side});
  const gridAware=token.integerHalving===true,currentGridRevision=policy.biomesGridRevision??0,offeredGridRevision=token.qualityPolicy?.biomesGridRevision??0,gridObservationSuperseded=gridAware&&offeredGridRevision<currentGridRevision;
  // A useful old-grid frame may finish after a newer painted frame chose a
  // smaller grid. Its cost remains observable, but cannot undo that decision.
  if(gridAware&&offeredGridRevision>currentGridRevision)policy=qualityState(token.qualityPolicy)??policy;
  if(!gridObservationSuperseded&&policy.side!==token.side){policy.side=token.side;policy.overloads=policy.gentleOverloads=policy.recovery=0;if(gridAware)policy.biomesGridRevision=Math.max(currentGridRevision,offeredGridRevision)+1;}
  const fresh=policy.evidenceId!==token.id||policy.evidenceStartedAt!==token.startedAt,evidence=completed&&!cold&&!cached&&!initializationUnknown&&fresh&&!gridObservationSuperseded;
  let reduced=false,reductionKind=null,gentleGridDeferred=false;
  if(evidence){
   policy.evidenceId=token.id;policy.evidenceStartedAt=token.startedAt;
   policy.overloads=measured>PREVIEW_QUALITY_POLICY.reductionThresholdMilliseconds?Math.min(2,policy.overloads+1):0;
   policy.gentleOverloads=measured>PREVIEW_QUALITY_POLICY.gentleReductionThresholdMilliseconds?Math.min(2,policy.gentleOverloads+1):0;
   policy.recovery=measured<=PREVIEW_QUALITY_POLICY.recoveryThresholdMilliseconds?Math.min(2,policy.recovery+1):0;
   const predicted=predictedGrid(token.width,token.height,token.maximumSide,token.minimumSide,token.sampling,token.maximumPixels,{cost:smoothed,overhead},token.fallbackTargetMs*.96),request=previewResolutionRequest({milliseconds:measured,overloads:policy.overloads,gentleOverloads:policy.gentleOverloads,side:token.side,minimumSide:token.minimumSide,predictedSide:Math.max(predicted.width,predicted.height)});
   if(request){
    // Biomes may opt into the next integer grid down to one half per axis.
    // The permission travels with the painted token; all other families keep
    // the shared 30% gentle limit and the unchanged hard-overload contract.
    const minimumScale=request.kind==='gentle'&&token.sampling==='integer'&&token.integerHalving===true?0.5:request.minimumScale;
    let next=dimensions(token.width,token.height,Math.min(token.side,request.side),token.sampling,token.maximumPixels);
    if(request.kind==='gentle'&&token.sampling!=='proportional'){const step=gentlePreviewStep({width:token.width,height:token.height,currentSide:token.side,step:next.step,sampling:token.sampling,minimumScale});next={width:Math.ceil(token.width/step),height:Math.ceil(token.height/step),step};}
    const side=Math.max(next.width,next.height);
    if(side<token.side&&side>=token.side*minimumScale){policy.side=side;policy.reductions++;if(gridAware)policy.biomesGridRevision=(policy.biomesGridRevision??0)+1;reduced=true;reductionKind=request.kind;policy.overloads=policy.gentleOverloads=policy.recovery=0;}
    else if(request.kind==='gentle')gentleGridDeferred=true;
    else policy.overloads=policy.gentleOverloads=policy.recovery=0;
   }
  }
  const row={costModel:MODEL,side:policy.side,cost:smoothed,samples:(previous?.samples??0)+1,variance,overhead,lastMs:measured,lastStartedAt:token.startedAt,lastId:token.id,painted,completed,qualityPolicy:policy};remember(calibrations,token.key,row,persist);
  return{schema:'adaptive-preview-feedback/1',key:token.key,calibration:{...row},targetMs:token.targetMs,measuredMs:milliseconds,calibrationMs:measured,setupMilliseconds,cold,cached,qualityPolicy:{completedEvidence:evidence,...(gridAware?{gridObservationSuperseded,biomesGridRevision:policy.biomesGridRevision??0}:{}),overloadCount:policy.overloads,requiredOverloadCount:2,reductionThresholdMilliseconds:500,gentleOverloadCount:policy.gentleOverloads,gentleReductionThresholdMilliseconds:300,gentleGridDeferred,resolutionReduced:reduced,reductionKind,nextSide:policy.side},suggestedCadenceMilliseconds:cadence(measured),safetyMargin:.04,overheadExceedsTarget:displayMilliseconds>=token.fallbackTargetMs,minimumResolutionExceedsTarget:token.side<=token.minimumSide&&measured>token.fallbackTargetMs,token};
 }
 return{plan,observe,importFeedback,reset(){},get state(){return{targetMs,fallbackMs,calibrations:calibrations.size,qualityPolicy:PREVIEW_QUALITY_POLICY};}};
}
const presentation=createAdaptivePreview();
/** Superseded compute-only replies are not resolution evidence. */
export function reportAdaptivePreviewComputed(){return null;}
/** Full display acknowledgement replaces its compute sample exactly once. */
export function reportAdaptivePreviewPresented(value,{milliseconds,presentedAt=Date.now(),displayMilliseconds,stale=false,cancelled=false}={}){
 const metrics=value?.adaptivePreview??value,token=metrics?.token??metrics;if(isFrequencyPreviewToken(token))return frequencyPreviewPresented(metrics,{milliseconds,presentedAt,displayMilliseconds,stale,cancelled});if(token?.schema!=='adaptive-preview-token/1')return null;
 const elapsed=milliseconds??Math.max(0,presentedAt-token.startedAt),renderCost=displayMilliseconds??Math.max(0,elapsed-(metrics?.milliseconds??elapsed));return presentation.observe(token,{milliseconds:elapsed,setupMilliseconds:metrics?.setupMilliseconds??0,cold:metrics?.cold??false,cached:metrics?.cached??false,initializationUnknown:metrics?.initializationUnknown??false,displayMilliseconds:renderCost,pixels:metrics?.pixels??token.pixels,stale,cancelled});
}
