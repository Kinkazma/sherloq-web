// Presentation sizing only: no FFT, pixels, native parameters, pools or probes.
// A live RGB source and an observed warm cost do not certify FFT residency.
export const FREQUENCY_SIZING_BYTES=131072;
const MODEL='frequency-owned-visible-grid/7',MAX_KEYS=8,MAX_GRIDS=4,MAX_OWNED=4;
let serial=0,scopeSerial=0;
const finite=value=>Number.isFinite(value)&&value>=0;
const positive=value=>Number.isSafeInteger(value)&&value>0;
const boundedId=value=>typeof value==='string'&&value.length>0&&value.length<=160;
const clone=value=>structuredClone(value);
export const isFrequencyPreviewToken=token=>token?.schema==='adaptive-preview-token/1'&&token.costModel===MODEL;
const sameGrid=(a,b)=>a.ownerKey===b.ownerKey&&a.sourceId===b.sourceId&&a.width===b.width&&a.height===b.height&&a.outputWidth===b.outputWidth&&a.outputHeight===b.outputHeight;
const validGrid=g=>g&&boundedId(g.ownerKey)&&boundedId(g.sourceId)&&[g.width,g.height,g.outputWidth,g.outputHeight].every(v=>positive(v)&&v<=2048)&&g.pixels===g.width*g.height&&finite(g.ms)&&(g.displayMs===null||finite(g.displayMs))&&positive(g.costId)&&Number.isSafeInteger(g.paintId)&&g.paintId>=0;
function validRow(row){return row&&Array.isArray(row.grids)&&row.grids.length<=MAX_GRIDS&&row.grids.every(validGrid)&&finite(row.displayMs)&&positive(row.lastId)&&typeof row.painted==='boolean'&&(!row.lastPaintedInput||validInput(row.lastPaintedInput))&&validProgression(row.progression);}
// Historical integer bootstrap, only without a compatible owned source. A warm
// cost is never extrapolated onto a different, newly created cold geometry.
function visitGrids(width,height,maxSide,maxPixels,minSide,visit){
 const longest=Math.max(width,height);let first=true;
 for(let step=Math.max(1,Math.ceil(longest/maxSide));step<=longest;){
  const w=Math.ceil(width/step),h=Math.ceil(height/step),side=Math.max(w,h),pixels=w*h;
  if(side<minSide&&!first)break;
  if(pixels<=maxPixels){visit({width:w,height:h,side,pixels,step,belowMinimum:side<minSide});first=false;if(side<minSide)break;}
  const endW=w>1?Math.floor((width-1)/(w-1)):longest,endH=h>1?Math.floor((height-1)/(h-1)):longest;
  step=Math.min(endW,endH)+1;
 }
}
function ownedCandidates(live,bounds){
 if(!Array.isArray(live)||live.length>MAX_OWNED)throw TypeError('Invalid owned frequency source inventory.');
 const seen=new Set(),out=[];
 for(const p of live){
  if(!p||!boundedId(p.sourceId)||!boundedId(p.ownerKey)||![p.width,p.height,p.side,p.step].every(positive)||p.width>2048||p.height>2048||p.side>2048||!Number.isSafeInteger(p.outputWidth)||!Number.isSafeInteger(p.outputHeight)||p.outputWidth<0||p.outputHeight<0||!!p.outputWidth!==!!p.outputHeight||p.deferredLatest!==undefined&&typeof p.deferredLatest!=='boolean')throw TypeError('Invalid owned frequency source geometry.');
  if(seen.has(p.ownerKey))throw TypeError('Duplicate owned frequency source.');seen.add(p.ownerKey);
  if(p.width>bounds.maxSide||p.height>bounds.maxSide||p.side>bounds.maxSide||p.width*p.height>bounds.maxPixels||p.outputWidth>bounds.maxSide||p.outputHeight>bounds.maxSide||p.outputWidth*p.outputHeight>bounds.maxPixels)continue;
  out.push({...p,pixels:p.width*p.height,belowMinimum:Math.max(p.width,p.height)<bounds.minSide});
 }
 return out.sort((a,b)=>b.pixels-a.pixels||b.side-a.side||a.ownerKey.localeCompare(b.ownerKey));
}
// Progression is a sequence of useful, painted user previews, never a probe.
// One blocked upper area stops repeated slow/refused trials. A separately bound
// one-use current-input opportunity may measure an owned cold grid warm; a
// resource refusal never grants this exception. No global maximum is proved.
const validGeometry=g=>validGrid({...g,ms:0,displayMs:null,costId:1,paintId:0});
const validInput=i=>i&&positive(i.gestureEpoch)&&positive(i.controlRequestId);
const validSpent=g=>g&&boundedId(g.sourceId)&&[g.width,g.height,g.outputWidth,g.outputHeight].every(v=>positive(v)&&v<=2048);
const validProgression=p=>!p||Number.isSafeInteger(p.blockedPixels)&&p.blockedPixels>=0&&(!p.accepted||validGeometry(p.accepted))&&(p.hardBlockedPixels===undefined||Number.isSafeInteger(p.hardBlockedPixels)&&p.hardBlockedPixels>=0)&&(!p.warmOpportunity||validGeometry(p.warmOpportunity)&&validInput(p.warmOpportunity.input))&&(p.spentWarm===undefined||Array.isArray(p.spentWarm)&&p.spentWarm.length<=MAX_OWNED&&p.spentWarm.every(validSpent));
const emptyProgression=()=>({blockedPixels:0,hardBlockedPixels:0,accepted:null,warmOpportunity:null,spentWarm:[]});
// A slow cold frame is not a warm timing measurement. Only an already owned
// post-miss geometry may get one useful NEW input, never a refinement probe.
function warmCurrentChoice(row,owned,base,input){
 const p=row?.progression,o=p?.warmOpportunity;
 if(!o||!validInput(input)||input.gestureEpoch!==o.input.gestureEpoch||input.controlRequestId<=o.input.controlRequestId||base.deadlineExceeded||base.remainingTargetMs<=0)return null;
 const resident=owned.find(g=>sameGrid(g,o));
 if(!resident||resident.pixels<=base.pixels||p.hardBlockedPixels&&resident.pixels>=p.hardBlockedPixels||(p.spentWarm??[]).length>=MAX_OWNED||(p.spentWarm??[]).some(g=>g.sourceId===resident.sourceId))return null;
 return{...resident,progressionMode:'owned-cold-timing-warm-current'};
}
function progressionChoice(bounds,row,owned,base){
 const progress=row?.progression??emptyProgression(),accepted=progress.accepted&&owned.find(p=>sameGrid(p,progress.accepted)),pivot=accepted&&accepted.pixels>base.pixels?accepted:base,ceiling=progress.blockedPixels||Infinity;
 const unknown=owned.filter(p=>p.pixels>pivot.pixels&&p.pixels<ceiling&&!row?.grids.some(g=>sameGrid(g,p)&&g.displayMs!==null)).sort((a,b)=>a.pixels-b.pixels||a.ownerKey.localeCompare(b.ownerKey))[0];
 if(unknown)return{...unknown,progressionMode:'owned-unknown'};
 let candidate,nearest;visitGrids(bounds.width,bounds.height,bounds.maxSide,bounds.maxPixels,bounds.minSide,g=>{if(g.pixels<=pivot.pixels||g.pixels>=ceiling||owned.some(p=>p.width===g.width&&p.height===g.height))return;nearest=g;if(!candidate&&g.pixels<=pivot.pixels*2)candidate=g;});
 return (candidate??nearest)?{...(candidate??nearest),progressionMode:'new-integer-grid'}:null;
}
// A continuously populated latest-input lane must not starve visible quality.
// Only a NEW useful input after a truly warm painted frame may explore the next
// admitted geometry. This schedules no job: the same active/latest owner uses
// the actual current parameters, and its cold/warm observations remain separate.
function currentInputReady(row,base,input){
 const painted=row?.lastPaintedInput;
 if(!validInput(input)||!validInput(painted)||input.gestureEpoch!==painted.gestureEpoch||input.controlRequestId<=painted.controlRequestId||base.deadlineExceeded||base.remainingTargetMs<=0)return false;
 const measured=row.grids.find(g=>g.sourceId===base.sourceId&&g.ownerKey===base.ownerKey&&g.paintId>0&&g.displayMs!==null&&g.ms+g.displayMs<=base.remainingTargetMs);
 return !!measured;
}
function currentInputChoice(bounds,row,owned,base,input){
 if(!currentInputReady(row,base,input))return null;
 const choice=progressionChoice(bounds,row,owned,base);
 return choice?{...choice,progressionMode:'current-input-'+choice.progressionMode,currentInputExploration:true}:null;
}
// A mathematical requirement only: no plan, capacity, prediction or calibration
// is created here. A larger grid still requires fresh real admission afterward.
function unadmittedNextGeometry(bounds,row,owned,base){
 const progress=row?.progression??emptyProgression(),accepted=progress.accepted&&owned.find(p=>sameGrid(p,progress.accepted)),pivot=accepted&&accepted.pixels>base.pixels?accepted:base,ceiling=Math.min(progress.blockedPixels||Infinity,progress.hardBlockedPixels||Infinity);
 let candidate,nearest;visitGrids(bounds.width,bounds.height,bounds.maxSide,bounds.maxSide**2,bounds.minSide,g=>{if(g.pixels<=pivot.pixels||g.pixels<=bounds.maxPixels||g.pixels>=ceiling||owned.some(p=>p.width===g.width&&p.height===g.height))return;nearest=g;if(!candidate&&g.pixels<=pivot.pixels*2)candidate=g;});
 const next=candidate??nearest;return next?{width:next.width,height:next.height,side:next.side,step:next.step,requiredPixels:next.pixels,admitted:false}:null;
}
// A superseded refinement may lend its existing source to current inputs until
// an actual warm, painted cost is known. This path creates no new RGB grid.
function deferredOwnedChoice(row,owned,base){
 if(base.deadlineExceeded||base.remainingTargetMs<=0)return null;
 const ceiling=row?.progression?.blockedPixels||Infinity;
 const pending=owned.filter(p=>p.deferredLatest===true&&p.pixels>base.pixels&&p.pixels<ceiling&&!row?.grids.some(g=>sameGrid(g,p)&&g.displayMs!==null)).sort((a,b)=>a.pixels-b.pixels||a.ownerKey.localeCompare(b.ownerKey))[0];
 return pending?{...pending,progressionMode:'owned-unknown-latest'}:null;
}
function choose(bounds,row,live,targetMs,fallbackMs,initialSide,age){
 const remainingPreferred=Math.max(0,targetMs-age),remainingFallback=Math.max(0,fallbackMs-age),owned=ownedCandidates(live,bounds);
 const measured=owned.flatMap(p=>{const g=row?.grids.find(g=>sameGrid(g,p)&&g.displayMs!==null);return g?[{...p,predicted:g.ms+g.displayMs,proxyMs:g.ms,displayMs:g.displayMs}]:[];});
 const best=measured.find(p=>p.predicted<=remainingPreferred&&remainingPreferred>0),slow=measured.find(p=>p.predicted<=remainingFallback&&remainingFallback>0);
 const fastest=[...measured].sort((a,b)=>a.predicted-b.predicted||b.pixels-a.pixels||a.ownerKey.localeCompare(b.ownerKey))[0],selected=best??slow??fastest??owned[0];
 if(selected)return{...selected,ownedCount:owned.length,measuredCount:measured.length,targetMs:best?targetMs:fallbackMs,remainingTargetMs:best?remainingPreferred:remainingFallback,deadlineExceeded:!!fastest&&!best&&!slow||age>=fallbackMs,reason:best?'owned-observed-cost-fits-50ms':slow?'owned-observed-cost-fits-200ms':fastest?'owned-observed-cost-exceeds-200ms':'owned-source-cost-unknown',predictionModel:fastest?'same-owned-source-observed-warm-cost':null};
 let initial,smallest;visitGrids(bounds.width,bounds.height,bounds.maxSide,bounds.maxPixels,bounds.minSide,grid=>{smallest=grid;if(!initial&&grid.side<=initialSide)initial=grid;});
 if(!smallest)throw TypeError('No admitted frequency preview grid.');
 return{...(initial??smallest),ownedCount:0,measuredCount:0,targetMs:remainingPreferred>0?targetMs:fallbackMs,remainingTargetMs:remainingPreferred>0?remainingPreferred:remainingFallback,deadlineExceeded:age>=fallbackMs,reason:'cold-bootstrap-cost-unknown',predictionModel:null};
}
export function createFrequencyPreviewSizing({targetMs=50,fallbackMs=200,initialSide=128,minSide=16,now=()=>performance.now(),wallNow=()=>Date.now()}={}){
 if(!finite(targetMs)||!targetMs||!finite(fallbackMs)||fallbackMs<targetMs)throw TypeError('Invalid frequency preview targets.');
 const rows=new Map();let identity,environment,scope='frequency-sizing-'+(++scopeSerial),latest=0;
 const reset=({preserveProgression=false}={})=>{if(preserveProgression){for(const [key,row]of rows){const blockedPixels=row.progression?.blockedPixels??0,hardBlockedPixels=row.progression?.hardBlockedPixels??0;if(blockedPixels||hardBlockedPixels)rows.set(key,{grids:[],displayMs:0,lastId:row.lastId,painted:false,progression:{...emptyProgression(),blockedPixels,hardBlockedPixels}});else rows.delete(key);}}else rows.clear();scope='frequency-sizing-'+(++scopeSerial);latest=0;};
 function importFeedback(feedback,key){
  // Preserve app.js's public envelope/3. The additive policy marker rejects old
  // unbound calibration, and never claims a cache-residency acknowledgement.
  if(feedback?.schema!=='frequency-preview-feedback/3'||feedback.ownedGridPolicy!==1||feedback.scope!==scope||feedback.key!==key||feedback.environment!==environment||!validRow(feedback.calibration))return false;
  const row=feedback.calibration,current=rows.get(key);
  if(row.lastId<latest){
   if(!current||!row.painted)return false;
   let changed=false;const grids=current.grids.map(g=>{const p=row.grids.find(p=>sameGrid(g,p)&&p.paintId>g.paintId&&p.displayMs!==null);if(!p)return g;changed=true;return{...g,displayMs:p.displayMs,paintId:p.paintId};});
   if(changed)rows.set(key,{...current,grids,lastPaintedId:Math.max(current.lastPaintedId??0,row.lastPaintedId??0),lastPaintedInput:(row.lastPaintedId??0)>(current.lastPaintedId??0)?clone(row.lastPaintedInput??null):current.lastPaintedInput??null});return changed;
  }
  if(current&&(row.lastId<current.lastId||row.lastId===current.lastId&&current.painted&&!row.painted))return false;
  rows.delete(key);rows.set(key,clone(row));return true;
 }
 function plan({key,width,height,maxSide=2048,maxPixels=2048**2,minSide:minimum=minSide,identity:sourceIdentity,environment:execution,feedback,intentAgeMilliseconds=0,liveGrids=[],progressionRequested=false,gestureEpoch,controlRequestId}={}){
  if(typeof key!=='string'||!key||key.length>192||typeof sourceIdentity!=='string'||!sourceIdentity||typeof execution!=='string'||!execution||execution.length>4096||![width,height,maxSide,maxPixels,minimum].every(positive)||maxSide>2048||maxPixels>2048**2||!finite(intentAgeMilliseconds)||typeof progressionRequested!=='boolean')throw TypeError('Invalid frequency sizing identity or bounds.');
  if(identity!==sourceIdentity||environment!==execution){reset();identity=sourceIdentity;environment=execution;}
  importFeedback(feedback,key);const row=rows.get(key),input={gestureEpoch,controlRequestId},bounds={width,height,maxSide,maxPixels,minSide:Math.min(maxSide,minimum)},base=choose(bounds,row,liveGrids,targetMs,fallbackMs,initialSide,intentAgeMilliseconds),owned=ownedCandidates(liveGrids,bounds);
  if(row?.progression?.warmOpportunity&&(row.progression.warmOpportunity.input.gestureEpoch!==gestureEpoch||!owned.some(g=>sameGrid(g,row.progression.warmOpportunity))))row.progression.warmOpportunity=null;
  const warm=progressionRequested?null:warmCurrentChoice(row,owned,base,input),trial=warm??(progressionRequested?progressionChoice(bounds,row,owned,base):deferredOwnedChoice(row,owned,base)??currentInputChoice(bounds,row,owned,base,input)),choice=trial?{...trial,ownedCount:owned.length,measuredCount:base.measuredCount,targetMs:base.targetMs,remainingTargetMs:base.remainingTargetMs,deadlineExceeded:base.deadlineExceeded,reason:'visible-'+trial.progressionMode+'-cost-unknown',predictionModel:null}:base,id=++serial;latest=id;
  const knownFit=owned.flatMap(p=>{const g=row?.grids.find(g=>sameGrid(g,p)&&g.displayMs!==null);return g?[g]:[];}),fitTarget=knownFit.some(g=>g.ms+g.displayMs<=targetMs)?targetMs:fallbackMs;
  const preserveSourceIds=[base.sourceId,row?.progression?.accepted?.sourceId].filter((v,i,a)=>boundedId(v)&&a.indexOf(v)===i).slice(0,2);
  const token={schema:'adaptive-preview-token/1',costModel:MODEL,id,key,scope,environment,targetMs:choice.targetMs,preferredTargetMs:targetMs,fallbackTargetMs:fallbackMs,intentAgeMilliseconds,remainingTargetMs:choice.remainingTargetMs,deadlineExceeded:choice.deadlineExceeded,width,height,side:choice.side,pixels:choice.pixels,step:choice.step,sampling:'integer',maximumSide:maxSide,maximumPixels:maxPixels,minimumSide:choice.belowMinimum?Math.max(choice.width,choice.height):bounds.minSide,requestedMinimumSide:bounds.minSide,admissionBelowMinimum:choice.belowMinimum,startedAt:wallNow(),startedClock:now(),priorCalibration:row?clone(row):null,selectedSource:choice.sourceId?{sourceId:choice.sourceId,ownerKey:choice.ownerKey,width:choice.width,height:choice.height,outputWidth:choice.outputWidth,outputHeight:choice.outputHeight}:null,ownedCandidateCount:choice.ownedCount,measuredCandidateCount:choice.measuredCount,prediction:{reason:choice.reason,milliseconds:choice.predicted??null,proxyMilliseconds:choice.proxyMs??null,displayMilliseconds:choice.displayMs??null,model:choice.predictionModel,fftResidencyGuaranteed:false},coldCostExcluded:true,progression:{requested:progressionRequested===true||trial?.progressionMode==='owned-unknown-latest'||trial?.currentInputExploration===true,mode:trial?.progressionMode??'measured-or-bootstrap',exhausted:progressionRequested&&!trial,fitTargetMs:fitTarget,blockedPixels:row?.progression?.blockedPixels??0,preserveSourceIds}};
  token.inputIdentity=validInput(input)?input:null;token.progression.warmOpportunityUsed=!!warm;
  return{...token,width:choice.width,height:choice.height,logicalWidth:width,logicalHeight:height,token,calibrated:choice.predicted!==undefined};
 }
 function consumeWarmOpportunity(choice){
  const token=choice?.token??choice;if(!isFrequencyPreviewToken(token)||token.scope!==scope||token.environment!==environment||token.id!==latest||!token.progression?.warmOpportunityUsed)return false;
  const row=rows.get(token.key),p=row?.progression,o=p?.warmOpportunity,input=token.inputIdentity;
  if(!o||!token.selectedSource||!sameGrid(token.selectedSource,o)||!validInput(input)||input.gestureEpoch!==o.input.gestureEpoch||input.controlRequestId<=o.input.controlRequestId||(p.spentWarm??[]).length>=MAX_OWNED||(p.spentWarm??[]).some(g=>g.sourceId===o.sourceId))return false;
  const spent={sourceId:o.sourceId,width:o.width,height:o.height,outputWidth:o.outputWidth,outputHeight:o.outputHeight},spentWarm=[...(p.spentWarm??[]),spent];rows.set(token.key,{...row,lastId:token.id,progression:{...p,warmOpportunity:null,spentWarm}});return true;
 }
 function invalidateSource(sourceId){for(const [key,row]of rows){const grids=row.grids.filter(g=>g.sourceId!==sourceId),p=row.progression,progression=p?{...p,...(p.accepted?.sourceId===sourceId?{accepted:null}:{}),...(p.warmOpportunity?.sourceId===sourceId?{warmOpportunity:null}:{})}:p;rows.set(key,{...row,grids,progression});}}
 // Only the producer's acknowledged unload retires a live source tombstone.
 // A native FFT miss uses invalidateSource instead and cannot rearm it.
 function retireSource(sourceId){if(!boundedId(sourceId))throw TypeError('Invalid retired frequency source.');invalidateSource(sourceId);for(const [key,row]of rows)if(row.progression)rows.set(key,{...row,progression:{...row.progression,spentWarm:(row.progression.spentWarm??[]).filter(g=>g.sourceId!==sourceId)}});}
 function reject(choice,{code}={}){const token=choice?.token??choice;if(!isFrequencyPreviewToken(token)||token.scope!==scope||token.environment!==environment||code==='CANCELLED'||token.progression?.exhausted)return;const row=rows.get(token.key)??{grids:[],displayMs:0,lastId:token.id,painted:false},p=row.progression??emptyProgression(),hardBlockedPixels=p.hardBlockedPixels?Math.min(p.hardBlockedPixels,token.pixels):token.pixels;rows.set(token.key,{...row,lastId:Math.max(row.lastId,token.id),progression:{...p,hardBlockedPixels,warmOpportunity:null,blockedPixels:p.blockedPixels?Math.min(p.blockedPixels,token.pixels):token.pixels}});while(rows.size>MAX_KEYS)rows.delete(rows.keys().next().value);}
 function observe(choice,{milliseconds,setupMilliseconds=0,cold=false,cached=false,basisWarm=false,pixels,inputWidth,inputHeight,outputWidth,outputHeight,sourceId,ownerKey}={}){
  const token=choice?.token??choice;if(!isFrequencyPreviewToken(token)||token.scope!==scope||token.environment!==environment||token.id!==latest||![milliseconds,setupMilliseconds].every(finite)||![inputWidth,inputHeight,outputWidth,outputHeight].every(v=>positive(v)&&v<=2048)||pixels!==inputWidth*inputHeight||!boundedId(sourceId)||!boundedId(ownerKey))return null;
  const previous=rows.get(token.key),row={grids:clone(previous?.grids??[]),displayMs:previous?.displayMs??0,lastPaintedId:previous?.lastPaintedId??0,lastPaintedInput:clone(previous?.lastPaintedInput??null),lastId:token.id,painted:false,progression:clone(previous?.progression??emptyProgression())};
  const selected=token.selectedSource,ownerMatches=!selected||selected.sourceId===sourceId&&selected.ownerKey===ownerKey&&selected.width===inputWidth&&selected.height===inputHeight;
  // Only a completed non-cached request on native-reported retained bases can
  // teach a cost. Source setup, misses and cold predictions never teach warm.
  const learned=ownerMatches&&basisWarm&&!cold&&!cached;
  if(learned){const measured=Math.max(0,milliseconds-setupMilliseconds),geometry={sourceId,ownerKey,width:inputWidth,height:inputHeight,outputWidth,outputHeight},at=row.grids.findIndex(g=>g.ownerKey===ownerKey),previousGrid=at>=0?row.grids.splice(at,1)[0]:null,old=previousGrid&&sameGrid(previousGrid,geometry)?previousGrid:null;row.grids.push({...geometry,pixels,ms:old?old.ms*.35+measured*.65:measured,displayMs:old?.displayMs??null,paintId:old?.paintId??0,costId:token.id});while(row.grids.length>MAX_GRIDS)row.grids.shift();}
  rows.delete(token.key);rows.set(token.key,row);while(rows.size>MAX_KEYS)rows.delete(rows.keys().next().value);
  return{schema:'frequency-preview-feedback/3',ownedGridPolicy:1,scope,key:token.key,environment,calibration:clone(row),targetMs:token.targetMs,learnedWarmGrid:learned,cold,basisWarm,cached,paintedGeometry:{sourceId,ownerKey,width:inputWidth,height:inputHeight,outputWidth,outputHeight,pixels,side:Math.max(inputWidth,inputHeight),step:token.step},measuredMs:milliseconds,setupMilliseconds,inputDimensions:[inputWidth,inputHeight],outputDimensions:[outputWidth,outputHeight]};
 }
 function retirementInfo(choice,liveOwners=[]){
  const token=choice?.token??choice;if(!isFrequencyPreviewToken(token)||token.scope!==scope||token.environment!==environment||token.id!==latest)return null;
  const row=rows.get(token.key),bounds={width:token.width,height:token.height,maxSide:token.maximumSide,maxPixels:token.maximumPixels,minSide:Math.min(token.maximumSide,token.requestedMinimumSide)},owned=ownedCandidates(liveOwners,bounds),base=choose(bounds,row,liveOwners,targetMs,fallbackMs,initialSide,token.intentAgeMilliseconds);
  const protectedSourceIds=[token.selectedSource?.sourceId,...(token.progression?.preserveSourceIds??[])];for(const other of rows.values())for(const key of ['accepted','warmOpportunity'])if(other.progression?.[key])protectedSourceIds.push(other.progression[key].sourceId);
  const useful=currentInputReady(row,base,token.inputIdentity);
  return{protectedSourceIds:[...new Set(protectedSourceIds.filter(boundedId))],next:useful&&!progressionChoice(bounds,row,owned,base)?unadmittedNextGeometry(bounds,row,owned,base):null};
 }
 return{plan,observe,reject,reset,invalidateSource,retireSource,consumeWarmOpportunity,retirementInfo,get state(){return{costModel:MODEL,entries:rows.size,scope,environment,latest,metadataWorkingBytes:FREQUENCY_SIZING_BYTES,persisted:false,fftResidencyGuaranteed:false};}};
}
// Bounded journal projection: source IDs and arbitrary identity/environment
// strings remain private. Targets are predictions, never measured guarantees.
export function frequencyPreviewDiagnostics(choice,{inputDimensions,outputDimensions,queueWaitMilliseconds,timings={},cold,cached,basisWarm}={}){
 const t=choice?.token;if(!isFrequencyPreviewToken(t))return null;
 const number=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null,integer=value=>Number.isSafeInteger(value)&&value>=0?value:null;
 const dimensions=value=>Array.isArray(value)&&value.length===2&&value.every(v=>positive(v))?[...value]:null;
 const prior=t.priorCalibration,grids=Array.isArray(prior?.grids)?prior.grids.slice(0,MAX_GRIDS).map(g=>({width:integer(g.width),height:integer(g.height),outputDimensions:dimensions([g.outputWidth,g.outputHeight]),sampleCount:integer(g.pixels),milliseconds:number(g.ms),displayMilliseconds:number(g.displayMs),painted:g.paintId>0})):[];
 const durations={};for(const key of ['preSizingMilliseconds','sizingMilliseconds','sourcePreparationMilliseconds','nativeRequestMilliseconds','outputPreparationMilliseconds','proxyInclusiveMilliseconds','workerStartupMilliseconds','coldSourceSetupMilliseconds'])durations[key]=number(timings[key]);
 return{schema:'frequency-preview-diagnostics/1',requestId:integer(t.id),logicalDimensions:dimensions([t.width,t.height]),selectedDimensions:dimensions([choice.width,choice.height]),inputDimensions:dimensions(inputDimensions),outputDimensions:dimensions(outputDimensions),selectedSampleCount:integer(t.pixels),integerSamplingStep:integer(t.step),bounds:{maximumSide:integer(t.maximumSide),maximumSampleCount:integer(t.maximumPixels),requestedMinimumSide:integer(t.requestedMinimumSide),admissionBelowMinimum:t.admissionBelowMinimum===true},prediction:{reason:t.prediction.reason,model:t.prediction.model,milliseconds:number(t.prediction.milliseconds),proxyMilliseconds:number(t.prediction.proxyMilliseconds),displayMilliseconds:number(t.prediction.displayMilliseconds),preferredTargetMilliseconds:number(t.preferredTargetMs),fallbackTargetMilliseconds:number(t.fallbackTargetMs),selectedTargetMilliseconds:number(t.targetMs),remainingTargetMilliseconds:number(t.remainingTargetMs),intentAgeAtSizingMilliseconds:number(t.intentAgeMilliseconds),queueWaitMilliseconds:number(queueWaitMilliseconds),deadlineExceeded:t.deadlineExceeded===true,ownedSource:t.selectedSource!==null,ownedCandidateCount:integer(t.ownedCandidateCount),measuredCandidateCount:integer(t.measuredCandidateCount),fftResidencyGuaranteed:false},progression:{requested:t.progression?.requested===true,mode:t.progression?.mode??null,exhausted:t.progression?.exhausted===true,fitTargetMilliseconds:number(t.progression?.fitTargetMs),blockedSampleCount:integer(t.progression?.blockedPixels),maximumGlobalQualified:false,latencyGuaranteed:false},prior:{grids,displayMilliseconds:number(prior?.displayMs)},observed:{cold:typeof cold==='boolean'?cold:null,cached:typeof cached==='boolean'?cached:null,basisWarm:typeof basisWarm==='boolean'?basisWarm:null},timings:{clock:'performance.now intervals in preview owner',...durations,resultRetirementMilliseconds:null,parkMilliseconds:null,ownerCompletionMilliseconds:null},resultRetirementAcknowledged:null};
}
export function frequencyPreviewPresented(metrics,{milliseconds,presentedAt=Date.now(),displayMilliseconds}={}){
 const token=metrics?.token,base=metrics?.feedback;if(!isFrequencyPreviewToken(token)||base?.schema!=='frequency-preview-feedback/3'||base.ownedGridPolicy!==1||base.scope!==token.scope||base.key!==token.key||base.environment!==token.environment||!validRow(base.calibration)||base.calibration.lastId!==token.id||!finite(metrics.milliseconds))return null;
 const elapsed=milliseconds??Math.max(0,presentedAt-token.startedAt),display=displayMilliseconds??Math.max(0,elapsed-metrics.milliseconds);if(!finite(display)||!finite(elapsed))return null;
 const row=clone(base.calibration);row.displayMs=display;row.painted=true;row.lastPaintedId=token.id;row.lastPaintedInput=token.inputIdentity?clone(token.inputIdentity):null;
 const progress=row.progression??emptyProgression(),fitTarget=token.progression?.fitTargetMs??token.fallbackTargetMs,accepted=elapsed<=fitTarget&&base.paintedGeometry?clone(base.paintedGeometry):progress.accepted;
 const tooSlow=(base.learnedWarmGrid||token.progression?.requested===true)&&elapsed>fitTarget,recovered=base.learnedWarmGrid&&elapsed<=fitTarget&&progress.blockedPixels&&token.pixels>=progress.blockedPixels,blockedPixels=tooSlow?(progress.blockedPixels?Math.min(progress.blockedPixels,token.pixels):token.pixels):recovered?0:progress.blockedPixels;
 const geometry=base.paintedGeometry,input=token.inputIdentity,spentWarm=progress.spentWarm??[],hardBlockedPixels=progress.hardBlockedPixels??0;
 const opportunity=tooSlow&&!base.learnedWarmGrid&&!base.cached&&token.progression?.requested===true&&!token.progression.warmOpportunityUsed&&validInput(input)&&geometry&&validGeometry(geometry)&&spentWarm.length<MAX_OWNED&&(!hardBlockedPixels||geometry.pixels<hardBlockedPixels)&&!spentWarm.some(g=>g.sourceId===geometry.sourceId)?{...clone(geometry),input:clone(input)}:progress.warmOpportunity??null;
 row.progression={...progress,blockedPixels,hardBlockedPixels,accepted,warmOpportunity:opportunity,spentWarm};
 const refinementAllowed=elapsed<=token.fallbackTargetMs&&token.step>1&&!token.progression?.exhausted;
 if(base.learnedWarmGrid)row.grids=row.grids.map(g=>g.costId===token.id?{...g,displayMs:display,paintId:token.id}:g);
 return{...base,calibration:row,presentationMs:elapsed,displayMilliseconds:display,visibleProgression:{allowed:refinementAllowed,mode:token.progression?.mode??null,observedFrameMilliseconds:elapsed,observedCold:base.cold,observedCached:base.cached,maximumGlobalQualified:false,latencyGuaranteed:false},...(metrics.diagnostics?{diagnostics:{...metrics.diagnostics,presentation:{elapsedFromSizingMilliseconds:elapsed,displayResidualMilliseconds:display,clock:'Date.now delta',observation:'post-draw requestAnimationFrame; not compositor ACK'}}}:{})};
}
