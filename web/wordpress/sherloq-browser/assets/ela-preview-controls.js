// A held spinner/slider gesture owns one draft and one final commit. Losing
// capture, focus or the window cannot leave a provisional result exportable.
export function bindElaPreviewGesture(control,{keys=['ArrowUp','ArrowDown'],begin=()=>{},finish=()=>{},commitUnchanged=true}={}){
 let active=false,changed=false,disposed=false;const listeners=[];
 const listen=(target,type,handler,options)=>{if(!target?.addEventListener)return;target.addEventListener(type,handler,options);listeners.push(()=>target.removeEventListener?.(type,handler,options));};
 function start(event){if(disposed||active||control.disabled||event?.button>0||event?.isPrimary===false)return;active=true;changed=false;begin();}
 function end(){if(!active)return;const commit=commitUnchanged||changed;active=false;changed=false;if(commit&&!disposed)finish();}
 listen(control,'pointerdown',start,{capture:true});
 listen(control,'keydown',event=>{if(!event.ctrlKey&&!event.metaKey&&!event.altKey&&keys.includes(event.key))start(event);},{capture:true});
 for(const type of ['pointerup','pointercancel','lostpointercapture','blur'])listen(control,type,end);
 listen(control,'keyup',event=>{if(keys.includes(event.key))end();});
 const doc=control.ownerDocument;listen(doc,'pointerup',end);listen(doc,'pointercancel',end);listen(doc?.defaultView,'blur',end);listen(doc,'visibilitychange',()=>{if(doc.hidden)end();});
 return{get active(){return active;},markChanged(){if(active)changed=true;},finish:end,reset(){active=false;changed=false;},dispose(){disposed=true;active=false;changed=false;for(const remove of listeners.splice(0))remove();}};
}
