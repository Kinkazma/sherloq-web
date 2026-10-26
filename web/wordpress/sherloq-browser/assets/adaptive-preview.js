import {isFrequencyPreviewToken,frequencyPreviewPresented} from './frequency-preview-sizing.js';
// Provisional display calibration only. No native analysis parameter is changed.
const STORE_KEY='sherloq.preview-calibration.v2',MAX_ENTRIES=128;
export const ADAPTIVE_PREVIEW_MAX_SIDE=2048,ADAPTIVE_PREVIEW_MAX_PIXELS=2048**2;
const shared=new Map();let serial=0,loaded=false;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const clock=()=>globalThis.performance?.now?.()??Date.now();
const epoch=()=>Date.now();
const valid=v=>Number.isFinite(v)&&v>=0;
function storage(){try{return globalThis.localStorage;}catch{return null;}}
function cleanLatency(value){
 if(!value||value.version!==1||![value.width,value.height,value.minimumWidth,value.minimumHeight].every(v=>Number.isSafeInteger(v)&&v>0)||!['integer','power-of-two'].includes(value.sampling)||![value.preferredMs,value.fallbackMs].every(v=>Number.isFinite(v)&&v>0)||value.fallbackMs<value.preferredMs||![value.misses,value.recovery].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=2)||!Number.isSafeInteger(value.evidenceId)||value.evidenceId<0||!valid(value.evidenceStartedAt)||!(value.paintedCost===null||Number.isFinite(value.paintedCost)&&value.paintedCost>0)||!(value.paintedOverhead===null||valid(value.paintedOverhead))||!(value.paintedVariance===null||valid(value.paintedVariance)))return null;
 if([value.paintedCost,value.paintedOverhead,value.paintedVariance].some(v=>v===null)&&![value.paintedCost,value.paintedOverhead,value.paintedVariance].every(v=>v===null))return null;
 return{version:1,width:value.width,height:value.height,minimumWidth:value.minimumWidth,minimumHeight:value.minimumHeight,sampling:value.sampling,preferredMs:value.preferredMs,fallbackMs:value.fallbackMs,active:value.active===true,misses:value.misses,recovery:value.recovery,evidenceId:value.evidenceId,evidenceStartedAt:value.evidenceStartedAt,paintedCost:value.paintedCost,paintedOverhead:value.paintedOverhead,paintedVariance:value.paintedVariance};
}
function clean(value){return value&&value.costModel===2&&Number.isFinite(value.side)&&value.side>=1&&Number.isFinite(value.cost)&&value.cost>0&&Number.isSafeInteger(value.samples)&&value.samples>=0?{costModel:2,side:value.side,cost:value.cost,samples:value.samples,variance:valid(value.variance)?value.variance:0,overhead:valid(value.overhead)?value.overhead:0,lastMs:valid(value.lastMs)?value.lastMs:0,lastStartedAt:valid(value.lastStartedAt)?value.lastStartedAt:0,lastId:Number.isSafeInteger(value.lastId)?value.lastId:0,painted:value.painted===true,...(valid(value.lastTargetMs)&&value.lastTargetMs>0?{lastTargetMs:value.lastTargetMs}:{}),...(cleanLatency(value.latencyPolicy)?{latencyPolicy:cleanLatency(value.latencyPolicy)}:{})}:null;}
function load(){if(loaded)return;loaded=true;try{const rows=JSON.parse(storage()?.getItem(STORE_KEY)??'null');if(rows?.version===2&&Array.isArray(rows.entries))for(const[key,value]of rows.entries.slice(-MAX_ENTRIES)){const row=clean(value);if(typeof key==='string'&&key.length<=192&&row)shared.set(key,row);}}catch{}}
function save(){try{storage()?.setItem(STORE_KEY,JSON.stringify({version:2,entries:[...shared.entries()]}));}catch{}}
const older=(row,current)=>current&&(row.lastStartedAt<current.lastStartedAt||row.lastStartedAt===current.lastStartedAt&&(row.lastId<current.lastId||row.lastId===current.lastId&&current.painted&&!row.painted));
function remember(map,key,row,persist){map.delete(key);map.set(key,row);while(map.size>MAX_ENTRIES)map.delete(map.keys().next().value);if(persist&&map===shared)save();}
function dimensions(width,height,side,sampling,pixels){let step=Math.max(1,Math.ceil(Math.max(width,height)/side));if(Math.ceil(width/step)*Math.ceil(height/step)>pixels){let low=step,high=Math.max(width,height);while(low<high){const middle=low+Math.floor((high-low)/2);if(Math.ceil(width/middle)*Math.ceil(height/middle)<=pixels)high=middle;else low=middle+1;}step=low;}if(sampling==='power-of-two'){let power=1;while(power<step)power*=2;step=power;}return{width:Math.ceil(width/step),height:Math.ceil(height/step),step};}
// The existing cost model is unchanged. Only warm, genuinely painted frames
// may establish that even the minimum legal grid misses the preferred target.
function latencyState(prior,{width,height,minimum,sampling,preferredMs,fallbackMs}){
 const old=cleanLatency(prior?.latencyPolicy);
 if(old&&old.width===width&&old.height===height&&old.minimumWidth===minimum.width&&old.minimumHeight===minimum.height&&old.sampling===sampling&&old.preferredMs===preferredMs&&old.fallbackMs===fallbackMs)return old;
 return{version:1,width,height,minimumWidth:minimum.width,minimumHeight:minimum.height,sampling,preferredMs,fallbackMs,active:false,misses:0,recovery:0,evidenceId:0,evidenceStartedAt:0,paintedCost:null,paintedOverhead:null,paintedVariance:null};
}
function latencyDecision(state){
 const predicted=state.paintedCost===null?null:state.minimumWidth*state.minimumHeight*state.paintedCost+state.paintedOverhead,reliable=predicted!==null&&state.paintedVariance<.15,impossible=reliable&&predicted>state.preferredMs;
 // Even a latched fallback never authorizes a finer200ms grid when a50ms
 // minimum is again predicted possible. Two clear fits disarm the latch.
 const fallback=state.fallbackMs>state.preferredMs&&state.active&&state.misses===2&&impossible;
 return{preferredTargetMs:state.preferredMs,fallbackTargetMs:state.fallbackMs,selectedTargetMs:fallback?state.fallbackMs:state.preferredMs,minimumDimensions:[state.minimumWidth,state.minimumHeight],predictedMinimumMilliseconds:predicted,minimumExceedsPreferred:impossible,minimumExceedsFallback:reliable&&predicted>state.fallbackMs,reason:fallback?'warm-painted-minimum-exceeds-preferred':impossible?'awaiting-second-warm-painted-minimum-miss':predicted===null?'painted-cost-unknown':!reliable?'painted-cost-uncertain':'preferred-grid-predicted-possible',fallbackLatched:state.active,misses:state.misses,recovery:state.recovery};
}
function observeLatency(token,row,{painted,cold,cached}){
 const state=cleanLatency(token.latencyPolicy);if(!state)return null;
 if(!painted||cold||cached||state.evidenceId===token.id&&state.evidenceStartedAt===token.startedAt)return state;
 state.evidenceId=token.id;state.evidenceStartedAt=token.startedAt;state.paintedCost=row.cost;state.paintedOverhead=row.overhead;state.paintedVariance=row.variance;
 if(row.variance>=.15){state.misses=state.recovery=0;return state;}
 const predicted=state.minimumWidth*state.minimumHeight*row.cost+row.overhead;
 state.misses=predicted>state.preferredMs?Math.min(2,state.misses+1):0;
 state.recovery=predicted<=state.preferredMs*.90?Math.min(2,state.recovery+1):0;
 if(state.misses===2&&state.fallbackMs>state.preferredMs)state.active=true;
 if(state.recovery===2)state.active=false;
 return state;
}
/** Keys identify a public operation/cost family, never a source ID or filename.
 * setupMilliseconds covers one-time initialization, not ordinary sample/read
 * costs. Those remain in the 50ms end-to-end target on every warm frame.
 */
