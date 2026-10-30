// UI transaction only: previews never replace the scientific/native result.
let nextGeneration=0,nextGestureEpoch=0,nextControlRequestId=0;
const adjustmentKeys=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'];
export function bindInteractiveControl(control,{
 read=()=>({valid:true,value:control.value}),equal=Object.is,update=()=>{},
 restore=value=>{if(control.type==='checkbox')control.checked=value;else control.value=value??'';},
 begin=()=>{},preview=()=>{},commit=()=>{},cancel=()=>{},onDiagnostic,
 keys=adjustmentKeys,discrete=control.tagName==='SELECT'||control.type==='checkbox',
 previewDelay=120,dragThreshold=3,now=()=>globalThis.performance?.now?.()??Date.now(),
 delay=(fn,ms)=>setTimeout(fn,ms),cancelDelay=id=>clearTimeout(id),
 schedule=globalThis.requestAnimationFrame?.bind(globalThis)??(fn=>setTimeout(fn,0)),
 cancelScheduled=globalThis.cancelAnimationFrame?.bind(globalThis)??clearTimeout
}={}){
 let disposed=false,pointer=null,pointerHeld=false,editing=false,dirty=false,generation=0,frame=null,wait=null,reason='input';
 let frameTicket=0,waitTicket=0;let started=null,pointerOrigin=null,pointerRange=false,continuous=false,dragged=false,usedPreview=false,inputKind='typing';
 const heldKeys=new Set(),listeners=[],ends=[];let last=read(),initial=last.value,latest=last.value,gestureEpoch=0,controlRequestId=0,lastAdmittedInput=null,diagnosticEndedGestureEpoch=0;
 const diagnosticEnabled=typeof onDiagnostic==='function';
 // Review-only diagnostic proposal: the event actually received by this owner.
 const observation=e=>({type:typeof e?.type==='string'?e.type:null,isTrusted:typeof e?.isTrusted==='boolean'?e.isTrusted:null,eventTimeStamp:Number.isFinite(e?.timeStamp)?e.timeStamp:null,observedAt:now(),observedWallTime:Date.now(),clock:'performance.now',eventTimeStampClock:'DOM Event.timeStamp; unconverted',hoverSlider:e?.hoverSlider===true,numericIncrement:e?.numericIncrement===true});
 const boundary=(phase,why,e,outcome)=>{if(typeof onDiagnostic!=='function'||!gestureEpoch||phase==='end'&&diagnosticEndedGestureEpoch===gestureEpoch)return;if(phase==='end')diagnosticEndedGestureEpoch=gestureEpoch;try{onDiagnostic({schema:'parameter-gesture/1',phase,gestureEpoch,generation,controlRequestId,reason:why,outcome:outcome??null,event:observation(e),value:typeof latest==='number'&&Number.isFinite(latest)||latest===null?latest:null,continuous,usedPreview});}catch{}};
 const sendPreview=()=>{if(diagnosticEnabled)controlRequestId=++nextControlRequestId;preview(event());};
 const held=()=>pointerHeld||heldKeys.size>0,active=()=>held()||editing||dirty;
 const listen=(target,type,fn,options,list=listeners)=>{if(!target?.addEventListener)return;target.addEventListener(type,fn,options);list.push(()=>target.removeEventListener(type,fn,options));};
 const clearFrame=()=>{frameTicket++;if(frame!==null)cancelScheduled(frame);frame=null;};
 const clearWait=()=>{waitTicket++;if(wait!==null)cancelDelay(wait);wait=null;};
 const clearEnds=()=>{for(const off of ends.splice(0))off();};
 const kind=()=>dragged?'drag':continuous&&inputKind!=='typing'?'hold':inputKind==='keyboard'?'keyrelease':inputKind==='pointer'?'click':'typing';
 const event=(why=reason)=>({generation,value:latest,reason:why,kind:kind(),continuous,usedPreview,...(diagnosticEnabled?{gestureEpoch,controlRequestId,lastAdmittedInput}:{})});
 function watch(){
  if(ends.length)return;const doc=control.ownerDocument,win=doc?.defaultView;
  listen(doc,'pointerup',pointerEnd,true,ends);listen(doc,'pointercancel',pointerEnd,true,ends);listen(doc,'pointermove',pointerMove,true,ends);
  listen(doc,'keyup',keyEnd,true,ends);listen(win,'blur',e=>finish('window-blur',e),undefined,ends);
  listen(doc,'visibilitychange',e=>{if(doc.hidden)finish('hidden',e);},undefined,ends);
 }
 function intent(why,sourceEvent){
  if(disposed||control.disabled)return false;
  if(started===null){initial=last.value;latest=last.value;reason=why;started=now();continuous=dragged=usedPreview=false;inputKind=why==='keyboard'?'keyboard':why==='pointer'?'pointer':'typing';gestureEpoch=diagnosticEnabled?++nextGestureEpoch:0;diagnosticEndedGestureEpoch=0;controlRequestId=0;lastAdmittedInput=null;boundary('begin',why,sourceEvent);}
  watch();return true;
 }
 function queueFrame(){
  if(discrete||!dirty||!continuous||frame!==null)return;const token=generation,ticket=++frameTicket;
  frame=schedule(()=>{if(disposed||generation!==token||ticket!==frameTicket)return;frame=null;if(dirty&&continuous){usedPreview=true;sendPreview();}});
 }
 function requestPreview(){
  if(discrete||!dirty)return;if(continuous){queueFrame();return;}
  clearWait();const token=generation,ticket=++waitTicket,quiet=!held(),remaining=quiet?previewDelay:Math.max(0,previewDelay-(now()-started));
  wait=delay(()=>{if(disposed||!dirty||generation!==token||ticket!==waitTicket)return;wait=null;continuous=true;queueFrame();},remaining);
 }
 function sample(why,sourceEvent){
  if(disposed||control.disabled)return false;const answer=read();if(!answer||answer.valid===false)return false;
  if(equal(answer.value,latest)&&last.valid!==false)return false;
  if(!intent(why,sourceEvent))return false;latest=answer.value;last={valid:true,value:latest};lastAdmittedInput=diagnosticEnabled?{...observation(sourceEvent),value:typeof latest==='number'&&Number.isFinite(latest)||latest===null?latest:null}:null;const token=generation;update(latest,event(why));if(disposed||generation!==token)return false;
  if(!dirty){dirty=true;generation=++nextGeneration;begin(event(why));}requestPreview();return true;
 }
 function clearIntent(){started=null;pointerOrigin=null;pointerRange=false;continuous=dragged=usedPreview=false;inputKind='typing';gestureEpoch=controlRequestId=0;lastAdmittedInput=null;}
 function finish(why='finish',sourceEvent){
  if(disposed)return;sample(why,sourceEvent);if(!discrete&&started!==null&&inputKind!=='typing'&&now()-started>=previewDelay)continuous=true;if(read()?.valid===false&&last?.valid!==false)restore(latest);clearFrame();clearWait();pointerHeld=false;pointer=null;heldKeys.clear();editing=false;clearEnds();
  boundary('end',why,sourceEvent,dirty?(equal(latest,initial)?'cancel-unchanged':'commit-intention'):'no-change');
  if(dirty){dirty=false;if(equal(latest,initial))cancel(event('unchanged'));else commit(event(why));initial=latest;}
  clearIntent();
 }
 function reset(why='reset'){
  clearFrame();clearWait();pointerHeld=false;pointer=null;heldKeys.clear();editing=false;clearEnds();const wasDirty=dirty;dirty=false;
  boundary('end',why,null,wasDirty?'reset-cancel':'reset-no-change');
  if(wasDirty)cancel(event(why));generation=++nextGeneration;clearIntent();const answer=read();if(answer?.valid!==false){last=answer;initial=latest=answer.value;}
 }
 function pointerStart(e){if(e.button>0||e.isPrimary===false||!intent('pointer',e))return;pointerHeld=true;pointerRange=control.type==='range'||e.hoverSlider===true;pointer=e.pointerId??null;pointerOrigin={x:e.clientX,y:e.clientY};}
 function pointerMove(e){
  if(!pointerHeld||pointer!==null&&e.pointerId!==undefined&&pointer!==e.pointerId)return;
  if(e.buttons===0){finish('pointer-buttons-released',e);return;}
  if(discrete||!pointerRange)return;
  if(![pointerOrigin?.x,pointerOrigin?.y,e.clientX,e.clientY].every(Number.isFinite)||Math.hypot(e.clientX-pointerOrigin.x,e.clientY-pointerOrigin.y)<dragThreshold)return;
  dragged=continuous=true;clearWait();queueFrame();
 }
 function pointerEnd(e){if(!pointerHeld||pointer!==null&&e.pointerId!==undefined&&pointer!==e.pointerId)return;pointerHeld=false;pointer=null;if(!heldKeys.size)finish(e.type,e);}
 function keyStart(e){if(e.altKey||e.ctrlKey||e.metaKey)return;if(e.key==='Enter'){if(control.tagName==='INPUT'&&['number','range'].includes(control.type))e.preventDefault();finish('enter',e);return;}if(!keys.includes(e.key)||!intent('keyboard',e))return;heldKeys.add(e.key);}
 function keyEnd(e){if(!heldKeys.delete(e.key))return;if(!held())finish('keyup',e);}
 listen(control,'pointerdown',pointerStart,true);
 listen(control,'pointerup',pointerEnd);listen(control,'pointercancel',pointerEnd);
 listen(control,'lostpointercapture',e=>{if(pointerHeld)pointerEnd(e);});
 listen(control,'keydown',keyStart,true);listen(control,'keyup',keyEnd);
 listen(control,'beforeinput',e=>{if(/^(insert|delete)/.test(e.inputType??'')&&intent('typing',e))editing=true;},true);
 const input=e=>{if(!held()&&!discrete)editing=true;sample('input',e);};
 const change=e=>{sample('change',e);if(discrete||!held())finish('change',e);};
 listen(control,'input',input);listen(control,'change',change);
 // WebKit may blur a focused range while its pointer is still held.
 // The matching global pointer/window end remains the owner of that gesture.
 listen(control,'blur',e=>{if(control.dataset?.hoverSliderActive==='true'||pointerHeld&&pointerRange)return;finish('blur',e);});
 return{
  get active(){return active();},get pending(){return frame!==null||wait!==null||dirty;},get generation(){return generation;},get previewAllowed(){return continuous&&!discrete;},
  input,change,flush(){if(!continuous)return;if(frame!==null)clearFrame();if(dirty&&!discrete){usedPreview=true;sendPreview();}},finish,reset,
  dispose(){if(disposed)return;reset('dispose');disposed=true;for(const off of listeners.splice(0))off();}
 };
}
