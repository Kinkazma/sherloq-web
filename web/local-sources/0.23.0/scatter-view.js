import {bindViewerNavigation} from './viewer-input.js?v=0.23.0';

const MIN_ZOOM=.1,MAX_ZOOM=12;
export const PLOT_INTRO_CAMERA=Object.freeze({yaw:-Math.atan(Math.sin(Math.PI/15)),pitch:Math.PI/15});
export const PLOT_INTRO_DURATION=450;
// Presentation lifetime only. A workspace shares this owner across native and
// provisional viewers; it never becomes part of the scientific table/settings.
export function createPlotIntroState(){return{armed:true,interacted:false,cancel:null};}
export function rearmPlotIntro(state){state.cancel?.();state.armed=true;state.interacted=false;}

function cssViewport(element){const rect=element.getBoundingClientRect?.();return {width:Number.isFinite(rect?.width)&&rect.width>0?rect.width:element.clientWidth,height:Number.isFinite(rect?.height)&&rect.height>0?rect.height:element.clientHeight};}
export function createPlotCamera(initial={}){
 const value=(key,fallback)=>Number.isFinite(initial?.[key])?initial[key]:fallback;
 return {yaw:value('yaw',0),pitch:Math.max(-Math.PI/2,Math.min(Math.PI/2,value('pitch',0))),zoom:Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,value('zoom',1))),x:value('x',0),y:value('y',0)};
}
function projectCoordinates(x,y,z,kind,camera,{width,height}){
 x-=.5;y-=.5;z-=.5;
 if(kind==='3d'){const xx=x*Math.cos(camera.yaw)+z*Math.sin(camera.yaw);z=z*Math.cos(camera.yaw)-x*Math.sin(camera.yaw);x=xx;y=y*Math.cos(camera.pitch)-z*Math.sin(camera.pitch);}
 const size=Math.min(width,height)*.7*camera.zoom;return [width/2+camera.x+x*size,height/2+camera.y-y*size];
}
// CSS coordinates match the orthographic GPU projection, independently of DPR.
export function projectPlotPoint(point,style,camera,viewport){return projectCoordinates(point[style.x],point[style.y],style.kind==='3d'?point[style.z]:.5,style.kind,camera,viewport);}
export function zoomPlotCamera(camera,{width,height},point,factor){
 if(!Number.isFinite(factor)||factor<=0||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||!Number.isFinite(camera?.zoom)||camera.zoom<=0||!Number.isFinite(camera.x)||!Number.isFinite(camera.y))return false;
 const before=camera.zoom,zoom=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,before*factor));if(zoom===before)return false;
 const ratio=zoom/before,x=(Number.isFinite(point?.x)?point.x:width/2)-width/2,y=(Number.isFinite(point?.y)?point.y:height/2)-height/2;
 camera.x=ratio*camera.x+(1-ratio)*x;camera.y=ratio*camera.y+(1-ratio)*y;camera.zoom=zoom;return true;
}

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

