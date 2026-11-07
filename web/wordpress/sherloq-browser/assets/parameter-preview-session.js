import {canContinueHeldPreview,completedHeldPreviewFrame} from './completed-held-preview.js?v=0.33.1';
import {createPreviewContinuity} from './preview-continuity.js?v=0.33.1';
import {canContinueFrequencyPreview,completedFrequencyPreviewFrame} from './frequency-held-preview.js?v=0.33.1';
const continues=(a,b)=>canContinueHeldPreview(a,b)||canContinueFrequencyPreview(a,b);
// One replaceable draft and one final intention. A preview owns no scientific
// result; source/tool changes invalidate publication, even if a read completes.
export function createParameterPreviewSession({preview,show,commit,computed=()=>{},restore=()=>{},state=()=>{},error=()=>{},schedule=fn=>setTimeout(fn,0),unschedule=clearTimeout,now=()=>performance.now(),onControl=()=>{},previewIntervalMs=0,supersededBudgetMs=300,delay=(fn,ms)=>setTimeout(fn,ms),undelay=clearTimeout}={}){
 let epoch=0,disposed=false,pending=false,active=false,queued=null,flight=null,finalTimer=null,finalFlight=null,controller=null,uncommittedFinal=null,latestPreviewEvent=null,previewOrdinal=0,previewIntentionOrdinal=0,refinementOrdinal=0;
 let previewTimer=null,previewDelayFlight=null,releasePreviewDelay=null,lastDispatch=-Infinity,runningTicket=null,obsoleteTimer=null,lastPresentedOrdinal=0;
 const continuity=createPreviewContinuity({now});
 const cancelObsoleteTimer=()=>{if(obsoleteTimer!==null)undelay(obsoleteTimer);obsoleteTimer=null;};
 function supersede(event){
  if(!controller||!runningTicket)return;
  if(!continues(runningTicket.event,event)){cancelObsoleteTimer();controller.abort();return;}
  if(obsoleteTimer!==null||runningTicket.computeStarted===null)return;
  const own=controller,ticket=runningTicket;
  obsoleteTimer=delay(()=>{obsoleteTimer=null;if(controller===own&&runningTicket===ticket&&active&&pending&&ticket.epoch!==epoch){ticket.missedPresentation=continues(ticket.event,latestPreviewEvent);own.abort();}},Math.max(0,supersededBudgetMs-(ticket.computeMilliseconds+Math.max(0,now()-ticket.computeStarted))));
 }
 const cancelPreviewTimer=()=>{if(previewTimer!==null)undelay(previewTimer);previewTimer=null;releasePreviewDelay?.();releasePreviewDelay=null;previewDelayFlight=null;};
 const notify=()=>state({pending,active,previewRunning:!!flight,finalRunning:!!finalFlight,epoch});
 const cancelTimer=()=>{if(finalTimer!==null)unschedule(finalTimer);finalTimer=null;};
 function invalidate(){epoch++;queued=null;latestPreviewEvent=null;previewOrdinal=previewIntentionOrdinal=refinementOrdinal=lastPresentedOrdinal=0;cancelTimer();cancelPreviewTimer();cancelObsoleteTimer();continuity.reset();controller?.abort();controller=null;}
 function reset(reason='cancel',{restoreResult=true}={}){if(disposed)return;invalidate();uncommittedFinal=null;active=pending=false;if(restoreResult)restore(reason);notify();}
 async function pump(){
  if(disposed||flight||!queued)return;
  const wait=Math.max(0,previewIntervalMs-(now()-lastDispatch));if(wait>0){if(previewTimer===null){previewDelayFlight=new Promise(resolve=>releasePreviewDelay=resolve);previewTimer=delay(()=>{previewTimer=null;releasePreviewDelay?.();releasePreviewDelay=null;previewDelayFlight=null;void pump();},wait);}return;}
  lastDispatch=now();
  const ticket=queued;queued=null;const abort=new AbortController();controller=abort;const dispatchedAt=now(),frequency=ticket.event.operation==='detail.frequency'&&ticket.event.continuous&&ticket.event.policy?.kind==='pixel-proxy';ticket.startedAt=dispatchedAt;runningTicket=ticket;
  const progress=continuity.start(ticket.event);ticket.computeMilliseconds=0;ticket.computeStarted=null;let presented=false;
  const onComputeStart=()=>{if(ticket.computeStarted===null){ticket.computeStarted=now();if(ticket.epoch!==epoch&&latestPreviewEvent)supersede(latestPreviewEvent);}},onComputeEnd=()=>{if(ticket.computeStarted!==null){ticket.computeMilliseconds+=Math.max(0,now()-ticket.computeStarted);ticket.computeStarted=null;if(runningTicket===ticket)cancelObsoleteTimer();}};
  // The admission clock includes the first-gesture arm before this queue. Keep
  // inputAt as its historical enqueue alias; never invent an input timestamp.
  const dispatchedPreviewOrdinal=frequency?++previewOrdinal:null,input=ticket.event.lastAdmittedInput,admittedInputAt=input?.clock==='performance.now'&&Number.isFinite(input.observedAt)&&input.observedAt>=0&&input.observedAt<=ticket.enqueuedAt?input.observedAt:null;
  const previewControl=frequency?{onComputeStart,onComputeEnd,continuity:continuity.snapshot(progress),gestureEpoch:ticket.event.gestureEpoch,controlRequestId:ticket.event.controlRequestId,lastAdmittedInput:input,clock:'performance.now',inputAt:ticket.enqueuedAt,admittedInputAt,enqueuedAt:ticket.enqueuedAt,inputAgeAvailable:admittedInputAt!==null,ageOrigin:admittedInputAt===null?'preview-enqueue-fallback':'admitted-input',preQueueMs:admittedInputAt===null?null:ticket.enqueuedAt-admittedInputAt,previewOrdinal:dispatchedPreviewOrdinal,previewIntentionOrdinal:ticket.previewIntentionOrdinal,refreshPhase:ticket.refinement?'held-visible-refinement':dispatchedPreviewOrdinal===1?'first-armed-preview':'held-refresh',refinement:ticket.refinement===true,refinementOrdinal:ticket.refinement?++refinementOrdinal:0,dispatchedAt,queueWaitMs:Math.max(0,dispatchedAt-ticket.enqueuedAt),ageMilliseconds:()=>Math.max(0,now()-(admittedInputAt??ticket.enqueuedAt)),queueAgeMilliseconds:()=>Math.max(0,now()-ticket.enqueuedAt),yieldBeforeNative:()=>disposed||!pending||!active||abort.signal.aborted||ticket.epoch!==epoch&&!canContinueFrequencyPreview(ticket.event,latestPreviewEvent),report:metrics=>onControl({...metrics,operation:ticket.event.operation,field:ticket.event.field,generation:ticket.event.generation,ticketEpoch:ticket.epoch})}:undefined;
  const task=(async()=>{try{const result=await preview(ticket.event,{signal:abort.signal,previewControl:previewControl??{onComputeStart,onComputeEnd,gestureEpoch:ticket.event.gestureEpoch,continuity:continuity.snapshot(progress)}});onComputeEnd();
   // A completed frame can advance within its still-owned numeric gesture.
   // The one queued successor retains the latest requested value for final use.
   const stillOwned=()=>{if(disposed||!pending||!active||abort.signal.aborted||ticket.previewIntentionOrdinal<lastPresentedOrdinal)return false;try{return ticket.epoch===epoch?(typeof ticket.event.completedPreviewCurrent!=='function'||ticket.event.completedPreviewCurrent()===true):completedHeldPreviewFrame(ticket.event,latestPreviewEvent,result)||completedFrequencyPreviewFrame(ticket.event,latestPreviewEvent,result);}catch{return false;}};
   if(result&&stillOwned()){
    computed(result,ticket.event);
    const held=ticket.epoch!==epoch,answer=held?{...result,provisional:true,metrics:{...result.metrics,continuousPreview:{policy:'last-completed-same-gesture',generation:ticket.event.generation,field:ticket.event.field,typedFamily:result.heldPreview?.family,requestedParameters:structuredClone(result.heldPreview?.requested?.params??ticket.event.params),calculatedParameters:structuredClone(result.heldPreview?.calculated?.params??result.params??result.metrics?.previewParams??ticket.event.params),latestRequestedParameters:structuredClone(latestPreviewEvent.params),requestedView:structuredClone(ticket.event.view),calculatedView:structuredClone(result.heldPreview?.calculated?.view??ticket.event.view),latestRequestedView:structuredClone(latestPreviewEvent.view),exportLocked:true}}}:result;
    const painted=await show(answer,ticket.event,{signal:abort.signal,isCurrent:stillOwned,calculatedEpoch:ticket.epoch});presented=painted?.presented===true;lastPresentedOrdinal=Math.max(lastPresentedOrdinal,ticket.previewIntentionOrdinal);
    if(frequency&&painted?.presented===true&&painted.feedback?.visibleProgression?.allowed===true&&stillOwned()&&!queued&&latestPreviewEvent===ticket.event){
     queued={epoch,event:ticket.event,enqueuedAt:now(),previewIntentionOrdinal:ticket.previewIntentionOrdinal,refinement:true};
    }
   }
  }catch(e){if(!disposed&&ticket.epoch===epoch&&!abort.signal.aborted&&e?.code!=='CANCELLED'&&e?.name!=='AbortError')error(e,{phase:'preview',event:ticket.event});}})();
  flight=task;notify();try{await task;}finally{onComputeEnd();continuity.finish(progress,{milliseconds:ticket.computeMilliseconds,presented,eligible:ticket.missedPresentation===true&&active&&pending&&continues(ticket.event,latestPreviewEvent)});if(flight===task)flight=null;if(controller===abort){controller=null;cancelObsoleteTimer();}if(runningTicket===ticket)runningTicket=null;notify();if(queued)void pump();}
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
  if(event.phase==='value'){epoch++;queued=null;latestPreviewEvent=event;supersede(event);cancelPreviewTimer();notify();return;}
  if(event.phase==='preview'){
   if(!active){invalidate();active=pending=true;}
   // Keep a bounded owned frame in flight, never an accumulating input queue.
   epoch++;latestPreviewEvent=event;supersede(event);queued={epoch,event,enqueuedAt:now(),previewIntentionOrdinal:++previewIntentionOrdinal};notify();void pump();return;
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
 return {handle,reset,get pending(){return pending;},get active(){return active;},get epoch(){return epoch;},async settled(){while(previewDelayFlight||flight){if(previewDelayFlight)await previewDelayFlight;if(flight)await flight;}if(finalFlight)await finalFlight;},dispose(){if(disposed)return;invalidate();uncommittedFinal=null;disposed=true;active=pending=false;notify();}};
}
