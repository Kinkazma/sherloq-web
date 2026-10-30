// Unlike keyboard playback, a pointer gesture keeps only its newest intent.
// Finish and paint one frame before starting the next, avoiding cancellation
// starvation. Quality is calibrated from input-to-paint work, never a timer
// that postpones input until pointerup. The final path remains native.
export function createLivePreview({createScene,changed=()=>{},targetMs=200,now=()=>performance.now(),schedule=fn=>setTimeout(fn,0),cancel=clearTimeout,onError=()=>{}}){
 let active=false,pending=false,wanted=null,current=null,last=null,held=null,timer=null,serial=0,painted=0,budget=256000,queueCost=0,closed=false;
 const history=[],key=value=>JSON.stringify(value),drop=frame=>frame?.scene.dispose();
 function start(){
  timer=null;if(closed||!active||current||!wanted)return;
  const refine=last&&last.key===wanted.key&&last.stats?.pixels<last.stats?.fullPixels&&budget>last.stats.pixels*1.25;
  if(last?.key===wanted.key&&!refine)return;
  const frame={id:++serial,key:wanted.key,effects:structuredClone(wanted.effects),inputAt:refine?now():wanted.at,started:now()};
  try{frame.scene=createScene(frame.effects,budget,frame.id);current=frame;pending=true;changed();}catch(error){onError(error);reset();}
 }
 function wake(){if(timer===null)timer=schedule(start);}
 function reset(){if(timer!==null)cancel(timer);timer=null;active=pending=false;wanted=null;drop(current);if(last!==current)drop(last);current=last=held=null;changed();}
 return {
  begin(native){if(closed)return;reset();held=native;active=true;},
  request(effects){if(!active)return;const k=key(effects);if(wanted?.key!==k)wanted={key:k,effects:structuredClone(effects),at:now()};wake();},
  end(effects){if(!active)return;if(effects)wanted={key:key(effects),effects:structuredClone(effects),at:now()};active=false;pending=!!(current||last);if(timer!==null)cancel(timer);timer=null;changed();},
  presented(frame){
   if(!frame.provisional){if(!active&&pending&&frame.effectsKey===wanted?.key)reset();return;}
   if(!current||frame.previewId!==current.id)return;
   const elapsed=Math.max(1,now()-current.started),stats=current.scene.stats();current.stats=stats;
   // Reserve time for an in-flight value and compositing within the 200 ms
   // average response budget. Full quality is never slowed down deliberately.
   queueCost=queueCost*.65+Math.min(targetMs*.6,Math.max(0,current.started-current.inputAt))*.35;
   if(stats.pixels>0){const goal=Math.max(40,targetMs*.92-queueCost),variable=Math.max(1,elapsed-24),estimate=stats.pixels*Math.max(.25,Math.min(4,(goal-24)/variable));budget=Math.max(4096,Math.min(Math.max(stats.fullPixels,4096),Math.round(estimate)));}
   painted++;history.push({milliseconds:elapsed,inputLatency:Math.max(0,now()-current.inputAt),...stats});if(history.length>40)history.shift();
   drop(last);last=current;current=null;changed();if(active)wake();
  },
  surface(native){
   if(!active&&!pending)return native;const preview=current?.scene.target,lastTarget=last?.scene.target??held;
   if(preview)preview.fallback=lastTarget;
   if(active)return preview??lastTarget??native;
   return native&&native.effectsKey===wanted?.key?{...native,fallback:preview??lastTarget}:preview??lastTarget??native;
  },
  reset,matches:effects=>wanted?.key===key(effects),get active(){return active;},get pending(){return pending;},
  diagnostics(){return {active,pending,targetMs,budgetPixels:budget,frames:painted,meanMilliseconds:history.length?history.reduce((n,v)=>n+v.milliseconds,0)/history.length:0,history:[...history]};},
  dispose(){closed=true;reset();}
 };
}