export function bindPlotCamera(canvas,{camera,style,changed,reset,interacting=()=>{},getNavigationMode=()=> 'auto'}) {
 const pointers=new Map(),listeners=[];let disposed=false,nativeGestureEnd=null;
 const listen=(target,type,handler,options)=>{if(!target?.addEventListener)return;target.addEventListener(type,handler,options);listeners.push(()=>target.removeEventListener?.(type,handler,options));};
 const stop=e=>{e.preventDefault();e.stopPropagation();};
 const viewport=()=>cssViewport(canvas);
 const point=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
 const panBy=(dx,dy)=>{if(!Number.isFinite(dx)||!Number.isFinite(dy)||!dx&&!dy)return;camera.x+=dx;camera.y+=dy;changed();};
 // The adapter tracks the shared helper's listeners for local cleanup. Events
 // stop here so the enclosing image viewport cannot navigate a second time.
 const navigation={getBoundingClientRect:()=>canvas.getBoundingClientRect(),get clientHeight(){return canvas.clientHeight||viewport().height;},addEventListener(type,handler,options){if(type==='gestureend')nativeGestureEnd=handler;listen(canvas,type,e=>{if(disposed)return;if(type==='wheel'||type==='gesturestart'||type==='gesturechange')interacting();e.stopPropagation();handler(e);},options);}};
 bindViewerNavigation(navigation,{enabled:()=>!disposed,getMode:getNavigationMode,panBy,zoomBy:(anchor,factor)=>{if(zoomPlotCamera(camera,viewport(),anchor,factor))changed();},isTouchActive:()=>pointers.size>1});
 listen(canvas,'pointerdown',e=>{
  if(disposed||e.button!==0&&e.button!==1)return;
  interacting();stop(e);canvas.focus();canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId,{...point(e),pan:e.shiftKey||e.button===1});
 });
 listen(canvas,'pointermove',e=>{
  const previous=pointers.get(e.pointerId);if(!previous)return;stop(e);
  const old=[...pointers.values()],next={...previous,...point(e)},dx=next.x-previous.x,dy=next.y-previous.y;pointers.set(e.pointerId,next);
  if(pointers.size===2){
   const updated=[...pointers.values()],center=pts=>({x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2}),distance=pts=>Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),a=center(old),b=center(updated),d=distance(old);
   if(d>0)zoomPlotCamera(camera,viewport(),a,distance(updated)/d);camera.x+=b.x-a.x;camera.y+=b.y-a.y;
  }else if(style().kind==='3d'&&!previous.pan){camera.yaw+=dx*.008;camera.pitch=Math.max(-Math.PI/2,Math.min(Math.PI/2,camera.pitch+dy*.008));}
  else{camera.x+=dx;camera.y+=dy;}
  changed();
 });
 const end=e=>{if(pointers.delete(e.pointerId))e.stopPropagation();};
 for(const name of ['pointerup','pointercancel','lostpointercapture'])listen(canvas,name,end);
 listen(canvas,'dblclick',e=>{stop(e);reset();});
 listen(canvas,'keydown',e=>{
  if(e.key==='Home'){stop(e);reset();return;}
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){interacting();stop(e);if(style().kind!=='3d'||e.shiftKey){panBy(e.key==='ArrowLeft'?-20:e.key==='ArrowRight'?20:0,e.key==='ArrowUp'?-20:e.key==='ArrowDown'?20:0);return;}camera.yaw+=(e.key==='ArrowLeft'?-.1:e.key==='ArrowRight'?.1:0);camera.pitch=Math.max(-Math.PI/2,Math.min(Math.PI/2,camera.pitch+(e.key==='ArrowUp'?-.1:e.key==='ArrowDown'?.1:0)));changed();}
 });
 const endSession=()=>{pointers.clear();nativeGestureEnd?.({preventDefault(){}});};
 listen(canvas,'blur',endSession);listen(canvas.ownerDocument?.defaultView,'blur',endSession);listen(canvas.ownerDocument,'visibilitychange',()=>{if(canvas.ownerDocument.hidden)endSession();});
 return {dispose(){if(disposed)return;disposed=true;endSession();for(const remove of listeners.splice(0))remove();}};
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

