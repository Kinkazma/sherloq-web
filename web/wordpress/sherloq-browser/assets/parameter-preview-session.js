// One replaceable draft and one final intention. A preview owns no scientific
// result; source/tool changes invalidate publication, even if a read completes.
export function createParameterPreviewSession({preview,show,commit,restore=()=>{},state=()=>{},error=()=>{},schedule=fn=>setTimeout(fn,0),unschedule=clearTimeout}={}){
 let epoch=0,disposed=false,pending=false,active=false,queued=null,flight=null,finalTimer=null,finalFlight=null,controller=null,uncommittedFinal=null;
 const notify=()=>state({pending,active,previewRunning:!!flight,finalRunning:!!finalFlight,epoch});
 const cancelTimer=()=>{if(finalTimer!==null)unschedule(finalTimer);finalTimer=null;};
 function invalidate(){epoch++;queued=null;cancelTimer();controller?.abort();controller=null;}
 function reset(reason='cancel',{restoreResult=true}={}){if(disposed)return;invalidate();uncommittedFinal=null;active=pending=false;if(restoreResult)restore(reason);notify();}
 async function pump(){
  if(disposed||flight||!queued)return;
  const ticket=queued;queued=null;const abort=new AbortController();controller=abort;
  const task=(async()=>{try{const result=await preview(ticket.event,{signal:abort.signal});if(!disposed&&ticket.epoch===epoch&&pending&&active&&!abort.signal.aborted&&result)await show(result,ticket.event);}catch(e){if(!disposed&&ticket.epoch===epoch&&!abort.signal.aborted&&e?.code!=='CANCELLED'&&e?.name!=='AbortError')error(e,{phase:'preview',event:ticket.event});}})();
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
   // Replacing the pending ticket makes late responses invisible immediately.
   epoch++;queued={epoch,event};notify();void pump();return;
  }
  if(event.phase!=='commit')return;
  invalidate();uncommittedFinal=event;active=false;pending=true;const token=epoch,previousFinal=finalFlight;notify();
  finalTimer=schedule(()=>{finalTimer=null;const task=Promise.resolve().then(async()=>{
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
