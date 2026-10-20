// Orthographic presentation geometry only. No scientific rows are changed.
export const PLOT_FACES=Object.freeze([
 {id:'z+',axis:2,sign:1,yaw:0,pitch:0,corners:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]]},
 {id:'z-',axis:2,sign:-1,yaw:Math.PI,pitch:0,corners:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]]},
 {id:'x+',axis:0,sign:1,yaw:-Math.PI/2,pitch:0,corners:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]]},
 {id:'x-',axis:0,sign:-1,yaw:Math.PI/2,pitch:0,corners:[[0,0,0],[0,0,1],[0,1,1],[0,1,0]]},
 {id:'y+',axis:1,sign:1,yaw:0,pitch:Math.PI/2,corners:[[0,1,0],[0,1,1],[1,1,1],[1,1,0]]},
 {id:'y-',axis:1,sign:-1,yaw:0,pitch:-Math.PI/2,corners:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]]}
].map(face=>Object.freeze({...face,corners:Object.freeze(face.corners.map(point=>Object.freeze(point)))})));
export function plotViewDirection(camera){return[-Math.cos(camera.pitch)*Math.sin(camera.yaw),Math.sin(camera.pitch),Math.cos(camera.pitch)*Math.cos(camera.yaw)];}
export function nearestPlotFace(camera){const direction=plotViewDirection(camera);return PLOT_FACES.reduce((best,face)=>direction[face.axis]*face.sign>direction[best.axis]*best.sign+1e-12?face:best,PLOT_FACES[0]).id;}
export function plotFaceCamera(id,camera){const face=PLOT_FACES.find(face=>face.id===id);if(!face)throw new TypeError('Unknown plot face.');return{...camera,yaw:face.yaw,pitch:face.pitch};}
export function projectOrientationPoint(point,camera,size=120){const[x,y,z]=point.map(value=>value-.5),xx=x*Math.cos(camera.yaw)+z*Math.sin(camera.yaw),zz=z*Math.cos(camera.yaw)-x*Math.sin(camera.yaw),yy=y*Math.cos(camera.pitch)-zz*Math.sin(camera.pitch);return{x:size/2+xx*size*.52,y:size/2-yy*size*.52,depth:y*Math.sin(camera.pitch)+zz*Math.cos(camera.pitch)};}

