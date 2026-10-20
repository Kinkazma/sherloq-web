// A brief click commits native settings. Only a held control or a real range
// drag may publish provisional pixels, and release cancels every queued draft.
export function bindElaPreviewGesture(control,{
 keys=['ArrowUp','ArrowDown'],begin=()=>{},preview=()=>{},finish=()=>{},commitUnchanged=true,
 previewDelay=120,dragThreshold=3,now=()=>globalThis.performance?.now?.()??Date.now(),
 delay=(fn,ms)=>setTimeout(fn,ms),cancelDelay=id=>clearTimeout(id),
 schedule=globalThis.requestAnimationFrame?.bind(globalThis)??(fn=>setTimeout(fn,0)),
 cancelScheduled=globalThis.cancelAnimationFrame?.bind(globalThis)??clearTimeout
}={}){
 let active=false,changed=false,disposed=false,continuous=false,usedPreview=false,dragged=false,generation=0,started=0,wait=null,frame=null,pointer=null,pointerHeld=false,hoverSlider=false,origin=null,inputKind='pointer';
 const heldKeys=new Set(),listeners=[];
 const listen=(target,type,handler,options)=>{if(!target?.addEventListener)return;target.addEventListener(type,handler,options);listeners.push(()=>target.removeEventListener?.(type,handler,options));};
 const clearWait=()=>{if(wait!==null)cancelDelay(wait);wait=null;};
 const clearFrame=()=>{if(frame!==null)cancelScheduled(frame);frame=null;};
 const event=reason=>({generation,reason,continuous,usedPreview,kind:dragged?'drag':continuous?'hold':inputKind==='keyboard'?'keyrelease':'click'});
 function queuePreview(){
  if(!active||!changed||!continuous||disposed||frame!==null)return;const token=generation;
  frame=schedule(()=>{if(token!==generation)return;frame=null;if(!disposed&&active&&changed&&continuous){usedPreview=true;preview(event('preview'));}});
 }
 function requestPreview(){
  if(!active||!changed||disposed)return;if(continuous){queuePreview();return;}if(wait!==null)return;const token=generation;
  wait=delay(()=>{if(token!==generation)return;wait=null;if(disposed||!active||!changed)return;continuous=true;queuePreview();},Math.max(0,previewDelay-(now()-started)));
 }
 function start(e,kind){
  if(disposed||control.disabled||e?.button>0||e?.isPrimary===false)return false;
  if(!active){active=true;changed=continuous=usedPreview=dragged=false;started=now();inputKind=kind;generation++;begin(event('begin'));}return true;
 }
 function clear(){clearWait();clearFrame();active=changed=continuous=usedPreview=dragged=false;pointerHeld=hoverSlider=false;pointer=null;origin=null;heldKeys.clear();generation++;}
 function end(reason='finish'){
  if(!active)return;const commit=commitUnchanged||changed,report=event(typeof reason==='string'?reason:reason?.type??'finish');clear();if(commit&&!disposed)finish(report);
 }
 function pointerStart(e){if(!start(e,'pointer'))return;pointerHeld=true;hoverSlider=e.hoverSlider===true;pointer=e.pointerId??null;origin={x:e.clientX,y:e.clientY};}
 function pointerEnd(e){if(!pointerHeld||pointer!==null&&e.pointerId!==undefined&&pointer!==e.pointerId)return;pointerHeld=false;pointer=null;if(!heldKeys.size)end(e.type);}
 function pointerMove(e){
  if(!pointerHeld||control.type!=='range'&&!hoverSlider||pointer!==null&&e.pointerId!==undefined&&pointer!==e.pointerId)return;
  if(![origin?.x,origin?.y,e.clientX,e.clientY].every(Number.isFinite)||Math.hypot(e.clientX-origin.x,e.clientY-origin.y)<dragThreshold)return;
  dragged=continuous=true;clearWait();queuePreview();
 }
 function keyStart(e){if(e.ctrlKey||e.metaKey||e.altKey||!keys.includes(e.key)||!start(e,'keyboard'))return;heldKeys.add(e.key);}
 function keyEnd(e){if(!heldKeys.delete(e.key))return;if(!pointerHeld&&!heldKeys.size)end('keyup');}
 listen(control,'pointerdown',pointerStart,{capture:true});listen(control,'keydown',keyStart,{capture:true});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(control,type,pointerEnd);
 listen(control,'keyup',keyEnd);listen(control,'blur',()=>{if(hoverSlider&&control.dataset?.hoverSliderActive==='true')return;end('blur');});
 const doc=control.ownerDocument;listen(doc,'pointerup',pointerEnd);listen(doc,'pointercancel',pointerEnd);listen(doc,'pointermove',pointerMove);listen(doc,'keyup',keyEnd);listen(doc?.defaultView,'blur',()=>end('window-blur'));listen(doc,'visibilitychange',()=>{if(doc.hidden)end('hidden');});
 return{
  get active(){return active;},get previewAllowed(){return active&&continuous;},get continuous(){return continuous;},get usedPreview(){return usedPreview;},get pending(){return wait!==null||frame!==null;},
  markChanged(){if(!active||disposed)return false;changed=true;requestPreview();return true;},finish:end,reset:clear,
  dispose(){if(disposed)return;disposed=true;clear();for(const remove of listeners.splice(0))remove();}
 };
}
