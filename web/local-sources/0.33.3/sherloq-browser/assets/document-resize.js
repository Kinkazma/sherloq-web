// Geometry belongs to the view. Resizing never reloads, cancels or runs a tool.
export function bindDocumentResize(handle,element,{layout,desk,changed=()=>{}}){
 let drag=null;
 function size(width,height){
  const mode=layout();if(mode==='tabs')return;
  const bounds=desk().getBoundingClientRect(),rect=element.getBoundingClientRect();
  const maxWidth=mode==='cascade'?Math.max(240,bounds.right-rect.left):bounds.width;
  const w=Math.max(Math.min(300,maxWidth),Math.min(maxWidth,width)),h=Math.max(220,height);
  element.style.setProperty(mode==='tile'?'--tile-width':'--window-width',w+'px');
  element.style.setProperty(mode==='tile'?'--tile-height':'--window-height',h+'px');
  if(mode==='tile')element.style.setProperty('--tile-grow','0');
  changed();
 }
 handle.addEventListener('pointerdown',e=>{if(e.button!==0||layout()==='tabs')return;e.preventDefault();e.stopPropagation();const r=element.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,w:r.width,h:r.height};handle.setPointerCapture(e.pointerId);});
 handle.addEventListener('pointermove',e=>{if(!drag)return;e.preventDefault();e.stopPropagation();size(drag.w+e.clientX-drag.x,drag.h+e.clientY-drag.y);});
 const end=()=>drag=null;for(const name of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(name,end);
 handle.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)||layout()==='tabs')return;e.preventDefault();e.stopPropagation();const r=element.getBoundingClientRect(),step=e.shiftKey?50:10;size(r.width+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0),r.height+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0));});
}