// The same retained display rows feed the miniature; bound work independently
// of native table size, zoom and pan. It needs one small2D canvas, never a GPU.
export function createOrientationCube({document,points,columns,style,camera,onFace,onRotate,language=()=> 'fr'}){
 const node=(tag,cls)=>{const el=document.createElement(tag);el.className=cls;return el;};
 const element=node('div','scatter-orientation'),owner=element.ownerDocument??document,svgNode=tag=>owner.createElementNS('http://www.w3.org/2000/svg',tag),canvas=node('canvas','scatter-cube-cloud'),svg=svgNode('svg'),faces=svgNode('g'),choices=node('details','scatter-cube-choices'),summary=node('summary','scatter-cube-summary'),menu=node('div','scatter-cube-menu');
 element.setAttribute('role','group');canvas.setAttribute('aria-hidden','true');svg.classList.add('scatter-cube');svg.setAttribute('viewBox','0 0 120 120');svg.setAttribute('aria-label','');svg.append(faces);choices.append(summary,menu);element.append(canvas,svg,choices);
 const context=canvas.getContext('2d'),rows=[],listeners=[],polygons=new Map(),labels=new Map(),buttons=new Map();let disposed=false,drag=null,suppressClick=false,faceOrder='';
 const stride=Math.max(1,Math.ceil(points.count/768));for(let index=0;index<points.count;index+=stride)rows.push(points.values.subarray(index*6,index*6+6));
 const listen=(el,type,fn,options)=>{el.addEventListener(type,fn,options);listeners.push(()=>el.removeEventListener(type,fn,options));},stop=e=>{e.preventDefault();e.stopPropagation();};
 function releasePress(){const pressed=drag;drag=null;if(pressed)try{if(svg.hasPointerCapture?.(pressed.id)!==false)svg.releasePointerCapture?.(pressed.id);}catch{}return pressed;}
 function choose(id){if(disposed)return;releasePress();choices.open=false;onFace(id);}
 for(const face of PLOT_FACES){const polygon=svgNode('polygon'),label=svgNode('text'),button=node('button','scatter-cube-choice');polygon.classList.add('scatter-cube-face');polygon.dataset.cubeFace=face.id;polygon.setAttribute('role','button');polygon.setAttribute('tabindex','-1');label.classList.add('scatter-cube-label');label.setAttribute('aria-hidden','true');button.type='button';button.dataset.cubeFace=face.id;faces.append(polygon,label);menu.append(button);polygons.set(face.id,polygon);labels.set(face.id,label);buttons.set(face.id,button);
  listen(polygon,'click',e=>{stop(e);if(suppressClick){suppressClick=false;return;}if(drag||e.detail>0)return;choose(face.id);});listen(polygon,'keydown',e=>{if(e.key==='Enter'||e.key===' '){stop(e);suppressClick=false;choose(face.id);}});listen(button,'click',e=>{stop(e);choose(face.id);});
 }
 // Expose the other faces without relying on a zero-area or rear polygon.
 listen(choices,'pointerdown',e=>e.stopPropagation());listen(choices,'dblclick',e=>e.stopPropagation());listen(choices,'keydown',e=>{e.stopPropagation();if(e.key==='Escape'){choices.open=false;summary.focus();}});
 // Own pointer activation through release: a draw may reorder SVG nodes while
 // the button is held, so the browser's later click target is not reliable.
 const faceAt=e=>{for(let target=e.target;target&&target!==svg;target=target.parentNode){const id=target.dataset?.cubeFace;if(polygons.get(id)===target)return id;}return null;};
 listen(svg,'pointerdown',e=>{if(e.button!==0||e.isPrimary===false||drag)return;stop(e);suppressClick=false;drag={id:e.pointerId,face:faceAt(e),x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};try{svg.setPointerCapture?.(e.pointerId);}catch{}onRotate(0,0);});
 const win=owner.defaultView??globalThis.window;
 const outsideViewport=e=>{const width=win?.innerWidth||owner.documentElement?.clientWidth,height=win?.innerHeight||owner.documentElement?.clientHeight;return Number.isFinite(e.clientX)&&width>0&&(e.clientX<0||e.clientX>=width)||Number.isFinite(e.clientY)&&height>0&&(e.clientY<0||e.clientY>=height);};
 const cancel=()=>{if(releasePress())suppressClick=true;};
 listen(win,'pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;if(e.buttons===0||outsideViewport(e)){cancel();return;}stop(e);const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>4)drag.moved=true;if(drag.moved&&(dx||dy))onRotate(dx,dy);},true);
 const end=e=>{if(!drag||e.pointerId!==drag.id)return;const pressed=releasePress();suppressClick=true;const distance=Math.hypot(e.clientX-pressed.startX,e.clientY-pressed.startY);if(!outsideViewport(e)&&!pressed.moved&&!(distance>4)&&pressed.face){stop(e);choose(pressed.face);}};
 listen(win,'pointerup',end,true);listen(win,'pointercancel',e=>{if(drag&&e.pointerId===drag.id)cancel();},true);listen(svg,'lostpointercapture',e=>{if(drag&&e.pointerId===drag.id)cancel();});
 // A null related target can also occur across a closed shadow boundary. Only
 // a verified viewport exit cancels; leaving the little SVG remains a drag.
 listen(win,'pointerout',e=>{if(drag&&e.pointerId===drag.id&&e.relatedTarget==null&&outsideViewport(e))cancel();},true);
 listen(win,'blur',cancel);listen(owner,'visibilitychange',()=>{if(owner.hidden)cancel();});listen(owner,'pointerdown',e=>{if(choices.open&&!(e.composedPath?.().includes(choices)??choices.contains(e.target)))choices.open=false;});listen(svg,'dblclick',e=>stop(e));
 function draw(){if(disposed)return;const p=style(),fr=language()==='fr';element.hidden=p.kind!=='3d';if(element.hidden){choices.open=false;return;}
  element.setAttribute('aria-label',fr?'Cube d’orientation':'Orientation cube');summary.textContent='⌄';summary.setAttribute('aria-label',fr?'Choisir une face':'Choose a face');summary.title=fr?'Choisir une face':'Choose a face';
  const size=120,dpr=Math.min(globalThis.devicePixelRatio||1,2);if(canvas.width!==size*dpr||canvas.height!==size*dpr){canvas.width=size*dpr;canvas.height=size*dpr;}context.setTransform(dpr,0,0,dpr,0,0);context.clearRect(0,0,size,size);context.globalAlpha=Math.max(0,Math.min(1,p.alpha??1))*.48;
  for(const row of rows){const q=projectOrientationPoint([row[p.x],row[p.y],row[p.z]],camera,size);context.fillStyle=p.colored?`rgb(${row[0]*255},${row[1]*255},${row[2]*255})`:'#338cd9';context.fillRect(q.x,q.y,1.1,1.1);}context.globalAlpha=1;
  const direction=plotViewDirection(camera),names=[columns[p.x],columns[p.y],columns[p.z]],ordered=PLOT_FACES.map(face=>({face,front:direction[face.axis]*face.sign>1e-7,depth:direction[face.axis]*face.sign})).sort((a,b)=>a.depth-b.depth);
  for(const{face,front}of ordered){const polygon=polygons.get(face.id),label=labels.get(face.id),projected=face.corners.map(point=>projectOrientationPoint(point,camera,size)),center=projected.reduce((out,point)=>[out[0]+point.x/4,out[1]+point.y/4],[0,0]),name=names[face.axis]+' '+(face.sign>0?'+':'−'),description=(fr?'Vue selon ':'View along ')+name+' ('+face.id.toUpperCase()+')';polygon.setAttribute('points',projected.map(point=>point.x+','+point.y).join(' '));polygon.dataset.facing=String(front);polygon.setAttribute('tabindex',front?'0':'-1');polygon.setAttribute('aria-hidden',String(!front));polygon.setAttribute('aria-label',description);polygon.style.setProperty('--cube-axis',['#ce7777','#78b58a','#81a9dc'][face.axis]);polygon.setAttribute('aria-pressed',String(front&&Math.abs(direction[face.axis])>1-1e-10));label.textContent=face.id.toUpperCase();label.setAttribute('x',String(center[0]));label.setAttribute('y',String(center[1]));label.hidden=!front;label.setAttribute('visibility',front?'visible':'hidden');buttons.get(face.id).textContent=name;buttons.get(face.id).setAttribute('aria-label',description);}
  const order=ordered.map(({face})=>face.id).join(',');if(order!==faceOrder){for(const{face}of ordered)faces.append(polygons.get(face.id),labels.get(face.id));faceOrder=order;}
 }
 return{element,draw,get sampleCount(){return rows.length;},dispose(){if(disposed)return;disposed=true;releasePress();for(const off of listeners.splice(0))off();element.remove();}};
}
