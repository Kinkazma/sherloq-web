// Scheduling only: scientific sources, pixels, parameters and owners stay with
// their existing clients. No decoder, sampler, calibration or timing probe.
export function createFirstSourceFrameGate({isCurrent,onReady,onPresented,
 schedule=callback=>requestAnimationFrame(callback),cancel=handle=>cancelAnimationFrame(handle),
 post=callback=>setTimeout(callback,0),cancelPost=handle=>clearTimeout(handle)}={}){
 let ticket=null;
 function clear(){const previous=ticket;ticket=null;if(previous?.frame!==undefined)cancel(previous.frame);if(previous?.task!==undefined)cancelPost(previous.task);}
 function current(source){return ticket&&ticket.source===source&&isCurrent(ticket)?ticket:null;}
 function allowWork(active){if(active.workReady)return;active.workReady=true;const analysisRequested=active.analysisRequested;active.analysisRequested=false;onReady({...active,analysisRequested});}
 return{
  begin(owner){clear();ticket={...owner,workReady:false,presented:false,paintQueued:false,analysisRequested:false};},
  pending(source){const active=current(source);return !!active&&!active.workReady;},
  requestAnalysis(source){const active=current(source);if(!active||active.workReady)return false;active.analysisRequested=true;return true;},
  cancelAnalysis(){if(ticket)ticket.analysisRequested=false;},
  background(source){
   const active=current(source);if(!active)return;
   if(active.frame!==undefined)cancel(active.frame);if(active.task!==undefined)cancelPost(active.task);
   active.frame=active.task=undefined;active.paintQueued=false;allowWork(active);
  },
  presented(source){
   const active=current(source);if(!active||active.presented||active.paintQueued)return;
   active.paintQueued=true;
   // A ready Native viewport has actually been drawn. Yield through the next
   // animation frame before releasing work that could otherwise precede paint.
   active.frame=schedule(()=>{active.frame=undefined;if(ticket!==active||!isCurrent(active))return;active.task=post(()=>{active.task=undefined;if(ticket!==active||!isCurrent(active))return;active.paintQueued=false;active.presented=true;allowWork(active);if(ticket===active&&isCurrent(active))onPresented?.(active);});});
  },
  clear
 };
}
