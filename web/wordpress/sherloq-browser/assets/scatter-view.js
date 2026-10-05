// Presentation cache only. The native table and its CSV keep every computed row.
export async function readPlotPoints(table,readTable,{valid=()=>true,maxPoints=262144}={}) {
 const stride=Math.max(1,Math.ceil(table.rowCount/maxPoints));
 const values=new Float32Array(Math.ceil(table.rowCount/stride)*6);
 let count=0;
 for(let offset=0;offset<table.rowCount;){
  if(!valid())return null;
  const page=await readTable(table,offset,65536);
  if(!valid())return null;
  if(!page.length)throw Error('La table du nuage est incomplète.');
  for(let row=Math.ceil(offset/stride)*stride;row<offset+page.length;row+=stride){
   values.set(page.data.subarray((row-offset)*6,(row-offset)*6+6),count*6);count++;
  }
  offset+=page.length;
 }
 return {values,count,total:table.rowCount};
}

export function bindPlotCamera(canvas,{camera,style,changed,reset}) {
 const pointers=new Map();
 const stop=e=>{e.preventDefault();e.stopPropagation();};
 canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0&&e.button!==1)return;
  stop(e);canvas.focus();canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,pan:e.shiftKey||e.button===1});
 });
 canvas.addEventListener('pointermove',e=>{
  const previous=pointers.get(e.pointerId);if(!previous)return;stop(e);
  const next={...previous,x:e.clientX,y:e.clientY},dx=next.x-previous.x,dy=next.y-previous.y;
  if(pointers.size===2){
   const other=[...pointers.entries()].find(([id])=>id!==e.pointerId)[1];
   const a=Math.hypot(previous.x-other.x,previous.y-other.y),b=Math.hypot(next.x-other.x,next.y-other.y);
   if(a>0)camera.zoom=Math.max(.1,Math.min(12,camera.zoom*b/a));
   camera.x+=dx/2;camera.y+=dy/2;
  }else if(style().kind==='3d'&&!previous.pan){camera.yaw+=dx*.008;camera.pitch=Math.max(-Math.PI/2,Math.min(Math.PI/2,camera.pitch+dy*.008));}
  else{camera.x+=dx;camera.y+=dy;}
  pointers.set(e.pointerId,next);changed();
 });
 const end=e=>{if(pointers.delete(e.pointerId))e.stopPropagation();};
 for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,end);
 canvas.addEventListener('wheel',e=>{stop(e);camera.zoom=Math.max(.1,Math.min(12,camera.zoom*Math.exp(Math.max(-1,Math.min(1,-e.deltaY*(e.deltaMode===1?16:1)*.002)))));changed();},{passive:false});
 canvas.addEventListener('dblclick',e=>{stop(e);reset();});
 canvas.addEventListener('keydown',e=>{
  if(e.key==='Home'){stop(e);reset();return;}
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){stop(e);camera.yaw+=(e.key==='ArrowLeft'?-.1:e.key==='ArrowRight'?.1:0);camera.pitch=Math.max(-Math.PI/2,Math.min(Math.PI/2,camera.pitch+(e.key==='ArrowUp'?-.1:e.key==='ArrowDown'?.1:0)));changed();}
 });
}

