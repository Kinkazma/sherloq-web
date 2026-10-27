import {bindViewerNavigation} from './vendor/viewer-input.js';

export function fitViewerCamera(image,viewport){
 const scale=Math.min(viewport.width/image.width,viewport.height/image.height,1);
 return {x:(viewport.x||0)+(viewport.width-image.width*scale)/2,y:(viewport.y||0)+(viewport.height-image.height*scale)/2,scale};
}
export function zoomViewerCamera(camera,point,factor,{min=.0001,max=64}={}){
 const scale=Math.min(max,Math.max(min,camera.scale*factor)),ratio=scale/camera.scale;
 return {x:point.x-(point.x-camera.x)*ratio,y:point.y-(point.y-camera.y)*ratio,scale};
}

// The maintained Web input interpreter handles mouse wheels, trackpad motion,
// pinch and pointer gestures. This adapter owns listener lifetime and refitting.
export function mountViewerNavigation(view,{enabled,canInteract=()=>true,getCamera,setCamera,getFit,getMode=()=> 'auto',onChange=()=>{}}){
 const listeners=[],pointers=new Set();let disposed=false;
 const allowed=event=>!disposed&&enabled()&&canInteract(event);
 const listen=(name,handler,options)=>{view.addEventListener(name,handler,options);listeners.push(()=>view.removeEventListener(name,handler,options));};
 const target={getBoundingClientRect:()=>view.getBoundingClientRect(),get clientHeight(){return view.clientHeight;},setPointerCapture:id=>{try{view.setPointerCapture(id);}catch{}},addEventListener:listen};
 const change=camera=>{if(!disposed&&enabled()){setCamera(camera);onChange();}};
 bindViewerNavigation(target,{enabled:allowed,getMode,pointers:true,
  isTouchActive:()=>pointers.size>1,
  panBy:(x,y)=>{const camera=getCamera();change({...camera,x:camera.x+x,y:camera.y+y});},
  zoomBy:(point,factor)=>{const fit=getFit();if(fit)change(zoomViewerCamera(getCamera(),point,factor,{min:Math.max(.0001,fit.scale/32),max:Math.max(64,fit.scale)}));}
 });
 listen('pointerdown',event=>{if(allowed(event)&&event.button===0)pointers.add(event.pointerId);});
 const end=event=>pointers.delete(event.pointerId);for(const name of ['pointerup','pointercancel','lostpointercapture'])listen(name,end);
 listen('dblclick',event=>{if(event.button!==0||!allowed(event))return;event.preventDefault();event.stopImmediatePropagation();api.fit();},true);
 const api={
  fit(){const camera=getFit();if(camera&&!disposed){setCamera(camera,{fitted:true});onChange();}},
  release(){for(const id of pointers){view.dispatchEvent(new PointerEvent('pointercancel',{pointerId:id}));try{view.releasePointerCapture(id);}catch{}}pointers.clear();view.dispatchEvent(new Event('gestureend',{cancelable:true}));},
  dispose(){if(disposed)return;api.release();disposed=true;for(const off of listeners.splice(0))off();}
 };
 return api;
}
