// Provisional display calibration only. No native analysis parameter is changed.
const STORE_KEY='sherloq.preview-calibration.v2',MAX_ENTRIES=128;
export const ADAPTIVE_PREVIEW_MAX_SIDE=2048,ADAPTIVE_PREVIEW_MAX_PIXELS=2048**2;
const shared=new Map();let serial=0,loaded=false;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const clock=()=>globalThis.performance?.now?.()??Date.now();
const epoch=()=>Date.now();
const valid=v=>Number.isFinite(v)&&v>=0;
function storage(){try{return globalThis.localStorage;}catch{return null;}}
function clean(value){return value&&value.costModel===2&&Number.isFinite(value.side)&&value.side>=1&&Number.isFinite(value.cost)&&value.cost>0&&Number.isSafeInteger(value.samples)&&value.samples>=0?{costModel:2,side:value.side,cost:value.cost,samples:value.samples,variance:valid(value.variance)?value.variance:0,overhead:valid(value.overhead)?value.overhead:0,lastMs:valid(value.lastMs)?value.lastMs:0,lastStartedAt:valid(value.lastStartedAt)?value.lastStartedAt:0,lastId:Number.isSafeInteger(value.lastId)?value.lastId:0}:null;}
function load(){if(loaded)return;loaded=true;try{const rows=JSON.parse(storage()?.getItem(STORE_KEY)??'null');if(rows?.version===2&&Array.isArray(rows.entries))for(const[key,value]of rows.entries.slice(-MAX_ENTRIES)){const row=clean(value);if(typeof key==='string'&&key.length<=192&&row)shared.set(key,row);}}catch{}}
function save(){try{storage()?.setItem(STORE_KEY,JSON.stringify({version:2,entries:[...shared.entries()]}));}catch{}}
function remember(map,key,row,persist){map.delete(key);map.set(key,row);while(map.size>MAX_ENTRIES)map.delete(map.keys().next().value);if(persist&&map===shared)save();}
function dimensions(width,height,side,sampling,pixels){let step=Math.max(1,Math.ceil(Math.max(width,height)/side));if(Math.ceil(width/step)*Math.ceil(height/step)>pixels){let low=step,high=Math.max(width,height);while(low<high){const middle=low+Math.floor((high-low)/2);if(Math.ceil(width/middle)*Math.ceil(height/middle)<=pixels)high=middle;else low=middle+1;}step=low;}if(sampling==='power-of-two'){let power=1;while(power<step)power*=2;step=power;}return{width:Math.ceil(width/step),height:Math.ceil(height/step),step};}
/** Keys identify a public operation/cost family, never a source ID or filename.
 * setupMilliseconds covers one-time initialization, not ordinary sample/read
 * costs. Those remain in the 50ms end-to-end target on every warm frame.
 */
