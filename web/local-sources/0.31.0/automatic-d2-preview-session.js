// Typed automatic D2 hold: one native/RGB transaction and one replaceable intent.
// Completed pixels retain their actual minimum while the latest intention stays final.
export function createAutomaticD2PreviewSession({preview,show,commit,restore=()=>{},error=()=>{},changed=()=>{}}){
 let disposed=false,active=false,pending=false,latest=null,queued=null,flight=null,finalQueued=null,finalFlight=null,restoring=null,epoch=0;const waiters=new Set();
 const settled=()=>{if(!flight&&!finalFlight&&!queued&&!finalQueued&&!restoring){for(const resolve of waiters)resolve();waiters.clear();}};
 const notify=()=>{changed();settled();};
 const owns=event=>{try{return event?.completedPreviewCurrent?.()===true;}catch{return false;}};
 const typed=event=>event?.field==='automatic-d2-minimum'&&['analysis.complete','analysis.clones'].includes(event.operation)&&Number.isSafeInteger(event.generation)&&event.generation>0&&Number.isSafeInteger(event.gestureEpoch)&&event.gestureEpoch>0&&Number.isInteger(event.params?.minimum)&&event.params.minimum>=0&&event.params.minimum<=5000;
 const same=(a,b)=>typed(a)&&typed(b)&&a.continuous===true&&b.continuous===true&&a.operation===b.operation&&a.generation===b.generation&&a.gestureEpoch===b.gestureEpoch;
 const valid=(answer,event)=>answer?.operation===event.operation&&answer.exact===false&&answer.provisional===true&&answer.approximate===true&&answer.exportable===false&&answer.metrics?.automaticD2Preview===true&&answer.metrics.inferences===0&&answer.params?.minimum===event.params.minimum&&answer.metrics.calculatedMinimum===answer.params.minimum;
 function current(ticket,answer){return !disposed&&active&&pending&&!finalQueued&&!finalFlight&&!ticket.abort.signal.aborted&&same(ticket.event,latest)&&owns(ticket.event)&&owns(latest)&&valid(answer,ticket.event);}
 function report(cause,event,phase){if(cause?.code!=='CANCELLED')error(cause,{event,phase});}
 async function finish(){
  if(disposed||flight||finalFlight||!finalQueued)return;
  const event=finalQueued;finalQueued=null;const token=epoch,ticket={event};finalFlight=ticket;notify();
  const finalOwned=()=>{try{return !disposed&&epoch===token&&event.finalPreviewCurrent?.()===true;}catch{return false;}};
  try{if(finalOwned())await commit(event,{isCurrent:finalOwned});}
  catch(cause){report(cause,event,'final');}
  finally{if(finalFlight===ticket)finalFlight=null;if(token===epoch&&!finalQueued){pending=false;latest=null;}notify();if(finalQueued)void finish();else if(queued)void pump();}
 }
 async function pump(){
  if(disposed||flight||finalFlight||finalQueued||!queued)return;
  const event=queued;queued=null;const ticket={event,abort:new AbortController()};flight=ticket;notify();
  try{
   const answer=await preview(event,{signal:ticket.abort.signal,isCurrent:()=>!disposed&&active&&owns(event)});
   if(answer&&current(ticket,answer)){
    const decorated={...answer,metrics:{...answer.metrics,continuousPreview:{policy:'last-completed-same-gesture',automaticD2:true,generation:event.generation,gestureEpoch:event.gestureEpoch,field:event.field,requestedParameters:structuredClone(event.params),calculatedParameters:structuredClone(answer.params),latestRequestedParameters:structuredClone(latest.params),requestedView:structuredClone(event.view),calculatedView:structuredClone(answer.calculatedView),latestRequestedView:structuredClone(latest.view)}}};
    await show(decorated,event,{signal:ticket.abort.signal,isCurrent:()=>current(ticket,answer)});
   }
  }catch(cause){report(cause,event,'preview');}
  finally{if(flight===ticket)flight=null;notify();if(finalQueued)void finish();else if(queued)void pump();}
 }
 function reset(reason='cancel',{restore:shouldRestore=false}={}){const previous=latest,token=++epoch;active=false;pending=shouldRestore&&!disposed;latest=queued=finalQueued=null;flight?.abort.abort(reason);if(pending){const task=Promise.resolve(restore(previous,{reason,isCurrent:()=>!disposed&&epoch===token})).catch(cause=>report(cause,previous,'restore')).finally(()=>{if(restoring===task)restoring=null;if(epoch===token)pending=false;notify();});restoring=task;}notify();}
 return{
  begin(event){if(disposed)return;if(!typed(event)){reset('invalid-control');return;}epoch++;active=true;pending=true;latest=event;queued=null;flight?.abort.abort('new-gesture');notify();},
  preview(event){if(disposed)return;if(!typed(event)||event.continuous!==true){reset('invalid-control');return;}if(!active||!same(latest,event)){epoch++;flight?.abort.abort('new-gesture');}active=pending=true;latest=queued=event;notify();void pump();},
  commit(event){if(disposed)return;if(!typed(event)){reset('invalid-control');return;}epoch++;active=false;pending=true;latest=null;queued=null;finalQueued=event;flight?.abort.abort('release');notify();void finish();},
  reset,dispose(){if(disposed)return;reset('dispose');disposed=true;notify();},
  get pending(){return pending;},get active(){return active;},get inFlight(){return !!flight||!!finalFlight;},
  settled(){return !flight&&!finalFlight&&!queued&&!finalQueued&&!restoring?Promise.resolve():new Promise(resolve=>waiters.add(resolve));}
 };
}