function gpuRenderer(canvas,points) {
 const gl=canvas.getContext('webgl2',{alpha:false,antialias:true,depth:false,preserveDrawingBuffer:false});
 if(!gl)return null;
 const shaders=[];let program,buffer;
 try{
  const shader=(type,source)=>{const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  program=gl.createProgram();
  gl.attachShader(program,shader(gl.VERTEX_SHADER,`#version 300 es
   precision highp float;
   in vec3 rgb; in vec3 hsv;
   uniform ivec3 axes; uniform vec4 camera; uniform vec4 framing; uniform bool volume;
   out vec3 color;
   float component(int axis){return axis<3?rgb[axis]:hsv[axis-3];}
   void main(){
    vec3 p=vec3(component(axes.x),component(axes.y),volume?component(axes.z):.5)-.5;
    if(volume){float x=p.x*cos(camera.x)+p.z*sin(camera.x);float z=p.z*cos(camera.x)-p.x*sin(camera.x);p=vec3(x,p.y*cos(camera.y)-z*sin(camera.y),p.y*sin(camera.y)+z*cos(camera.y));}
    gl_Position=vec4(p.x*framing.x+camera.z,p.y*framing.y+camera.w,0.,1.);
    gl_PointSize=framing.z;color=rgb;
   }`));
  gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`#version 300 es
   precision mediump float;
   in vec3 color; uniform bool colored; uniform float opacity; out vec4 fragment;
   void main(){fragment=vec4(colored?color:vec3(.2,.55,.85),opacity);}
  `));
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,points.values,gl.STATIC_DRAW);
  if(gl.getError()!==gl.NO_ERROR)throw Error('GPU plot allocation failed');
  gl.useProgram(program);
  for(const [name,offset]of [['rgb',0],['hsv',12]]){const a=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,3,gl.FLOAT,false,24,offset);}
  const u=Object.fromEntries(['axes','camera','framing','volume','colored','opacity'].map(k=>[k,gl.getUniformLocation(program,k)]));
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  return {
   draw(style,camera,w,h,dpr,dark){
    gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(...(dark?[.09,.095,.105,1]:[.97,.97,.97,1]));gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);gl.uniform3i(u.axes,style.x,style.y,style.z);gl.uniform1i(u.volume,style.kind==='3d');gl.uniform1i(u.colored,style.colored);gl.uniform1f(u.opacity,style.alpha);
    gl.uniform4f(u.camera,camera.yaw,camera.pitch,camera.x*2/w,-camera.y*2/h);
    const scale=Math.min(w,h)*1.4*camera.zoom;gl.uniform4f(u.framing,scale/w,scale/h,Math.max(1,1.5*dpr),0);
    gl.drawArrays(gl.POINTS,0,points.count);
   },
   dispose(){gl.deleteBuffer(buffer);gl.deleteProgram(program);for(const s of shaders)gl.deleteShader(s);}
  };
 }catch(error){if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);for(const s of shaders)gl.deleteShader(s);return null;}
}