export function createAdaptivePreview({targetMs=50,fallbackMs=200,initialSide=128,minSide=16,maxSide=2048,maxPixels=2048**2,calibrations=shared,persist=true,now=clock,wallNow=epoch}={}){
 if(!Number.isFinite(targetMs)||targetMs<=0||!Number.isFinite(fallbackMs)||fallbackMs<=0)throw TypeError('Invalid preview latency target.');fallbackMs=Math.max(targetMs,fallbackMs);if(calibrations===shared)load();
 function importFeedback(feedback){const row=clean(feedback?.calibration);if(feedback?.schema==='adaptive-preview-feedback/1'&&typeof feedback.key==='string'&&feedback.key.length<=192&&row&&!older(row,calibrations.get(feedback.key)))remember(calibrations,feedback.key,row,persist);}
 function plan({key,width,height,maxSide:bound=maxSide,maxPixels:pixels=maxPixels,minSide:minimum=minSide,sampling='integer',feedback}={}){
  importFeedback(feedback);
  if(typeof key!=='string'||!key||key.length>192||![width,height].every(v=>Number.isSafeInteger(v)&&v>0)||!['integer','power-of-two'].includes(sampling)||!Number.isFinite(bound)||bound<1||!Number.isFinite(pixels)||pixels<1)throw TypeError('Invalid adaptive preview bounds.');
  const maximum=Math.max(1,Math.min(Math.max(width,height),Math.floor(bound),Math.floor(Math.sqrt(pixels* Math.max(width,height)/Math.min(width,height))))),lower=Math.min(maximum,Math.max(1,Math.floor(minimum))),prior=calibrations.get(key),minimumGrid=dimensions(width,height,lower,sampling,pixels),latencyPolicy=latencyState(prior,{width,height,minimum:minimumGrid,sampling,preferredMs:targetMs,fallbackMs}),target=latencyDecision(latencyPolicy),goal=target.selectedTargetMs,desired=clamp(prior?.side??initialSide,lower,maximum);let chosen=dimensions(width,height,desired,sampling,pixels);
  // A previous200ms desired side must not force a now-feasible50ms request
  // to start at its old larger grid. Coarsen on the same legal lattice only.
  if(prior?.lastTargetMs>goal&&prior.cost>0){let low=chosen.step,high=Math.max(low,minimumGrid.step);while(low<high){const middle=low+Math.floor((high-low)/2);if(Math.ceil(width/middle)*Math.ceil(height/middle)*prior.cost+(prior.overhead??0)<=goal)high=middle;else low=middle+1;}if(sampling==='power-of-two'){let power=1;while(power<low)power*=2;low=power;}chosen={width:Math.ceil(width/low),height:Math.ceil(height/low),step:low};}
  // Integer sampling can leave a large resolution gap. Probe the next finer
  // grid only when the warm model predicts it below the full latency target.
  if(prior?.samples>=3&&(prior.variance??0)<.15&&chosen.step>1){const step=sampling==='power-of-two'?chosen.step/2:chosen.step-1,w=Math.ceil(width/step),h=Math.ceil(height/step);if(Math.max(w,h)<=maximum&&w*h<=pixels&&w*h*prior.cost+(prior.overhead??0)<=goal*.96)chosen={width:w,height:h,step};}
  const side=Math.max(chosen.width,chosen.height),token={schema:'adaptive-preview-token/1',id:++serial,key,targetMs:goal,preferredTargetMs:targetMs,fallbackTargetMs:fallbackMs,latencyPolicy,latencyTarget:target,width,height,side,pixels:chosen.width*chosen.height,step:chosen.step,sampling,maximumSide:maximum,maximumPixels:pixels,minimumSide:lower,startedAt:wallNow(),startedClock:now(),priorSamples:prior?.samples??0,priorCalibration:prior?{...prior}:null};
  return{...token,width:chosen.width,height:chosen.height,logicalWidth:width,logicalHeight:height,token,calibrated:!!prior};
 }
 function observe(choice,measurement={}){
  const {milliseconds,setupMilliseconds=0,cold=false,cached=false,displayMilliseconds=0,pixels:count}=measurement,painted=Object.hasOwn(measurement,'displayMilliseconds');
  const token=choice?.token??choice;if(token?.schema!=='adaptive-preview-token/1'||!valid(milliseconds)||!valid(setupMilliseconds)||!valid(displayMilliseconds))return null;
  const goal=Number.isFinite(token.targetMs)&&token.targetMs>0&&token.targetMs<=1000?token.targetMs:targetMs;
  const current=calibrations.get(token.key);if(older({lastStartedAt:token.startedAt,lastId:token.id,painted},current))return null;
  const n=Number.isSafeInteger(count)&&count>0?count:token.pixels,measured=Math.max(.01,milliseconds-(cold?Math.min(milliseconds,setupMilliseconds):0)),previous=Object.hasOwn(token,'priorCalibration')?token.priorCalibration:current,fixed=Math.min(measured,displayMilliseconds),variable=Math.max(.01,measured-fixed),cost=variable/n,alpha=(cold||cached)&&previous?.samples?0:.65;
  const variance=previous&&alpha?Math.min(2,(previous.variance??0)*.5+Math.abs(cost/previous.cost-1)*.5):previous?.variance??0,smoothed=previous&&alpha<1?previous.cost*(1-alpha)+cost*alpha:cost,overhead=previous?(previous.overhead??0)*.35+fixed*.65:fixed,effective=Math.max(.01,smoothed*n,!cached&&measured>goal?variable:0),safety=clamp(.90-.10*variance,.80,.90),available=Math.max(.001,goal*safety-overhead),factor=clamp(Math.sqrt(available/effective),.5,2),side=clamp(token.side*factor,token.minimumSide,token.maximumSide),row={costModel:2,side,cost:smoothed,samples:(previous?.samples??0)+1,variance,overhead,lastMs:measured,lastStartedAt:token.startedAt,lastId:token.id,painted};
  row.lastTargetMs=goal;const latencyPolicy=observeLatency(token,row,{painted,cold,cached});if(latencyPolicy)row.latencyPolicy=latencyPolicy;
  remember(calibrations,token.key,row,persist);
  return{schema:'adaptive-preview-feedback/1',key:token.key,calibration:{...row},targetMs:goal,...(latencyPolicy?{nextLatencyTarget:latencyDecision(latencyPolicy)}:{}),measuredMs:milliseconds,calibrationMs:measured,setupMilliseconds,cold,cached,safetyMargin:1-safety,overheadExceedsTarget:displayMilliseconds>=goal,minimumResolutionExceedsTarget:token.side<=token.minimumSide&&measured>goal,token};
 }
 return{plan,observe,importFeedback,reset(){},get state(){return{targetMs,calibrations:calibrations.size};}};
}
const presentation=createAdaptivePreview();
/** Oversized completed drafts teach the next plan even when a newer value
 * prevented their display. A fast unpainted frame cannot justify a larger
 * frame: only presentation feedback measures its full display cost.
 */
