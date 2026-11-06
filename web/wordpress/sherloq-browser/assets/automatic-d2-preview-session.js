import {genericHeldPreviewKey} from './generic-held-preview-owner.js?v=0.32.0';
import {createPreviewContinuity} from './preview-continuity.js?v=0.32.0';
// One native/RGB transaction and one replaceable intention. A completed owned
// frame can advance within its gesture; only the latest intention becomes final.
export function createAutomaticD2PreviewSession({preview,show,commit,restore=()=>{},error=()=>{},changed=()=>{},supersededBudgetMs=300,now=()=>performance.now(),delay=(fn,ms)=>setTimeout(fn,ms),undelay=clearTimeout}={}){
 let disposed=false,active=false,pending=false,latest=null,queued=null,flight=null,finalQueued=null,finalFlight=null,restoring=null,epoch=0,ordinal=0,lastPresentedOrdinal=0,obsoleteTimer=null;const waiters=new Set();
 const continuity=createPreviewContinuity({now});
 const settled=()=>{if(!flight&&!finalFlight&&!queued&&!finalQueued&&!restoring){for(const resolve of waiters)resolve();waiters.clear();}};
 const notify=()=>{changed();settled();};
 const owns=event=>{try{return event?.completedPreviewCurrent?.()===true;}catch{return false;}};
 const typed=event=>event?.field==='automatic-d2-minimum'&&['analysis.complete','analysis.clones'].includes(event.operation)&&Number.isSafeInteger(event.generation)&&event.generation>0&&Number.isSafeInteger(event.gestureEpoch)&&event.gestureEpoch>0&&Number.isInteger(event.params?.minimum)&&event.params.minimum>=0&&event.params.minimum<=5000;
 const settings=event=>{const params={...event.params},view={...event.view};delete params.minimum;if(Object.hasOwn(view,'d2prlMinimum')&&view.d2prlMinimum!==event.params.minimum)return null;delete view.d2prlMinimum;return genericHeldPreviewKey([params,view,event.extras??{}]);};
 const same=(a,b)=>{try{return typed(a)&&typed(b)&&a.continuous===true&&b.continuous===true&&a.operation===b.operation&&a.generation===b.generation&&a.gestureEpoch===b.gestureEpoch&&settings(a)!==null&&settings(a)===settings(b)&&owns(a)&&owns(b);}catch{return false;}};
 const valid=(answer,event)=>answer?.operation===event.operation&&answer.exact===false&&answer.provisional===true&&answer.approximate===true&&answer.exportable===false&&answer.metrics?.automaticD2Preview===true&&answer.metrics.inferences===0&&answer.params?.minimum===event.params.minimum&&answer.metrics.calculatedMinimum===answer.params.minimum;
 function current(ticket,answer){return !disposed&&active&&pending&&!finalQueued&&!finalFlight&&ticket.epoch===epoch&&!ticket.abort.signal.aborted&&ticket.ordinal>=lastPresentedOrdinal&&same(ticket.event,latest)&&valid(answer,ticket.event);}
 function report(cause,event,phase){if(cause?.code!=='CANCELLED'&&cause?.name!=='AbortError')error(cause,{event,phase});}
 const clearObsolete=()=>{if(obsoleteTimer!==null)undelay(obsoleteTimer);obsoleteTimer=null;};
 function supersede(event){
  if(!flight)return;
  if(flight.epoch!==epoch||!same(flight.event,event)){clearObsolete();flight.abort.abort('superseded-context');return;}
  if(obsoleteTimer!==null||flight.computeStartedAt===null)return;const ticket=flight;
  obsoleteTimer=delay(()=>{obsoleteTimer=null;if(flight===ticket&&active&&pending&&ticket.event!==latest){ticket.missedPresentation=same(ticket.event,latest);ticket.abort.abort('superseded-deadline');}},Math.max(0,supersededBudgetMs-(ticket.computeMilliseconds+Math.max(0,now()-ticket.computeStartedAt))));
 }
 async function finish(){
  if(disposed||flight||finalFlight||!finalQueued)return;
  const event=finalQueued;finalQueued=null;const token=epoch,ticket={event};finalFlight=ticket;notify();
  const finalOwned=()=>{try{return !disposed&&epoch===token&&event.finalPreviewCurrent?.()===true;}catch{return false;}};
  try{if(finalOwned())await commit(event,{isCurrent:finalOwned});}
  catch(cause){if(token===epoch&&!disposed)report(cause,event,'final');}
  finally{if(finalFlight===ticket)finalFlight=null;if(token===epoch&&!finalQueued){pending=false;latest=null;}notify();if(finalQueued)void finish();else if(queued)void pump();}
 }
 async function pump(){
  if(disposed||flight||finalFlight||finalQueued||!queued)return;
  const entry=queued,event=entry.event;queued=null;const ticket={...entry,epoch,abort:new AbortController(),startedAt:now(),progress:continuity.start(event),computeStartedAt:null,computeMilliseconds:0,painted:false};flight=ticket;notify();
  try{
   const answer=await preview(event,{signal:ticket.abort.signal,isCurrent:()=>!disposed&&active&&ticket.epoch===epoch&&!ticket.abort.signal.aborted&&same(event,latest),continuity:continuity.snapshot(ticket.progress),onComputeStart:()=>{if(ticket.computeStartedAt===null&&!ticket.abort.signal.aborted){ticket.computeStartedAt=now();if(ticket.event!==latest)supersede(latest);}},onComputeEnd:({milliseconds}={})=>{if(ticket.computeStartedAt!==null){ticket.computeMilliseconds+=Number.isFinite(milliseconds)&&milliseconds>=0?milliseconds:Math.max(0,now()-ticket.computeStartedAt);ticket.computeStartedAt=null;}clearObsolete();}});
   if(answer&&ticket.ordinal>lastPresentedOrdinal&&current(ticket,answer)){
    const decorated={...answer,metrics:{...answer.metrics,continuousPreview:{policy:event===latest?'latest-requested-value':'last-completed-same-gesture',automaticD2:true,generation:event.generation,gestureEpoch:event.gestureEpoch,field:event.field,controlRequestId:event.controlRequestId,requestedParameters:structuredClone(event.params),calculatedParameters:structuredClone(answer.params),latestRequestedParameters:structuredClone(latest.params),requestedView:structuredClone(event.view),calculatedView:structuredClone(answer.calculatedView),latestRequestedView:structuredClone(latest.view),exportLocked:true}}};
    await show(decorated,event,{signal:ticket.abort.signal,isCurrent:()=>current(ticket,answer),onPresented:receipt=>{if(!ticket.painted&&receipt?.presented===true&&current(ticket,answer)){ticket.painted=true;continuity.finish(ticket.progress,{presented:true});}}});
    if(current(ticket,answer))lastPresentedOrdinal=Math.max(lastPresentedOrdinal,ticket.ordinal);
   }
  }catch(cause){if(!disposed&&ticket.epoch===epoch&&!ticket.abort.signal.aborted&&owns(event))report(cause,event,'preview');}
  finally{continuity.finish(ticket.progress,{milliseconds:ticket.computeMilliseconds+(ticket.computeStartedAt===null?0:Math.max(0,now()-ticket.computeStartedAt)),eligible:(ticket.computeMilliseconds>0||ticket.computeStartedAt!==null)&&ticket.missedPresentation===true&&!disposed&&active&&pending&&ticket.epoch===epoch&&same(ticket.event,latest)});if(flight===ticket){flight=null;clearObsolete();}notify();if(finalQueued)void finish();else if(queued)void pump();}
 }
 function reset(reason='cancel',{restore:shouldRestore=false}={}){const previous=latest,token=++epoch;active=false;pending=shouldRestore&&!disposed;latest=queued=finalQueued=null;ordinal=lastPresentedOrdinal=0;continuity.reset();clearObsolete();flight?.abort.abort(reason);if(pending){const task=Promise.resolve(restore(previous,{reason,isCurrent:()=>!disposed&&epoch===token})).catch(cause=>{if(epoch===token&&!disposed)report(cause,previous,'restore');}).finally(()=>{if(restoring===task)restoring=null;if(epoch===token)pending=false;notify();});restoring=task;}notify();}
 return{
  begin(event){if(disposed)return;if(!typed(event)){reset('invalid-control');return;}epoch++;active=true;pending=true;latest=event;queued=finalQueued=null;ordinal=lastPresentedOrdinal=0;continuity.reset();clearObsolete();flight?.abort.abort('new-gesture');notify();},
  preview(event){if(disposed)return;if(!typed(event)||event.continuous!==true){reset('invalid-control');return;}if(!active||!same(latest,event)){epoch++;ordinal=lastPresentedOrdinal=0;continuity.reset();clearObsolete();}active=pending=true;latest=event;supersede(event);queued={event,ordinal:++ordinal};notify();void pump();},
  valueChanged(event){if(disposed)return;queued=null;if(active&&same(latest,event)){latest=event;supersede(event);}else{epoch++;latest=null;continuity.reset();clearObsolete();flight?.abort.abort('superseded-input');}notify();},
  commit(event){if(disposed)return;if(!typed(event)){reset('invalid-control');return;}epoch++;active=false;pending=true;latest=null;queued=null;finalQueued=event;continuity.reset();clearObsolete();flight?.abort.abort('release');notify();void finish();},
  reset,dispose(){if(disposed)return;reset('dispose');disposed=true;notify();},
  get pending(){return pending;},get active(){return active;},get inFlight(){return !!flight||!!finalFlight;},
  settled(){return !flight&&!finalFlight&&!queued&&!finalQueued&&!restoring?Promise.resolve():new Promise(resolve=>waiters.add(resolve));}
 };
}