export function createAdaptivePreview({targetMs=50,initialSide=128,minSide=16,maxSide=2048,maxPixels=2048**2,calibrations=shared,persist=true,now=clock,wallNow=epoch}={}){
 if(!Number.isFinite(targetMs)||targetMs<=0)throw TypeError('Invalid preview latency target.');if(calibrations===shared)load();
 function importFeedback(feedback){const row=clean(feedback?.calibration);if(feedback?.schema==='adaptive-preview-feedback/1'&&typeof feedback.key==='string'&&feedback.key.length<=192&&row)remember(calibrations,feedback.key,row,persist);}
 function plan({key,width,height,maxSide:bound=maxSide,maxPixels:pixels=maxPixels,minSide:minimum=minSide,sampling='integer',feedback}={}){
  importFeedback(feedback);
  if(typeof key!=='string'||!key||key.length>192||![width,height].every(v=>Number.isSafeInteger(v)&&v>0)||!['integer','power-of-two'].includes(sampling)||!Number.isFinite(bound)||bound<1||!Number.isFinite(pixels)||pixels<1)throw TypeError('Invalid adaptive preview bounds.');
  const maximum=Math.max(1,Math.min(Math.max(width,height),Math.floor(bound),Math.floor(Math.sqrt(pixels* Math.max(width,height)/Math.min(width,height))))),lower=Math.min(maximum,Math.max(1,Math.floor(minimum))),prior=calibrations.get(key),desired=clamp(prior?.side??initialSide,lower,maximum);let chosen=dimensions(width,height,desired,sampling,pixels);
  // Integer sampling can leave a large resolution gap. Probe the next finer
  // grid only when the warm model predicts it below the full latency target.
  if(prior?.samples>=3&&(prior.variance??0)<.15&&chosen.step>1){const step=sampling==='power-of-two'?chosen.step/2:chosen.step-1,w=Math.ceil(width/step),h=Math.ceil(height/step);if(Math.max(w,h)<=maximum&&w*h<=pixels&&w*h*prior.cost+(prior.overhead??0)<=targetMs*.96)chosen={width:w,height:h,step};}
  const side=Math.max(chosen.width,chosen.height),token={schema:'adaptive-preview-token/1',id:++serial,key,targetMs,width,height,side,pixels:chosen.width*chosen.height,step:chosen.step,sampling,maximumSide:maximum,maximumPixels:pixels,minimumSide:lower,startedAt:wallNow(),startedClock:now(),priorSamples:prior?.samples??0,priorCalibration:prior?{...prior}:null};
  return{...token,width:chosen.width,height:chosen.height,logicalWidth:width,logicalHeight:height,token,calibrated:!!prior};
 }
 function observe(choice,{milliseconds,setupMilliseconds=0,cold=false,cached=false,displayMilliseconds=0,pixels:count}={}){
  const token=choice?.token??choice;if(token?.schema!=='adaptive-preview-token/1'||!valid(milliseconds)||!valid(setupMilliseconds)||!valid(displayMilliseconds))return null;
  const goal=Number.isFinite(token.targetMs)&&token.targetMs>0&&token.targetMs<=1000?token.targetMs:targetMs;
  const current=calibrations.get(token.key);if(current&&(current.lastStartedAt>token.startedAt||current.lastStartedAt===token.startedAt&&current.lastId>token.id))return null;
  const n=Number.isSafeInteger(count)&&count>0?count:token.pixels,measured=Math.max(.01,milliseconds-(cold?Math.min(milliseconds,setupMilliseconds):0)),previous=Object.hasOwn(token,'priorCalibration')?token.priorCalibration:current,fixed=Math.min(measured,displayMilliseconds),variable=Math.max(.01,measured-fixed),cost=variable/n,alpha=(cold||cached)&&previous?.samples?0:.65;
  const variance=previous&&alpha?Math.min(2,(previous.variance??0)*.5+Math.abs(cost/previous.cost-1)*.5):previous?.variance??0,smoothed=previous&&alpha<1?previous.cost*(1-alpha)+cost*alpha:cost,overhead=previous?(previous.overhead??0)*.35+fixed*.65:fixed,effective=Math.max(.01,smoothed*n,!cached&&measured>goal?variable:0),safety=clamp(.90-.10*variance,.80,.90),available=Math.max(.001,goal*safety-overhead),factor=clamp(Math.sqrt(available/effective),.5,2),side=clamp(token.side*factor,token.minimumSide,token.maximumSide),row={costModel:2,side,cost:smoothed,samples:(previous?.samples??0)+1,variance,overhead,lastMs:measured,lastStartedAt:token.startedAt,lastId:token.id};
  remember(calibrations,token.key,row,persist);
  return{schema:'adaptive-preview-feedback/1',key:token.key,calibration:{...row},targetMs:goal,measuredMs:milliseconds,calibrationMs:measured,setupMilliseconds,cold,cached,safetyMargin:1-safety,overheadExceedsTarget:displayMilliseconds>=goal,minimumResolutionExceedsTarget:token.side<=token.minimumSide&&measured>goal,token};
 }
 return{plan,observe,importFeedback,reset(){},get state(){return{targetMs,calibrations:calibrations.size};}};
}
const presentation=createAdaptivePreview();
/** Call after draw. The serializable return value can be carried to a worker
 * owner as preview.adaptiveFeedback on its next request, without a new RPC.
 */
export function reportAdaptivePreviewPresented(value,{milliseconds,presentedAt=Date.now(),displayMilliseconds}={}){
 const metrics=value?.adaptivePreview??value,token=metrics?.token??metrics;if(token?.schema!=='adaptive-preview-token/1')return null;
 const elapsed=milliseconds??Math.max(0,presentedAt-token.startedAt),renderCost=displayMilliseconds??Math.max(0,elapsed-(metrics?.milliseconds??elapsed));
 return presentation.observe(token,{milliseconds:elapsed,setupMilliseconds:metrics?.setupMilliseconds??0,cold:metrics?.cold??false,cached:metrics?.cached??false,displayMilliseconds:renderCost,pixels:metrics?.pixels??token.pixels});
}