export function createScatterView({document,parent,points,style,columns,language=()=> 'fr',getNavigationMode=()=> 'auto',forceCanvas=false,initialCamera,cameraState,introState=createPlotIntroState(),allowIntro=true,reducedMotion}) {
 let p={...style},disposed=false,frame=null,introFrame=null,introStarted=null;
 const camera=cameraState??createPlotCamera(initialCamera),motionWindow=document.defaultView??globalThis.window;
 const prefersReducedMotion=()=>typeof reducedMotion==='function'?reducedMotion():reducedMotion??motionWindow?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches??false;
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
 function draw(){
  frame=null;if(disposed)return;
  const {width:w,height:h}=cssViewport(stage);if(!w||!h)return;
  const dpr=Math.min(globalThis.devicePixelRatio||1,2),dark=(document.documentElement.dataset.theme||'dark')==='dark';
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  if(renderer)renderer.draw(p,camera,w,h,dpr,dark);
  else{
   context.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);context.fillStyle=dark?'#17181a':'#f7f7f7';context.fillRect(0,0,w,h);context.globalAlpha=p.alpha;
   const viewport={width:w,height:h};for(let i=0;i<points.count;i++){const row=points.values.subarray(i*6,i*6+6),[x,y]=projectPlotPoint(row,p,camera,viewport);context.fillStyle=p.colored?`rgb(${row[0]*255},${row[1]*255},${row[2]*255})`:'#338cd9';context.fillRect(x,y,1.5,1.5);}context.globalAlpha=1;
  }
  if(guides.width!==canvas.width||guides.height!==canvas.height){guides.width=canvas.width;guides.height=canvas.height;}
  axisContext.setTransform(guides.width/w,0,0,guides.height/h,0,0);axisContext.clearRect(0,0,w,h);axisContext.lineWidth=1;axisContext.font='11px sans-serif';
  const project=(x,y,z)=>projectCoordinates(x,y,z,p.kind,camera,{width:w,height:h});
  const origin=project(0,0,0),ends=[project(1,0,0),project(0,1,0),...(p.kind==='3d'?[project(0,0,1)]:[])];
  ends.forEach((end,i)=>{if(Math.hypot(end[0]-origin[0],end[1]-origin[1])<2)return;axisContext.strokeStyle=['#ce7777','#78b58a','#81a9dc'][i];axisContext.fillStyle=axisContext.strokeStyle;axisContext.beginPath();axisContext.moveTo(...origin);axisContext.lineTo(...end);axisContext.stroke();axisContext.fillText(columns[[p.x,p.y,p.z][i]]+' 1',end[0]+4,end[1]-4);});
  axisContext.fillStyle=dark?'#aeb2b9':'#59606a';axisContext.fillText('0',origin[0]-10,origin[1]+12);
 }
 function requestDraw(){if(!disposed&&frame===null)frame=requestAnimationFrame(draw);}
 function stopIntro(){if(introFrame!==null)cancelAnimationFrame(introFrame);introFrame=null;introStarted=null;if(introState.cancel===stopIntro)introState.cancel=null;}
 function consumeIntro(){introState.cancel?.();introState.armed=false;introState.interacted=true;}
 function startIntro(){
  if(disposed||!allowIntro||p.kind!=='3d'||!introState.armed||introState.interacted||initialCamera&&!cameraState)return;
  introState.cancel?.();introState.armed=false;introState.cancel=stopIntro;camera.yaw=camera.pitch=0;
  if(prefersReducedMotion()){Object.assign(camera,PLOT_INTRO_CAMERA);stopIntro();requestDraw();return;}
  const tick=time=>{
   introFrame=null;if(disposed||introState.cancel!==stopIntro||p.kind!=='3d')return;time=Number.isFinite(time)?time:performance.now();introStarted??=time;const fraction=Math.min(1,Math.max(0,(time-introStarted)/PLOT_INTRO_DURATION)),progress=fraction*fraction*(3-2*fraction);
   camera.yaw=progress?PLOT_INTRO_CAMERA.yaw*progress:0;camera.pitch=PLOT_INTRO_CAMERA.pitch*progress;requestDraw();
   if(fraction<1)introFrame=requestAnimationFrame(tick);else stopIntro();
  };
  introFrame=requestAnimationFrame(tick);
 }
 function resetCamera(){consumeIntro();Object.assign(camera,createPlotCamera());requestDraw();}
 function translate(){const fr=language()==='fr';label.textContent=[p.x,p.y,...(p.kind==='3d'?[p.z]:[])].map(i=>columns[i]).join(' × ');help.textContent=(fr?(p.kind==='3d'?'Glisser : tourner · Maj + glisser : déplacer':'Glisser : déplacer')+' · Trackpad : déplacer · Molette / pincement : zoom · Double-clic : ajuster':(p.kind==='3d'?'Drag: rotate · Shift + drag: pan':'Drag: pan')+' · Trackpad: pan · Wheel / pinch: zoom · Double-click: fit')+(points.count<points.total?(fr?' · Affichage : ':' · Display: ')+points.count.toLocaleString()+' / '+points.total.toLocaleString()+(fr?' points ; CSV complet disponible.':' points; full CSV available.'):'');reset.textContent=fr?'Ajuster':'Fit';}
 reset.onclick=resetCamera;const navigation=bindPlotCamera(canvas,{camera,style:()=>p,changed:requestDraw,reset:resetCamera,interacting:consumeIntro,getNavigationMode});
 const resize=new ResizeObserver(requestDraw);resize.observe(stage);
 // Restoring a context cannot restore its old resources. Fall back to the same
 // retained points without an engine call or an automatic rerun.
 const contextLost=e=>{e.preventDefault();if(disposed)return;renderer?.dispose();renderer=null;replacement();};canvas.addEventListener('webglcontextlost',contextLost);
 function releaseView(){stopIntro();disposed=true;navigation.dispose();resize.disconnect();if(frame!==null)cancelAnimationFrame(frame);canvas.removeEventListener('webglcontextlost',contextLost);reset.onclick=null;}
 function replacement(){const saved=createPlotCamera(camera);releaseView();successor=createScatterView({document,parent,points,style:p,columns,language,getNavigationMode,forceCanvas:true,initialCamera:saved,cameraState:camera,introState,allowIntro:false,reducedMotion});}
 let successor=null;
 translate();requestDraw();startIntro();
 return {get camera(){return successor?successor.camera:createPlotCamera(camera);},get intro(){return successor?successor.intro:{armed:introState.armed,interacted:introState.interacted,active:introState.cancel===stopIntro};},cancelIntro(){if(successor)return successor.cancelIntro();introState.cancel?.();},setStyle(value){if(successor)return successor.setStyle(value);const previousKind=p.kind;p={...p,...value};if(p.kind!=='3d')stopIntro();translate();requestDraw();if(previousKind!=='3d'&&p.kind==='3d')startIntro();},redraw(){if(successor)return successor.redraw();translate();requestDraw();},fit(){if(successor)return successor.fit();resetCamera();},zoomBy(factor){if(successor)return successor.zoomBy(factor);consumeIntro();if(zoomPlotCamera(camera,cssViewport(stage),null,factor))requestDraw();},dispose(){if(successor)return successor.dispose();if(disposed)return;releaseView();renderer?.dispose();}};
}
