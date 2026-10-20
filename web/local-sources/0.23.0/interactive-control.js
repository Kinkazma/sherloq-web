// UI transaction only: previews never replace the scientific/native result.
let nextGeneration=0;
const adjustmentKeys=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'];
export function bindInteractiveControl(control,{
 read=()=>({valid:true,value:control.value}),equal=Object.is,update=()=>{},
 restore=value=>{if(control.type==='checkbox')control.checked=value;else control.value=value??'';},
 begin=()=>{},preview=()=>{},commit=()=>{},cancel=()=>{},
 keys=adjustmentKeys,discrete=control.tagName==='SELECT'||control.type==='checkbox',
 previewDelay=120,dragThreshold=3,now=()=>globalThis.performance?.now?.()??Date.now(),
 delay=(fn,ms)=>setTimeout(fn,ms),cancelDelay=id=>clearTimeout(id),
 schedule=globalThis.requestAnimationFrame?.bind(globalThis)??(fn=>setTimeout(fn,0)),
 cancelScheduled=globalThis.cancelAnimationFrame?.bind(globalThis)??clearTimeout
}={}){
 let disposed=false,pointer=null,pointerHeld=false,editing=false,dirty=false,generation=0,frame=null,wait=null,reason='input';
 let frameTicket=0,waitTicket=0;let started=null,pointerOrigin=null,pointerRange=false,continuous=false,dragged=false,usedPreview=false,inputKind='typing';
 const heldKeys=new Set(),listeners=[],ends=[];let last=read(),initial=last.value,latest=last.value;
 const held=()=>pointerHeld||heldKeys.size>0,active=()=>held()||editing||dirty;
 const listen=(target,type,fn,options,list=listeners)=>{if(!target?.addEventListener)return;target.addEventListener(type,fn,options);list.push(()=>target.removeEventListener(type,fn,options));};
 const clearFrame=()=>{frameTicket++;if(frame!==null)cancelScheduled(frame);frame=null;};
 const clearWait=()=>{waitTicket++;if(wait!==null)cancelDelay(wait);wait=null;};
 const clearEnds=()=>{for(const off of ends.splice(0))off();};
 const kind=()=>dragged?'drag':continuous&&inputKind!=='typing'?'hold':inputKind==='keyboard'?'keyrelease':inputKind==='pointer'?'click':'typing';
 const event=(why=reason)=>({generation,value:latest,reason:why,kind:kind(),continuous,usedPreview});
 function watch(){
  if(ends.length)return;const doc=control.ownerDocument,win=doc?.defaultView;
  listen(doc,'pointerup',pointerEnd,true,ends);listen(doc,'pointercancel',pointerEnd,true,ends);listen(doc,'pointermove',pointerMove,true,ends);
  listen(doc,'keyup',keyEnd,true,ends);listen(win,'blur',()=>finish('window-blur'),undefined,ends);
  listen(doc,'visibilitychange',()=>{if(doc.hidden)finish('hidden');},undefined,ends);
 }
 function intent(why){
  if(disposed||control.disabled)return false;
  if(started===null){initial=last.value;latest=last.value;reason=why;started=now();continuous=dragged=usedPreview=false;inputKind=why==='keyboard'?'keyboard':why==='pointer'?'pointer':'typing';}
  watch();return true;
 }
 function queueFrame(){
  if(discrete||!dirty||!continuous||frame!==null)return;const token=generation,ticket=++frameTicket;
  frame=schedule(()=>{if(disposed||generation!==token||ticket!==frameTicket)return;frame=null;if(dirty&&continuous){usedPreview=true;preview(event());}});
 }
 function requestPreview(){
  if(discrete||!dirty)return;if(continuous){queueFrame();return;}
  clearWait();const token=generation,ticket=++waitTicket,quiet=!held(),remaining=quiet?previewDelay:Math.max(0,previewDelay-(now()-started));
  wait=delay(()=>{if(disposed||!dirty||generation!==token||ticket!==waitTicket)return;wait=null;continuous=true;queueFrame();},remaining);
 }
 function sample(why){
  if(disposed||control.disabled)return false;const answer=read();if(!answer||answer.valid===false)return false;
  if(equal(answer.value,latest)&&last.valid!==false)return false;
  if(!intent(why))return false;latest=answer.value;last={valid:true,value:latest};update(latest,event(why));
  if(!dirty){dirty=true;generation=++nextGeneration;begin(event(why));}requestPreview();return true;
 }
 function clearIntent(){started=null;pointerOrigin=null;pointerRange=false;continuous=dragged=usedPreview=false;inputKind='typing';}
 function finish(why='finish'){
  if(disposed)return;sample(why);if(!discrete&&started!==null&&inputKind!=='typing'&&now()-started>=previewDelay)continuous=true;if(dirty&&read()?.valid===false)restore(latest);clearFrame();clearWait();pointerHeld=false;pointer=null;heldKeys.clear();editing=false;clearEnds();
  if(dirty){dirty=false;if(equal(latest,initial))cancel(event('unchanged'));else commit(event(why));initial=latest;}
  clearIntent();
 }
 function reset(why='reset'){
  clearFrame();clearWait();pointerHeld=false;pointer=null;heldKeys.clear();editing=false;clearEnds();const wasDirty=dirty;dirty=false;
  if(wasDirty)cancel(event(why));generation=++nextGeneration;clearIntent();const answer=read();if(answer?.valid!==false){last=answer;initial=latest=answer.value;}
 }
 function pointerStart(e){if(e.button>0||e.isPrimary===false||!intent('pointer'))return;pointerHeld=true;pointerRange=control.type==='range'||e.hoverSlider===true;pointer=e.pointerId??null;pointerOrigin={x:e.clientX,y:e.clientY};}
 function pointerMove(e){
  if(!pointerHeld||discrete||!pointerRange||pointer!==null&&e.pointerId!==undefined&&pointer!==e.pointerId)return;
  if(![pointerOrigin?.x,pointerOrigin?.y,e.clientX,e.clientY].every(Number.isFinite)||Math.hypot(e.clientX-pointerOrigin.x,e.clientY-pointerOrigin.y)<dragThreshold)return;
  dragged=continuous=true;clearWait();queueFrame();
 }
 function pointerEnd(e){if(!pointerHeld||pointer!==null&&e.pointerId!==undefined&&pointer!==e.pointerId)return;pointerHeld=false;pointer=null;if(!heldKeys.size)finish(e.type);}
 function keyStart(e){if(e.altKey||e.ctrlKey||e.metaKey)return;if(e.key==='Enter'){finish('enter');return;}if(!keys.includes(e.key)||!intent('keyboard'))return;heldKeys.add(e.key);}
 function keyEnd(e){if(!heldKeys.delete(e.key))return;if(!held())finish('keyup');}
 listen(control,'pointerdown',pointerStart,true);
 listen(control,'pointerup',pointerEnd);listen(control,'pointercancel',pointerEnd);
 listen(control,'lostpointercapture',e=>{if(pointerHeld)pointerEnd(e);});
 listen(control,'keydown',keyStart,true);listen(control,'keyup',keyEnd);
 listen(control,'beforeinput',e=>{if(/^(insert|delete)/.test(e.inputType??'')&&intent('typing'))editing=true;},true);
 const input=()=>{if(!held()&&!discrete)editing=true;sample('input');};
 const change=()=>{sample('change');if(discrete||!held())finish('change');};
 listen(control,'input',input);listen(control,'change',change);
 listen(control,'blur',()=>{if(control.dataset?.hoverSliderActive==='true')return;finish('blur');});
 return{
  get active(){return active();},get pending(){return frame!==null||wait!==null||dirty;},get generation(){return generation;},get previewAllowed(){return continuous&&!discrete;},
  input,change,flush(){if(!continuous)return;if(frame!==null)clearFrame();if(dirty&&!discrete){usedPreview=true;preview(event());}},finish,reset,
  dispose(){if(disposed)return;reset('dispose');disposed=true;for(const off of listeners.splice(0))off();}
 };
}
