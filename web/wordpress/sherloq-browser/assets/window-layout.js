import { bindViewerNavigation, doubleClickCamera } from './viewer-input.js';
// Two views share the same decoded surfaces and engine; layouts never rerun analysis.
export function createWindowLayout({getSource,onResize,getNavigationMode,document=globalThis.document}){
 const $=id=>document.getElementById(id),desk=$('window-desk'),windowIds=['original-window','analysis-window'];
 const view=$('original-viewport'),canvas=$('original-canvas'),ctx=canvas.getContext('2d');
 let mode='tabs',surface=null,scale=1,x=0,y=0;
 function fit(){const s=getSource();if(!s||!view.clientWidth)return;scale=Math.min(view.clientWidth/s.width,view.clientHeight/s.height)*.95;x=(view.clientWidth-s.width*scale)/2;y=(view.clientHeight-s.height*scale)/2;}
 function draw(){if(mode==='tabs')return;const s=getSource(),d=Math.min(devicePixelRatio||1,2);if(s!==surface){const changedSize=!surface||!s||surface.width!==s.width||surface.height!==s.height;surface=s;if(changedSize)fit();}const bounds={left:-x/scale,top:-y/scale,right:(view.clientWidth-x)/scale,bottom:(view.clientHeight-y)/scale};if(s?.prepare&&!s.prepare(bounds,scale*d))return;const width=Math.round(view.clientWidth*d),height=Math.round(view.clientHeight*d);if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,view.clientWidth,view.clientHeight);if(s){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.imageSmoothingEnabled=scale<3;s.draw(ctx,{left:-x/scale,top:-y/scale,right:(view.clientWidth-x)/scale,bottom:(view.clientHeight-y)/scale},scale*d);ctx.restore();}}
 function focus(id){for(const name of windowIds)$(name).classList.toggle('front-window',name===id);}
 function set(next){mode=next;desk.dataset.layout=mode;for(const id of windowIds){$(id).style.removeProperty('left');$(id).style.removeProperty('top');}for(const m of ['tabs','tile','cascade'])$('layout-'+m).setAttribute('aria-pressed',String(m===mode));$('layer').disabled=mode!=='tabs';focus('analysis-window');requestAnimationFrame(()=>{fit();draw();onResize();});}
 for(const id of windowIds){const win=$(id),title=win.querySelector('.window-title');let drag=null;
  win.addEventListener('pointerdown',()=>focus(id));
  title.addEventListener('pointerdown',e=>{focus(id);if(e.button!==0||mode!=='cascade')return;drag={dx:e.clientX-win.offsetLeft,dy:e.clientY-win.offsetTop};title.setPointerCapture(e.pointerId);});
  title.addEventListener('pointermove',e=>{if(!drag)return;win.style.left=Math.max(0,Math.min(desk.clientWidth-win.offsetWidth,e.clientX-drag.dx))+'px';win.style.top=Math.max(0,Math.min(desk.clientHeight-win.offsetHeight,e.clientY-drag.dy))+'px';});
  title.addEventListener('pointerup',()=>drag=null);title.addEventListener('pointercancel',()=>drag=null);
 }
 bindViewerNavigation(view,{enabled:()=>!!getSource()&&mode!=='tabs',getMode:getNavigationMode,pointers:true,
  panBy:(dx,dy)=>{x+=dx;y+=dy;draw();},
  zoomBy:(p,factor)=>{const next=Math.max(.02,Math.min(32,scale*factor));x=p.x-(p.x-x)*next/scale;y=p.y-(p.y-y)*next/scale;scale=next;draw();}
 });
 view.addEventListener('dblclick',e=>{if(e.button!==0||!getSource()||mode==='tabs')return;e.preventDefault();const r=view.getBoundingClientRect(),c=doubleClickCamera({scale,x,y},getSource(),{width:view.clientWidth,height:view.clientHeight},{x:e.clientX-r.left,y:e.clientY-r.top});scale=c.scale;x=c.x;y=c.y;draw();});
 const observer=new ResizeObserver(()=>{fit();draw();});observer.observe(view);
 return{set,draw,focus,dispose(){observer.disconnect();},fit(){fit();draw();},get mode(){return mode;}};
}