export function createScatterView({document,parent,points,style,columns,language=()=> 'fr',forceCanvas=false}) {
 let p={...style},disposed=false,frame=null;
 const camera={yaw:.5,pitch:.3,zoom:1,x:0,y:0};
 const stage=document.createElement('div');stage.className='scatter-stage';
 let canvas=document.createElement('canvas');canvas.className='scatter-canvas';stage.append(canvas);
 const guides=document.createElement('canvas');guides.className='scatter-guides';guides.setAttribute('aria-hidden','true');stage.append(guides);const axisContext=guides.getContext('2d');
 const label=document.createElement('span');label.className='scatter-label';stage.append(label);
 const help=document.createElement('p');help.className='scatter-help';
 const reset=document.createElement('button');reset.type='button';reset.className='scatter-reset';stage.append(reset);
 parent.replaceChildren(stage,help);
 let renderer=forceCanvas?null:gpuRenderer(canvas,points);
 if(!renderer){canvas.remove();canvas=document.createElement('canvas');canvas.className='scatter-canvas';stage.prepend(canvas);}
 const context=renderer?null:canvas.getContext('2d');
 canvas.tabIndex=0;canvas.setAttribute('aria-label','Nuage RGB/HSV interactif');
 const axes=point=>{let x=point[p.x]-.5,y=point[p.y]-.5,z=p.kind==='3d'?point[p.z]-.5:0;if(p.kind==='3d'){const xx=x*Math.cos(camera.yaw)+z*Math.sin(camera.yaw);z=z*Math.cos(camera.yaw)-x*Math.sin(camera.yaw);x=xx;y=y*Math.cos(camera.pitch)-z*Math.sin(camera.pitch);}return [x,y];};
 function draw(){
  frame=null;if(disposed)return;
  const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;
  const dpr=Math.min(globalThis.devicePixelRatio||1,2),dark=(document.documentElement.dataset.theme||'dark')==='dark';
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  if(renderer)renderer.draw(p,camera,w,h,dpr,dark);
  else{
   context.setTransform(dpr,0,0,dpr,0,0);context.fillStyle=dark?'#17181a':'#f7f7f7';context.fillRect(0,0,w,h);context.globalAlpha=p.alpha;
   const size=Math.min(w,h)*.7*camera.zoom;
   for(let i=0;i<points.count;i++){const row=points.values.subarray(i*6,i*6+6),[x,y]=axes(row);context.fillStyle=p.colored?`rgb(${row[0]*255},${row[1]*255},${row[2]*255})`:'#338cd9';context.fillRect(w/2+camera.x+x*size,h/2+camera.y-y*size,1.5,1.5);}context.globalAlpha=1;
  }
  if(guides.width!==canvas.width||guides.height!==canvas.height){guides.width=canvas.width;guides.height=canvas.height;}
  axisContext.setTransform(dpr,0,0,dpr,0,0);axisContext.clearRect(0,0,w,h);axisContext.lineWidth=1;axisContext.font='11px sans-serif';
  const project=(x,y,z)=>{x-=.5;y-=.5;z-=.5;if(p.kind==='3d'){const xx=x*Math.cos(camera.yaw)+z*Math.sin(camera.yaw);z=z*Math.cos(camera.yaw)-x*Math.sin(camera.yaw);x=xx;y=y*Math.cos(camera.pitch)-z*Math.sin(camera.pitch);}const size=Math.min(w,h)*.7*camera.zoom;return [w/2+camera.x+x*size,h/2+camera.y-y*size];};
  const origin=project(0,0,0),ends=[project(1,0,0),project(0,1,0),...(p.kind==='3d'?[project(0,0,1)]:[])];
  ends.forEach((end,i)=>{axisContext.strokeStyle=['#ce7777','#78b58a','#81a9dc'][i];axisContext.fillStyle=axisContext.strokeStyle;axisContext.beginPath();axisContext.moveTo(...origin);axisContext.lineTo(...end);axisContext.stroke();axisContext.fillText(columns[[p.x,p.y,p.z][i]]+' 1',end[0]+4,end[1]-4);});
  axisContext.fillStyle=dark?'#aeb2b9':'#59606a';axisContext.fillText('0',origin[0]-10,origin[1]+12);
 }
 function requestDraw(){if(!disposed&&frame===null)frame=requestAnimationFrame(draw);}
 function resetCamera(){Object.assign(camera,{yaw:.5,pitch:.3,zoom:1,x:0,y:0});requestDraw();}
 function translate(){const fr=language()==='fr';label.textContent=[p.x,p.y,...(p.kind==='3d'?[p.z]:[])].map(i=>columns[i]).join(' × ');help.textContent=(fr?(p.kind==='3d'?'Glisser : tourner · Maj + glisser : déplacer':'Glisser : déplacer')+' · Molette : zoom · Double-clic : ajuster':(p.kind==='3d'?'Drag: rotate · Shift + drag: pan':'Drag: pan')+' · Wheel: zoom · Double-click: fit')+(points.count<points.total?(fr?' · Affichage : ':' · Display: ')+points.count.toLocaleString()+' / '+points.total.toLocaleString()+(fr?' points ; CSV complet disponible.':' points; full CSV available.'):'');reset.textContent=fr?'Ajuster':'Fit';}
 reset.onclick=resetCamera;bindPlotCamera(canvas,{camera,style:()=>p,changed:requestDraw,reset:resetCamera});
 const resize=new ResizeObserver(requestDraw);resize.observe(stage);
 // Restoring a context cannot restore its old resources. Fall back to the same
 // retained points without an engine call or an automatic rerun.
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();if(disposed)return;renderer?.dispose();renderer=null;replacement();});
 function replacement(){const next=createScatterView({document,parent,points,style:p,columns,language,forceCanvas:true});disposed=true;resize.disconnect();if(frame!==null)cancelAnimationFrame(frame);successor=next;}
 let successor=null;
 translate();requestDraw();
 return {setStyle(value){if(successor)return successor.setStyle(value);p={...p,...value};translate();requestDraw();},redraw(){if(successor)return successor.redraw();translate();requestDraw();},fit(){if(successor)return successor.fit();resetCamera();},zoomBy(factor){if(successor)return successor.zoomBy(factor);camera.zoom=Math.max(.1,Math.min(12,camera.zoom*factor));requestDraw();},dispose(){if(successor)return successor.dispose();disposed=true;resize.disconnect();if(frame!==null)cancelAnimationFrame(frame);renderer?.dispose();}};
}
