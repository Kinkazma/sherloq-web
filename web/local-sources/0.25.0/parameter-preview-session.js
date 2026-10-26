import {completedGenericHeldPreviewFrame} from './generic-held-preview-owner.js?v=0.25.0';
// One replaceable draft and one final intention. A preview owns no scientific
// result; source/tool changes invalidate publication, even if a read completes.
export function createParameterPreviewSession({preview,show,commit,computed=()=>{},restore=()=>{},state=()=>{},error=()=>{},schedule=fn=>setTimeout(fn,0),unschedule=clearTimeout,now=()=>performance.now(),onControl=()=>{}}={}){
 let epoch=0,disposed=false,pending=false,active=false,queued=null,flight=null,finalTimer=null,finalFlight=null,controller=null,uncommittedFinal=null,latestPreviewEvent=null,previewOrdinal=0,previewIntentionOrdinal=0,refinementOrdinal=0;
 const notify=()=>state({pending,active,previewRunning:!!flight,finalRunning:!!finalFlight,epoch});
 const cancelTimer=()=>{if(finalTimer!==null)unschedule(finalTimer);finalTimer=null;};
 function invalidate(){epoch++;queued=null;latestPreviewEvent=null;previewOrdinal=previewIntentionOrdinal=refinementOrdinal=0;cancelTimer();controller?.abort();controller=null;}
 function reset(reason='cancel',{restoreResult=true}={}){if(disposed)return;invalidate();uncommittedFinal=null;active=pending=false;if(restoreResult)restore(reason);notify();}
 function completedFrequencyFrame(ticket){
  const a=ticket.event,b=latestPreviewEvent;
  if(a?.operation!=='detail.frequency'||b?.operation!==a.operation||a.toolId!==b.toolId||a.field!==b.field||!a.continuous||!b.continuous||!Number.isSafeInteger(a.generation)||a.generation<1||a.generation!==b.generation||a.policy?.kind!=='pixel-proxy'||b.policy?.kind!=='pixel-proxy')return false;
  try{return a.completedPreviewCurrent?.()===true&&b.completedPreviewCurrent?.()===true;}catch{return false;}
 }
 function heldCloneSettings(event){
  const key=event.field?.startsWith('view.')?event.field.slice(5):null;
  if(!key||key.includes('.')||typeof event.view?.[key]!=='number'||!Number.isFinite(event.view[key]))return null;
  const view={...event.view},extras={...event.extras};delete view[key];
  if(extras.sparseView){if(Object.hasOwn(extras.sparseView,key)&&extras.sparseView[key]!==event.view[key])return null;extras.sparseView={...extras.sparseView};delete extras.sparseView[key];}
  return JSON.stringify([event.params,view,extras]);
 }
 function completedRetainedCloneFrame(ticket,result){
  const a=ticket.event,b=latestPreviewEvent;
  if(!['tampering.copyMove.sparse','tampering.copyMove.dense'].includes(a?.operation)||b?.operation!==a.operation||a.toolId!==b.toolId||a.field!==b.field||!a.continuous||!b.continuous||!Number.isSafeInteger(a.generation)||a.generation<1||a.generation!==b.generation||a.policy?.kind!=='retained'||b.policy?.kind!=='retained'||a.policy?.strategy!=='clones'||b.policy?.strategy!=='clones'||a.policy.final==='explicit'||b.policy.final==='explicit'||result?.operation!==a.operation||result.exact!==true||result.metrics?.nativePresentation!==true||result.metrics.retainedNativeTables!==true||result.metrics.nativeAnalysisCalls!==0||result.metrics.inferenceCalls!==0)return false;
  try{const settings=heldCloneSettings(a);return settings!==null&&settings===heldCloneSettings(b)&&a.completedPreviewCurrent?.()===true&&b.completedPreviewCurrent?.()===true;}catch{return false;}
 }
 function heldRetainedParameterSettings(event){
  const median=event.operation==='various.median'&&event.policy?.strategy==='median',ssg=event.operation==='tampering.copyMove.sparse'&&event.params?.algorithm==='SSG'&&event.policy?.strategy==='ssg-localization',fields=median?['threshold','variance']:ssg?['maskThreshold','minimumArea','ssimRadius','ssimOpening','roiRadius']:[];
  if(event.policy?.kind!=='retained'||event.policy.final==='explicit'||!fields.includes(event.field)||typeof event.params?.[event.field]!=='number'||!Number.isFinite(event.params[event.field]))return null;
  const params={...event.params};delete params[event.field];return JSON.stringify([params,event.view,event.extras]);
 }
 function completedRetainedParameterFrame(ticket,result){
  const a=ticket.event,b=latestPreviewEvent;
  if(!b||a.operation!==b.operation||a.toolId!==b.toolId||a.field!==b.field||!a.continuous||!b.continuous||!Number.isSafeInteger(a.generation)||a.generation<1||a.generation!==b.generation||result?.exact!==false||result.provisional!==true||result.approximate!==true||result.exportable!==false||result.metrics?.nativeAnalysisCalls!==0||result.metrics.inferenceCalls!==0||a.policy?.strategy==='ssg-localization'&&(typeof result.params?.[a.field]!=='number'||!Number.isFinite(result.params[a.field])))return false;
  try{if(a.policy?.strategy==='ssg-localization'&&Object.entries(result.params).some(([key,value])=>key!==a.field&&Object.hasOwn(a.params,key)&&JSON.stringify(value)!==JSON.stringify(a.params[key])))return false;const settings=heldRetainedParameterSettings(a);return settings!==null&&settings===heldRetainedParameterSettings(b)&&a.completedPreviewCurrent?.()===true&&b.completedPreviewCurrent?.()===true;}catch{return false;}
 }
 function heldD2Settings(event){
  if(event.operation!=='ai.clones.d2prl'||event.policy?.kind!=='retained'||event.policy.strategy!=='d2prl-refilter'||event.field!=='minimum'||!Number.isInteger(event.params?.minimum)||event.params.minimum<0||event.params.minimum>5000)return null;
  const params={...event.params};delete params.minimum;return JSON.stringify([params,event.view,event.extras]);
 }
 function completedRetainedD2Frame(ticket,result){
  const a=ticket.event,b=latestPreviewEvent;
  if(!b||a.operation!==b.operation||a.toolId!==b.toolId||a.field!==b.field||!a.continuous||!b.continuous||!Number.isSafeInteger(a.generation)||a.generation<1||a.generation!==b.generation||result?.operation!=='ai.clones.d2prl'||result.exact!==false||result.provisional!==true||result.approximate!==true||result.exportable!==false||result.metrics?.inferences!==0||result.metrics.retainedD2Refilter!==true||result.params?.minimum!==a.params?.minimum||result.metrics.calculatedMinimum!==result.params.minimum)return false;
  try{const settings=heldD2Settings(a);return settings!==null&&settings===heldD2Settings(b)&&a.completedPreviewCurrent?.()===true&&b.completedPreviewCurrent?.()===true;}catch{return false;}
 }
 async function pump(){
  if(disposed||flight||!queued)return;
  const ticket=queued;queued=null;const abort=new AbortController();controller=abort;const dispatchedAt=now(),frequency=ticket.event.operation==='detail.frequency'&&ticket.event.continuous&&ticket.event.policy?.kind==='pixel-proxy';
  // The admission clock includes the first-gesture arm before this queue. Keep
  // inputAt as its historical enqueue alias; never invent an input timestamp.
  const dispatchedPreviewOrdinal=frequency?++previewOrdinal:null,input=ticket.event.lastAdmittedInput,admittedInputAt=input?.clock==='performance.now'&&Number.isFinite(input.observedAt)&&input.observedAt>=0&&input.observedAt<=ticket.enqueuedAt?input.observedAt:null;
  const previewControl=frequency?{gestureEpoch:ticket.event.gestureEpoch,controlRequestId:ticket.event.controlRequestId,lastAdmittedInput:input,clock:'performance.now',inputAt:ticket.enqueuedAt,admittedInputAt,enqueuedAt:ticket.enqueuedAt,inputAgeAvailable:admittedInputAt!==null,ageOrigin:admittedInputAt===null?'preview-enqueue-fallback':'admitted-input',preQueueMs:admittedInputAt===null?null:ticket.enqueuedAt-admittedInputAt,previewOrdinal:dispatchedPreviewOrdinal,previewIntentionOrdinal:ticket.previewIntentionOrdinal,refreshPhase:ticket.refinement?'held-visible-refinement':dispatchedPreviewOrdinal===1?'first-armed-preview':'held-refresh',refinement:ticket.refinement===true,refinementOrdinal:ticket.refinement?++refinementOrdinal:0,dispatchedAt,queueWaitMs:Math.max(0,dispatchedAt-ticket.enqueuedAt),ageMilliseconds:()=>Math.max(0,now()-(admittedInputAt??ticket.enqueuedAt)),queueAgeMilliseconds:()=>Math.max(0,now()-ticket.enqueuedAt),yieldBeforeNative:()=>!disposed&&pending&&active&&!abort.signal.aborted&&ticket.epoch!==epoch&&completedFrequencyFrame(ticket),report:metrics=>onControl({...metrics,operation:ticket.event.operation,field:ticket.event.field,generation:ticket.event.generation,ticketEpoch:ticket.epoch})}:undefined;
  const task=(async()=>{try{const result=await preview(ticket.event,{signal:abort.signal,...(previewControl?{previewControl}:{})});
   // A newer value may supersede this completed draft during the same hold.
   // Its measured cost still matters. The owned continuous Frequency exception
   // below, exact clone views and owned retained parameter drafts may show a
   // completed frame, keeping their existing exact/provisional contracts.
   if(!disposed&&pending&&active&&!abort.signal.aborted&&result)computed(result,ticket.event);
   if(!disposed&&pending&&active&&!abort.signal.aborted&&result){
    const owner=ticket.event.completedPreviewCurrent;let current=true;try{if(typeof owner==='function')current=owner()===true;}catch{current=false;}
    const latest=ticket.epoch===epoch&&current,completedFrequency=ticket.epoch!==epoch&&completedFrequencyFrame(ticket),completedClone=ticket.epoch!==epoch&&completedRetainedCloneFrame(ticket,result),completedParameter=ticket.epoch!==epoch&&completedRetainedParameterFrame(ticket,result),completedD2=ticket.epoch!==epoch&&completedRetainedD2Frame(ticket,result),completedGeneric=ticket.epoch!==epoch&&completedGenericHeldPreviewFrame(ticket.event,latestPreviewEvent,result),completed=completedFrequency||completedClone||completedParameter||completedD2||completedGeneric;
    if(latest||completed){
     // Each completed frame keeps its calculated settings. Retained native
     // pixels stay exact for that value; the final/latest intention is unchanged.
     const answer=completed?{...result,...(completedFrequency?{exact:false}:{}),provisional:true,metrics:{...result.metrics,continuousPreview:{policy:'last-completed-same-gesture',generation:ticket.event.generation,field:ticket.event.field,requestedParameters:structuredClone(ticket.event.params),calculatedParameters:structuredClone(result.metrics?.previewParams??ticket.event.params),latestRequestedParameters:structuredClone(latestPreviewEvent.params),...(completedClone?{retainedNative:true,requestedView:structuredClone(ticket.event.view),calculatedView:structuredClone(ticket.event.view),latestRequestedView:structuredClone(latestPreviewEvent.view)}:{}),...(completedParameter?{retainedParameters:true,strategy:ticket.event.policy.strategy,calculatedParameters:structuredClone(ticket.event.policy.strategy==='ssg-localization'?result.params:result.metrics?.previewParams??ticket.event.params),requestedView:structuredClone(ticket.event.view),calculatedView:structuredClone(ticket.event.view),latestRequestedView:structuredClone(latestPreviewEvent.view)}:{}),...(completedD2?{retainedD2:true,calculatedParameters:structuredClone(result.params),requestedView:structuredClone(ticket.event.view),calculatedView:structuredClone(ticket.event.view),latestRequestedView:structuredClone(latestPreviewEvent.view)}:{})}}}:result;
     if(completedGeneric)Object.assign(answer.metrics.continuousPreview,{typedFamily:result.heldPreview.family,exportLocked:true,requestedParameters:structuredClone(result.heldPreview.requested.params),calculatedParameters:structuredClone(result.heldPreview.calculated.params),latestRequestedParameters:structuredClone(latestPreviewEvent.params),requestedView:structuredClone(result.heldPreview.requested.view),calculatedView:structuredClone(result.heldPreview.calculated.view),latestRequestedView:structuredClone(latestPreviewEvent.view),...(result.heldPreview.producerRequested?{producerRequested:structuredClone(result.heldPreview.producerRequested)}:{})});
     const stillOwned=()=>{if(disposed||!pending||!active||abort.signal.aborted)return false;try{return ticket.epoch===epoch&&ticket.event.completedPreviewCurrent?.()===true||completedFrequencyFrame(ticket)||completedRetainedCloneFrame(ticket,result)||completedRetainedParameterFrame(ticket,result)||completedRetainedD2Frame(ticket,result)||completedGenericHeldPreviewFrame(ticket.event,latestPreviewEvent,result);}catch{return false;}};
     const painted=await show(answer,ticket.event,{signal:abort.signal,isCurrent:stillOwned,calculatedEpoch:ticket.epoch});
     // A refinement is a visible request for the SAME still-held latest value.
     // A new input always owns the queue; release/cancel invalidates the signal.
     // No paint receipt (including a timeout/hidden frame) means no next job.
     if(frequency&&painted?.presented===true&&painted.feedback?.visibleProgression?.allowed===true&&stillOwned()&&ticket.epoch===epoch&&!queued&&latestPreviewEvent===ticket.event){
      queued={epoch,event:ticket.event,enqueuedAt:now(),previewIntentionOrdinal:ticket.previewIntentionOrdinal,refinement:true};
     }
    }
   }
  }catch(e){if(!disposed&&ticket.epoch===epoch&&!abort.signal.aborted&&e?.code!=='CANCELLED'&&e?.name!=='AbortError')error(e,{phase:'preview',event:ticket.event});}})();
  flight=task;notify();try{await task;}finally{if(flight===task)flight=null;if(controller===abort)controller=null;notify();if(queued)void pump();}
 }
 function handle(event){
  if(disposed)return;
  if(event.phase==='cancel'){
   // A zero-net edit may have superseded a native replacement which has not
   // published yet. Finish that intention with the current complete settings.
   if(event.reason==='unchanged'&&uncommittedFinal){handle({...event,...uncommittedFinal,phase:'commit',params:event.params??uncommittedFinal.params,view:event.view??uncommittedFinal.view,extras:event.extras??uncommittedFinal.extras,generation:event.generation,reason:'unchanged-resume',continuous:event.continuous??false});return;}
   reset(event.reason);return;
  }
  if(event.phase==='begin'){invalidate();active=pending=true;notify();return;}
  if(event.phase==='preview'){
   if(!active){invalidate();active=pending=true;}
   // The queue retains only the latest intention. Default stale publication stays
   // revoked; owned Frequency, clone and retained parameter frames may finish.
   epoch++;latestPreviewEvent=event;queued={epoch,event,enqueuedAt:now(),previewIntentionOrdinal:++previewIntentionOrdinal};notify();void pump();return;
  }
  if(event.phase!=='commit')return;
  invalidate();uncommittedFinal=event;active=false;pending=true;const token=epoch,previousFinal=finalFlight;notify();
  finalTimer=schedule(()=>{if(disposed||token!==epoch)return;finalTimer=null;const task=Promise.resolve().then(async()=>{
   try{
    // Serialize native replacements, including an obsolete replacement still
    // finishing. Only the latest intention may publish after either wait.
    if(previousFinal)await previousFinal;if(flight)await flight;
    const isCurrent=()=>!disposed&&token===epoch;
    if(!isCurrent())return;await commit(event,{isCurrent});if(isCurrent()){pending=false;uncommittedFinal=null;}
   }
   catch(e){if(!disposed&&token===epoch){pending=false;error(e,{phase:'final',event});}}
   finally{if(finalFlight===task)finalFlight=null;notify();}
  });finalFlight=task;notify();},event);
 }
 return {handle,reset,get pending(){return pending;},get active(){return active;},get epoch(){return epoch;},async settled(){if(flight)await flight;if(finalFlight)await finalFlight;},dispose(){if(disposed)return;invalidate();uncommittedFinal=null;disposed=true;active=pending=false;notify();}};
}
