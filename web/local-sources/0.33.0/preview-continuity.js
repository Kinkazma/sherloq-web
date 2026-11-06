// A temporary gesture owns this evidence. Counts of inputs, queue time and idle
// time are not work. Only dispatched, still-owned computations can advance it.
import {PREVIEW_QUALITY_POLICY as policy} from './preview-quality-policy.js?v=0.33.0';
export function createPreviewContinuity({now=()=>performance.now(),windowMs=policy.noFrameWorkWindowMilliseconds,maxMisses=policy.maxNoFrameWindows}={}){
 let current=null;
 const key=event=>event?.continuous===true&&Number.isSafeInteger(event.generation)&&event.generation>0&&Number.isSafeInteger(event.gestureEpoch)&&event.gestureEpoch>0?JSON.stringify([event.operation??'',event.toolId??'',event.field??'',event.generation,event.gestureEpoch]):null;
 function start(event){const scope=key(event);if(!scope)return null;if(current?.scope!==scope)current={scope,misses:0,milliseconds:0,attempts:0};return{owner:current,started:now(),finished:false};}
 function snapshot(ticket){const row=ticket?.owner;return row&&row===current?{schema:'preview-continuity/1',scope:row.scope,misses:row.misses}:undefined;}
 function finish(ticket,{milliseconds,presented=false,eligible=false}={}){
  if(!ticket||ticket.owner!==current)return;const row=current;
  // A delayed first paint may replace a compute-only completion. Its ACK is
  // one-shot: replaying it must not erase newer work or count this frame twice.
  if(presented){if(ticket.presented)return;ticket.presented=ticket.finished=true;row.milliseconds=row.attempts=row.misses=0;return;}
  if(ticket.finished)return;ticket.finished=true;
  if(!eligible||!Number.isFinite(milliseconds)||milliseconds<=0)return;
  row.milliseconds+=Math.min(milliseconds,windowMs);row.attempts++;
  if(row.milliseconds>=windowMs&&row.attempts>=policy.noFrameMinimumAttempts){row.misses=Math.min(maxMisses,row.misses+1);row.milliseconds=row.attempts=0;}
 }
 return{start,snapshot,finish,reset(){current=null;},get state(){return current?{...current}:null;}};
}