export function reportAdaptivePreviewComputed(value){
 const metrics=value?.adaptivePreview??value,token=metrics?.token;
 if(isFrequencyPreviewToken(token))return null; // Already observed by the request owner.
 if(token?.schema!=='adaptive-preview-token/1'||typeof token.key!=='string'||!token.key||token.key.length>192||!Number.isSafeInteger(token.id)||!Number.isSafeInteger(token.pixels)||token.pixels<1||![token.targetMs,token.startedAt,token.side,token.minimumSide,token.maximumSide].every(Number.isFinite)||token.targetMs<=0||token.targetMs>1000||token.minimumSide<1||token.side<token.minimumSide||token.side>token.maximumSide||!valid(metrics.milliseconds))return null;
 const setup=metrics.setupMilliseconds??0;
 // Cached responses intentionally keep an older variable-cost model. They
 // cannot teach a new pixel cost before their full presentation is measured.
 if(!valid(setup)||metrics.cached===true||metrics.milliseconds-(metrics.cold?Math.min(metrics.milliseconds,setup):0)<=token.targetMs)return null;
 return presentation.observe(token,{milliseconds:metrics.milliseconds,setupMilliseconds:metrics.setupMilliseconds??0,cold:metrics.cold??false,cached:metrics.cached??false,pixels:metrics.pixels??token.pixels});
}
/** Call after draw. The serializable return value can be carried to a worker
 * owner as preview.adaptiveFeedback on its next request, without a new RPC.
 */
export function reportAdaptivePreviewPresented(value,{milliseconds,presentedAt=Date.now(),displayMilliseconds}={}){
 const metrics=value?.adaptivePreview??value,token=metrics?.token??metrics;if(isFrequencyPreviewToken(token))return frequencyPreviewPresented(metrics,{milliseconds,presentedAt,displayMilliseconds});if(token?.schema!=='adaptive-preview-token/1')return null;
 const elapsed=milliseconds??Math.max(0,presentedAt-token.startedAt),renderCost=displayMilliseconds??Math.max(0,elapsed-(metrics?.milliseconds??elapsed));
 return presentation.observe(token,{milliseconds:elapsed,setupMilliseconds:metrics?.setupMilliseconds??0,cold:metrics?.cold??false,cached:metrics?.cached??false,displayMilliseconds:renderCost,pixels:metrics?.pixels??token.pixels});
}
