// Browsers do not expose a reliable wheel device type. Auto uses event evidence;
// the explicit mouse/trackpad preference resolves high-resolution mouse ambiguity.
export function createWheelIntent(){
 let trackpadUntil=-Infinity;
 return (event,mode='auto')=>{
  const unit=event.deltaMode||0,dx=event.deltaX||0,dy=event.deltaY||0,now=event.timeStamp||0;
  if(event.ctrlKey){trackpadUntil=now+300;return 'pinch';}
  if(mode==='mouse')return 'zoom';
  if(mode==='trackpad')return 'pan';
  if(unit!==0)return 'zoom';
  const legacy=event.wheelDeltaY;
  const preciseLegacy=Number.isFinite(legacy)&&dy!==0&&Math.abs(legacy+dy*3)<.01;
  const wheelStep=Number.isFinite(legacy)&&legacy!==0&&Math.abs(legacy)%120===0&&!preciseLegacy;
  if(wheelStep){trackpadUntil=-Infinity;return 'zoom';}
  if(dx!==0||preciseLegacy||!Number.isInteger(dy)||Math.abs(dy)<40){trackpadUntil=now+300;return 'pan';}
  if(now<trackpadUntil){trackpadUntil=now+300;return 'pan';}
  // Conventional pixel-mode wheel notches without the optional legacy signal.
  if(Math.abs(dy)%100===0||Math.abs(dy)%120===0)return 'zoom';
  trackpadUntil=now+300;return 'pan';
 };
}
export function bindViewerNavigation(view,{enabled,panBy,zoomBy,getMode=()=> 'auto',pointers=false,isTouchActive=()=>false}){
 const intent=createWheelIntent(),touches=new Map();let nativeScale=null;
 const point=e=>{const r=view.getBoundingClientRect();return{x:Number.isFinite(e.clientX)?e.clientX-r.left:r.width/2,y:Number.isFinite(e.clientY)?e.clientY-r.top:r.height/2};};
 view.addEventListener('wheel',e=>{
  if(!enabled(e))return;e.preventDefault();if(nativeScale!==null)return;
  const action=intent(e,getMode()),unit=e.deltaMode||0,factor=unit===1?16:unit===2?view.clientHeight:1;
  if(action==='pan')panBy(-(e.deltaX||0)*factor,-(e.deltaY||0)*factor);
  else zoomBy(point(e),Math.exp(Math.max(-2,Math.min(2,-e.deltaY*factor*(action==='pinch'?.01:.0015)))));
 },{passive:false});
 // Safari trackpad gesture events complement Chrome/Firefox's ctrl+wheel pinch.
 view.addEventListener('gesturestart',e=>{if(!enabled(e)||isTouchActive()||touches.size>1)return;e.preventDefault();nativeScale=Number.isFinite(e.scale)&&e.scale>0?e.scale:1;},{passive:false});
 view.addEventListener('gesturechange',e=>{if(nativeScale===null)return;e.preventDefault();if(Number.isFinite(e.scale)&&e.scale>0){zoomBy(point(e),e.scale/nativeScale);nativeScale=e.scale;}},{passive:false});
 view.addEventListener('gestureend',e=>{if(nativeScale!==null)e.preventDefault();nativeScale=null;},{passive:false});
 if(!pointers)return;
 const center=pts=>({x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2});
 const distance=pts=>Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
 view.addEventListener('pointerdown',e=>{if(!enabled(e)||e.button!==0)return;view.setPointerCapture(e.pointerId);touches.set(e.pointerId,point(e));});
 view.addEventListener('pointermove',e=>{
  if(!touches.has(e.pointerId))return;
  const old=[...touches.values()],previous=touches.get(e.pointerId),p=point(e);touches.set(e.pointerId,p);
  if(touches.size===2){const next=[...touches.values()],a=center(old),b=center(next),d=distance(old);if(d>0)zoomBy(a,distance(next)/d);panBy(b.x-a.x,b.y-a.y);}
  else if(touches.size===1)panBy(p.x-previous.x,p.y-previous.y);
 });
 const end=e=>touches.delete(e.pointerId);
 view.addEventListener('pointerup',end);view.addEventListener('pointercancel',end);view.addEventListener('lostpointercapture',end);
}

// Double-click follows the current framing, not an alternating remembered state.
export function doubleClickCamera(camera,image,viewport,point){
 const fit=Math.min(viewport.width/image.width,viewport.height/image.height)*.95;
 const centered={scale:fit,x:(viewport.width-image.width*fit)/2,y:(viewport.height-image.height*fit)/2};
 const fitted=Math.abs(camera.scale-fit)<=Math.max(1e-7,fit*1e-4)&&Math.abs(camera.x-centered.x)<1&&Math.abs(camera.y-centered.y)<1;
 if(!fitted)return centered;
 // Reach native pixels on a large photograph; always magnify an already fitted
 // small image rather than shrinking it back to 100%.
 const scale=Math.max(1,fit*2),ratio=scale/camera.scale;
 return{scale,x:point.x-(point.x-camera.x)*ratio,y:point.y-(point.y-camera.y)*ratio};
}
