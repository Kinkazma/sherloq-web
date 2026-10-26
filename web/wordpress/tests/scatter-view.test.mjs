import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createPlotCamera,projectPlotPoint,zoomPlotCamera,bindPlotCamera,createScatterView,createPlotIntroState,rearmPlotIntro,PLOT_INTRO_CAMERA,PLOT_INTRO_DURATION} from '../sherloq-browser/assets/scatter-view.js';
import {PLOT_FACES,nearestPlotFace,plotFaceCamera,projectOrientationPoint,plotViewDirection} from '../sherloq-browser/assets/scatter-orientation.js';
const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} differs from ${b}`),closePoint=(a,b)=>{close(a[0],b[0]);close(a[1],b[1]);},style=kind=>({kind,x:0,y:1,z:2,colored:true,alpha:.5});
const event=(window,node,type,values={})=>{const e=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(e,values);node.dispatchEvent(e);return e;};
function inputFixture(kind='2d'){
 const {document,window}=parseHTML('<html><body><main><canvas></canvas></main></body></html>'),canvas=document.querySelector('canvas'),parent=canvas.parentElement,viewport={width:640,height:480},bounds={...viewport,left:40,top:80},camera=createPlotCamera();
 canvas.getBoundingClientRect=()=>bounds;Object.defineProperty(canvas,'clientHeight',{value:viewport.height});canvas.setPointerCapture=()=>{};canvas.focus=()=>{};
 let mode='auto',draws=0,resets=0;const parentEvents=[];for(const type of ['wheel','gesturestart','gesturechange','gestureend','pointerdown','pointermove','pointerup','pointercancel','lostpointercapture','dblclick','keydown'])parent.addEventListener(type,e=>parentEvents.push(e.type));
 const binding=bindPlotCamera(canvas,{camera,style:()=>style(kind),changed:()=>draws++,reset(){Object.assign(camera,createPlotCamera());resets++;},getNavigationMode:()=>mode});
 return {document,window,canvas,camera,viewport,parentEvents,binding,setMode:value=>mode=value,get draws(){return draws;},get resets(){return resets;},emit:(type,values)=>event(window,canvas,type,values),at:([x,y])=>({clientX:x+bounds.left,clientY:y+bounds.top})};
}
test('front 3D and 2D project every RGB/HSV axis pair identically at creation/reset',()=>{
 const camera=createPlotCamera();assert.deepEqual(camera,{yaw:0,pitch:0,zoom:1,x:0,y:0});
 for(const viewport of [{width:1200,height:800},{width:800,height:1200},{width:1,height:1}])for(const axes of [[0,1,2],[3,4,5],[5,0,4]])for(const row of [[0,1,.7,.2,.8,.5],[1,0,.1,.9,0,.6],[.5,.5,1,.5,.5,0]]){
  const s={...style('2d'),x:axes[0],y:axes[1],z:axes[2]},two=projectPlotPoint(row,s,camera,viewport),three=projectPlotPoint(row,{...s,kind:'3d'},camera,viewport);closePoint(three,two);
  close(two[0],viewport.width/2+(row[s.x]-.5)*Math.min(viewport.width,viewport.height)*.7);close(two[1],viewport.height/2-(row[s.y]-.5)*Math.min(viewport.width,viewport.height)*.7);
 }
 const supplied={yaw:Infinity,pitch:20,zoom:-1,x:NaN,y:Infinity};assert.deepEqual(createPlotCamera(supplied),{yaw:0,pitch:Math.PI/2,zoom:.1,x:0,y:0});assert.deepEqual(supplied,{yaw:Infinity,pitch:20,zoom:-1,x:NaN,y:Infinity});assert.equal(createPlotCamera({zoom:100}).zoom,12);
});
test('pointer-anchored zoom retains the same projected point after pan and at both zoom limits in 2D/3D',()=>{
 const row=[.68,.23,.85,0,0,0];for(const kind of ['2d','3d'])for(const viewport of [{width:640,height:480},{width:320,height:800}]){
  const camera=createPlotCamera({yaw:.6,pitch:-.4,zoom:3,x:73,y:-92}),s=style(kind),anchor=projectPlotPoint(row,s,camera,viewport);
  assert.equal(zoomPlotCamera(camera,viewport,{x:anchor[0],y:anchor[1]},100),true);assert.equal(camera.zoom,12);closePoint(projectPlotPoint(row,s,camera,viewport),anchor);
  const atMaximum={...camera};assert.equal(zoomPlotCamera(camera,viewport,{x:anchor[0],y:anchor[1]},2),false);assert.deepEqual(camera,atMaximum);
  assert.equal(zoomPlotCamera(camera,viewport,{x:anchor[0],y:anchor[1]},1e-8),true);assert.equal(camera.zoom,.1);closePoint(projectPlotPoint(row,s,camera,viewport),anchor);
  const atMinimum={...camera};assert.equal(zoomPlotCamera(camera,viewport,{x:anchor[0],y:anchor[1]},.01),false);assert.deepEqual(camera,atMinimum);
 }
});
test('button zoom preserves the point visible at viewport center after pan; invalid input cannot corrupt camera',()=>{
 const viewport={width:600,height:400},camera=createPlotCamera({x:70,y:-56}),row=[.25,.3,.9,0,0,0],s=style('3d');closePoint(projectPlotPoint(row,s,camera,viewport),[300,200]);
 zoomPlotCamera(camera,viewport,null,2);closePoint(projectPlotPoint(row,s,camera,viewport),[300,200]);close(camera.x,140);close(camera.y,-112);
 zoomPlotCamera(camera,viewport,null,.5);close(camera.x,70);close(camera.y,-56);const before={...camera};for(const factor of [0,-1,NaN,Infinity])assert.equal(zoomPlotCamera(camera,viewport,null,factor),false);assert.equal(zoomPlotCamera(camera,{width:0,height:400},null,2),false);assert.deepEqual(camera,before);
});
test('shared Auto pans trackpad; device preference changes without remount and wheel/pinch anchor after that pan',()=>{
 const f=inputFixture(),row=[.65,.4,.1,0,0,0],s=style('2d');
 f.emit('wheel',{deltaX:7.5,deltaY:21.25,deltaMode:0});close(f.camera.x,-7.5);close(f.camera.y,-21.25);assert.equal(f.camera.zoom,1);
 f.setMode('mouse');let anchor=projectPlotPoint(row,s,f.camera,f.viewport);const wheel=f.emit('wheel',{deltaX:0,deltaY:-20,deltaMode:0,...f.at(anchor)});assert.equal(wheel.defaultPrevented,true);assert.ok(f.camera.zoom>1);closePoint(projectPlotPoint(row,s,f.camera,f.viewport),anchor);
 f.setMode('trackpad');const before=f.camera.zoom;f.emit('wheel',{deltaX:-10,deltaY:100,deltaMode:0});assert.equal(f.camera.zoom,before);close(f.camera.x,10+(anchor[0]-f.viewport.width/2)*(1-before)+before*(-7.5));
 anchor=projectPlotPoint(row,s,f.camera,f.viewport);f.emit('wheel',{ctrlKey:true,deltaY:-12,deltaMode:0,...f.at(anchor)});assert.ok(f.camera.zoom>before);closePoint(projectPlotPoint(row,s,f.camera,f.viewport),anchor);assert.deepEqual(f.parentEvents,[]);f.binding.dispose();
});
test('shared wheel line/page units and automatic notches zoom at pointer, never in device pixels',()=>{
 for(const values of [{deltaMode:1,deltaY:-2},{deltaMode:2,deltaY:-1},{deltaMode:0,deltaY:-100}]){
  const f=inputFixture('3d');Object.assign(f.camera,{yaw:.3,pitch:.4,x:90,y:-60});const row=[.2,.7,.8,0,0,0],s=style('3d'),anchor=projectPlotPoint(row,s,f.camera,f.viewport);f.emit('wheel',{...values,...f.at(anchor)});assert.ok(f.camera.zoom>1);closePoint(projectPlotPoint(row,s,f.camera,f.viewport),anchor);assert.deepEqual(f.parentEvents,[]);f.binding.dispose();
 }
});
test('two-touch pinch follows moving midpoint after pan, including clamped zoom, without 3D rotation',()=>{
 for(const initialZoom of [1,12,.1]){
  const f=inputFixture('3d');Object.assign(f.camera,{x:63,y:-71,zoom:initialZoom,yaw:.4,pitch:-.2});const oldCenter=[240,210],size=Math.min(f.viewport.width,f.viewport.height)*.7*initialZoom;
  // Invert the current front-plane rotation to place a projected 3D point at
  // the old midpoint; the pinch must carry that point to the new midpoint.
  const px=(oldCenter[0]-f.viewport.width/2-f.camera.x)/size/Math.cos(f.camera.yaw),pz=-px*Math.sin(f.camera.yaw),py=((f.viewport.height/2+f.camera.y-oldCenter[1])/size+pz*Math.sin(f.camera.pitch))/Math.cos(f.camera.pitch),row=[px+.5,py+.5,.5,0,0,0],s=style('3d');closePoint(projectPlotPoint(row,s,f.camera,f.viewport),oldCenter);
  f.emit('pointerdown',{pointerType:'touch',button:0,pointerId:1,...f.at([140,210])});f.emit('pointerdown',{pointerType:'touch',button:0,pointerId:2,...f.at([340,210])});
  f.emit('pointermove',{pointerType:'touch',pointerId:1,...f.at([120,200])});closePoint(projectPlotPoint(row,s,f.camera,f.viewport),[230,205]);
  f.emit('pointermove',{pointerType:'touch',pointerId:2,...f.at([380,230])});closePoint(projectPlotPoint(row,s,f.camera,f.viewport),[250,215]);close(f.camera.yaw,.4);close(f.camera.pitch,-.2);assert.ok(f.camera.zoom>=.1&&f.camera.zoom<=12);assert.deepEqual(f.parentEvents,[]);
  f.emit('pointercancel',{pointerId:1});f.emit('lostpointercapture',{pointerId:2});const before={...f.camera};f.emit('pointermove',{pointerId:1,...f.at([50,50])});assert.deepEqual(f.camera,before);f.binding.dispose();
 }
});
test('3D drag rotates with pitch clamp; Shift/middle drag and 2D arrows pan; doubleclick/Home fit',()=>{
 const f=inputFixture('3d');f.emit('pointerdown',{button:0,pointerId:1,...f.at([10,20])});f.emit('pointermove',{pointerId:1,...f.at([40,1000])});close(f.camera.yaw,.24);close(f.camera.pitch,Math.PI/2);f.emit('pointerup',{pointerId:1});
 const angles=[f.camera.yaw,f.camera.pitch];for(const values of [{button:0,shiftKey:true},{button:1}]){f.emit('pointerdown',{...values,pointerId:2,...f.at([20,20])});f.emit('pointermove',{pointerId:2,...f.at([50,40])});f.emit('pointerup',{pointerId:2});assert.deepEqual([f.camera.yaw,f.camera.pitch],angles);}close(f.camera.x,60);close(f.camera.y,40);
 f.emit('keydown',{key:'ArrowDown'});close(f.camera.pitch,Math.PI/2);f.emit('keydown',{key:'ArrowLeft',shiftKey:true});close(f.camera.x,40);f.emit('dblclick');assert.deepEqual(f.camera,createPlotCamera());assert.equal(f.resets,1);f.emit('keydown',{key:'Home'});assert.equal(f.resets,2);assert.deepEqual(f.parentEvents,[]);f.binding.dispose();
 const two=inputFixture();two.emit('keydown',{key:'ArrowLeft'});two.emit('keydown',{key:'ArrowUp'});assert.deepEqual(two.camera,{yaw:0,pitch:0,zoom:1,x:-20,y:-20});two.binding.dispose();
});
test('Safari native pinch suppresses duplicate ctrl-wheel, resets on blur/visibility, and disposal removes all handlers',()=>{
 const f=inputFixture('3d');f.setMode('trackpad');Object.assign(f.camera,{x:30,y:40});const row=[.7,.1,.5,0,0,0],s=style('3d'),anchor=projectPlotPoint(row,s,f.camera,f.viewport);
 for(const [type,scale]of [['gesturestart',1],['gesturechange',1.5]])f.emit(type,{scale,...f.at(anchor)});close(f.camera.zoom,1.5);closePoint(projectPlotPoint(row,s,f.camera,f.viewport),anchor);const before={...f.camera};f.emit('wheel',{ctrlKey:true,deltaY:-10,...f.at(anchor)});assert.deepEqual(f.camera,before);
 f.emit('blur');f.emit('wheel',{ctrlKey:true,deltaY:-10,...f.at(anchor)});assert.ok(f.camera.zoom>1.5);closePoint(projectPlotPoint(row,s,f.camera,f.viewport),anchor);
 f.emit('gesturestart',{scale:1,...f.at(anchor)});Object.defineProperty(f.document,'hidden',{value:true,configurable:true});event(f.window,f.document,'visibilitychange');const zoom=f.camera.zoom;f.emit('wheel',{ctrlKey:true,deltaY:-10,...f.at(anchor)});assert.ok(f.camera.zoom>zoom);assert.deepEqual(f.parentEvents,[]);
 f.binding.dispose();const disposed={...f.camera};for(const [type,values]of [['wheel',{deltaY:-100}],['gesturestart',{scale:1}],['gesturechange',{scale:3}],['pointerdown',{button:0,pointerId:9,...f.at([30,30])}],['pointermove',{pointerId:9,...f.at([60,60])}],['dblclick',{}]])f.emit(type,values);assert.deepEqual(f.camera,disposed);assert.equal(f.resets,0);assert.ok(f.parentEvents.length>0);
});

function sceneFixture(gpu=false,viewport={width:600,height:400},clientViewport=viewport,options={}){
 const {document,window}=parseHTML('<html><body><div id="plot"></div></body></html>'),contexts=new Map(),frames=new Map();let frameId=0;
 Object.defineProperty(window.HTMLElement.prototype,'clientWidth',{configurable:true,get:()=>clientViewport.width});Object.defineProperty(window.HTMLElement.prototype,'clientHeight',{configurable:true,get:()=>clientViewport.height});window.HTMLElement.prototype.getBoundingClientRect=()=>({...viewport,left:30,top:50});window.HTMLCanvasElement.prototype.setPointerCapture=()=>{};window.HTMLCanvasElement.prototype.focus=()=>{};
 for(const [key,value]of Object.entries({devicePixelRatio:2,requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id),ResizeObserver:class{observe(){}disconnect(){}}}))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 const uniforms={},deletions=[],gl=new Proxy({NO_ERROR:0,COMPILE_STATUS:1,LINK_STATUS:2,createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getError:()=>0,getAttribLocation:()=>0,getUniformLocation:(_p,name)=>name,uniform4f(name,...values){uniforms[name]=values;},deleteBuffer(){deletions.push('buffer');},deleteProgram(){deletions.push('program');},deleteShader(){deletions.push('shader');}},{get:(target,key)=>key in target?target[key]:()=>{}});
 window.HTMLCanvasElement.prototype.getContext=function(kind){if(kind==='webgl2')return gpu?gl:null;if(!contexts.has(this)){const shapes=[],texts=[],fills=[],ctx=new Proxy({shapes,texts,fills,transform:[1,0,0,1,0,0],setTransform(...values){this.transform=values;},fillRect(...values){shapes.push(values);fills.push({values,color:this.fillStyle,alpha:this.globalAlpha});},fillText(...values){texts.push(values);}},{get:(target,key)=>key in target?target[key]:()=>{}});contexts.set(this,ctx);}return contexts.get(this);};
 const points={values:Float32Array.from([.2,.8,.4,.6,.7,.2,.8,.2,.9,.1,.4,.8]),count:2,total:20};let mode='mouse';const parent=document.getElementById('plot'),view=createScatterView({document:options.scoped?{createElement:document.createElement.bind(document),documentElement:document.documentElement,addEventListener:document.addEventListener.bind(document),removeEventListener:document.removeEventListener.bind(document)}:document,parent,points,style:style('3d'),columns:['R','G','B','H','S','V'],getNavigationMode:()=>mode,forceCanvas:!gpu,...options});
 const flush=time=>{const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(time);},canvas=()=>parent.querySelector('.scatter-canvas'),emit=(type,values={})=>event(window,canvas(),type,values),drawn=()=>contexts.get(canvas()).shapes.filter(shape=>shape[2]===1.5),clear=()=>{for(const ctx of contexts.values()){ctx.shapes.length=0;ctx.texts.length=0;}};
 return {document,window,parent,view,points,viewport,contexts,uniforms,deletions,frames,flush,canvas,emit,drawn,clear,setMode:value=>mode=value};
}
test('actual Canvas front projection and Fit equal 2D; hidden Z guide appears naturally after rotation',()=>{
 const f=sceneFixture();try{f.flush();const initial=f.drawn().slice(),guides=()=>f.contexts.get(f.parent.querySelector('.scatter-guides'));assert.deepEqual(guides().texts.map(t=>t[0]),['R 1','G 1','0']);
  f.clear();f.view.setStyle({kind:'2d'});f.flush();assert.deepEqual(f.drawn(),initial);f.view.setStyle({kind:'3d'});f.flush();f.emit('pointerdown',{button:0,pointerId:1,clientX:100,clientY:100});f.emit('pointermove',{pointerId:1,clientX:160,clientY:130});f.emit('pointerup',{pointerId:1});f.clear();f.flush();assert.ok(guides().texts.some(t=>t[0]==='B 1'));assert.notDeepEqual(f.drawn(),initial);
  f.clear();f.view.fit();f.flush();assert.deepEqual(f.drawn(),initial);assert.equal(guides().texts.some(t=>t[0]==='B 1'),false);assert.match(f.parent.querySelector('.scatter-help').textContent,/2.*20/);
 }finally{f.view.dispose();}assert.equal(f.frames.size,0);
});
test('actual toolbar zoom keeps viewport center fixed after pan, using CSS dimensions at DPR2',()=>{
 const f=sceneFixture();try{f.flush();f.emit('pointerdown',{button:0,shiftKey:true,pointerId:1,clientX:100,clientY:100});f.emit('pointermove',{pointerId:1,clientX:170,clientY:44});f.emit('pointerup',{pointerId:1});f.clear();f.flush();const before=f.drawn().slice();f.clear();f.view.zoomBy(2);f.flush();const after=f.drawn();
  for(let i=0;i<before.length;i++){close(after[i][0]-300,(before[i][0]-300)*2);close(after[i][1]-200,(before[i][1]-200)*2);}assert.equal(f.canvas().width,1200);assert.equal(f.canvas().height,800);
 }finally{f.view.dispose();}
});
test('fractional DOM viewport keeps actually drawn points anchored after pan and clamped pinch, with toolbar using the same center',()=>{
 const viewport={width:569.04296875,height:707.84735};
 for(const gpu of [false,true]){const f=sceneFixture(gpu,viewport,{width:569,height:708}),painted=()=>gpu?[0,1].map(i=>gpuPoint(f.points.values.subarray(i*6,i*6+6),f.uniforms,viewport)):f.drawn().map(([x,y])=>{const [a,b,c,d,e,g]=f.contexts.get(f.canvas()).transform;return [(a*x+c*y+e)*viewport.width/f.canvas().width,(b*x+d*y+g)*viewport.height/f.canvas().height];});
  try{f.flush();f.emit('pointerdown',{button:0,pointerId:1,clientX:100,clientY:100});f.emit('pointermove',{pointerId:1,clientX:120,clientY:90});f.emit('pointerup',{pointerId:1});f.emit('pointerdown',{button:0,shiftKey:true,pointerId:2,clientX:100,clientY:100});f.emit('pointermove',{pointerId:2,clientX:134.5,clientY:42.75});f.emit('pointerup',{pointerId:2});f.clear();f.flush();const anchor=painted()[0],at={clientX:anchor[0]+30,clientY:anchor[1]+50};
   f.emit('gesturestart',{scale:1,...at});for(const scale of [10000,1e-6]){f.emit('gesturechange',{scale,...at});f.clear();f.flush();closePoint(painted()[0],anchor);}f.emit('gestureend');
   const before=painted(),center=[viewport.width/2,viewport.height/2];f.view.zoomBy(1e8);f.clear();f.flush();const after=painted();for(let i=0;i<2;i++)closePoint(after[i],before[i].map((value,j)=>center[j]+(value-center[j])*120));
   const guides=f.parent.querySelector('.scatter-guides'),matrix=f.contexts.get(guides).transform;close(matrix[0]*viewport.width/guides.width,1);close(matrix[3]*viewport.height/guides.height,1);assert.equal(f.canvas().width,Math.round(viewport.width*2));assert.equal(f.canvas().height,Math.round(viewport.height*2));
  }finally{f.view.dispose();}
 }
});
function gpuPoint(row,uniforms,{width,height}){
 const [yaw,pitch,px,py]=uniforms.camera,[sx,sy]=uniforms.framing;let x=row[0]-.5,y=row[1]-.5,z=row[2]-.5;const xx=x*Math.cos(yaw)+z*Math.sin(yaw);z=z*Math.cos(yaw)-x*Math.sin(yaw);x=xx;y=y*Math.cos(pitch)-z*Math.sin(pitch);return [(x*sx+px+1)*width/2,(1-y*sy-py)*height/2];
}
test('context loss preserves GPU camera projection, style, points and dynamic preference in Canvas fallback',()=>{
 const f=sceneFixture(true);try{f.flush();assert.deepEqual(f.uniforms.camera,[0,0,0,-0]);f.emit('pointerdown',{button:0,pointerId:1,clientX:100,clientY:100});f.emit('pointermove',{pointerId:1,clientX:145,clientY:128});f.emit('pointerup',{pointerId:1});f.emit('pointerdown',{button:0,shiftKey:true,pointerId:2,clientX:100,clientY:100});f.emit('pointermove',{pointerId:2,clientX:120,clientY:140});f.emit('pointerup',{pointerId:2});f.emit('wheel',{deltaY:-100,clientX:400,clientY:150});f.flush();const before=[0,1].map(i=>gpuPoint(f.points.values.subarray(i*6,i*6+6),f.uniforms,f.viewport)),oldCanvas=f.canvas();
  const lost=f.emit('webglcontextlost');assert.equal(lost.defaultPrevented,true);assert.notEqual(f.canvas(),oldCanvas);f.flush();for(let i=0;i<2;i++)closePoint(f.drawn()[i],before[i]);assert.deepEqual(f.deletions,['buffer','program','shader','shader']);
  event(f.window,oldCanvas,'wheel',{deltaY:-100});assert.equal(f.frames.size,0,'old canvas navigation listener was removed');f.setMode('trackpad');f.clear();f.emit('wheel',{deltaX:7,deltaY:15});f.flush();for(let i=0;i<2;i++)closePoint(f.drawn()[i],[before[i][0]-7,before[i][1]-15]);
  f.view.setStyle({alpha:.8});f.view.fit();f.clear();f.flush();for(let i=0;i<2;i++)closePoint(f.drawn()[i],projectPlotPoint(f.points.values.subarray(i*6,i*6+6),style('2d'),createPlotCamera(),f.viewport));assert.equal(f.contexts.get(f.canvas()).globalAlpha,1);
 }finally{f.view.dispose();}assert.equal(f.frames.size,0);assert.equal(f.deletions.length,4);
});


test('3D intro starts aligned, tilts12degrees and finishes with Z down-left at45degrees',()=>{
 close(PLOT_INTRO_CAMERA.pitch,Math.PI/15);close(PLOT_INTRO_CAMERA.yaw,-Math.atan(Math.sin(Math.PI/15)));
 const f=sceneFixture();try{f.flush(0);assert.deepEqual(f.view.camera,createPlotCamera());const before=f.drawn().slice();f.flush(PLOT_INTRO_DURATION/2);assert.ok(f.view.camera.yaw<0&&f.view.camera.pitch>0);f.flush(PLOT_INTRO_DURATION);f.clear();f.flush(PLOT_INTRO_DURATION+1);
  close(f.view.camera.yaw,PLOT_INTRO_CAMERA.yaw);close(f.view.camera.pitch,PLOT_INTRO_CAMERA.pitch);assert.notDeepEqual(f.drawn(),before);const a=projectPlotPoint([0,0,0,0,0,0],style('3d'),f.view.camera,f.viewport),b=projectPlotPoint([0,0,1,0,0,0],style('3d'),f.view.camera,f.viewport);assert.ok(b[0]<a[0]&&b[1]>a[1]);close(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]));assert.equal(f.view.intro.active,false);assert.equal(f.view.intro.armed,false);
 }finally{f.view.dispose();}assert.equal(f.frames.size,0);
});
test('every camera gesture cancels intro immediately and no style change replays it',()=>{
 for(const[type,values]of[['pointerdown',{button:0,pointerId:1,clientX:100,clientY:100}],['wheel',{deltaY:-100,deltaMode:0,clientX:200,clientY:150}],['gesturestart',{scale:1,clientX:200,clientY:150}],['keydown',{key:'ArrowLeft'}]]){const f=sceneFixture();try{f.flush(0);f.flush(100);f.emit(type,values);const camera=f.view.camera;assert.equal(f.view.intro.active,false);assert.equal(f.view.intro.interacted,true);f.flush(1000);assert.deepEqual(f.view.camera,camera);f.view.setStyle({kind:'2d'});f.view.setStyle({kind:'3d'});f.flush(2000);assert.deepEqual(f.view.camera,camera);assert.equal(f.view.intro.active,false);}finally{f.view.dispose();}}
});
test('Fit, Home and double-click align exactly, consume intro and cannot replay it',()=>{
 for(const reset of[f=>f.view.fit(),f=>f.emit('keydown',{key:'Home'}),f=>f.emit('dblclick')]){const f=sceneFixture();try{f.flush(0);f.flush(200);reset(f);assert.deepEqual(f.view.camera,createPlotCamera());assert.equal(f.view.intro.active,false);assert.equal(f.view.intro.armed,false);f.view.setStyle({kind:'2d'});f.view.setStyle({kind:'3d'});f.flush(2000);assert.deepEqual(f.view.camera,createPlotCamera());}finally{f.view.dispose();}}
});
test('shared camera and intro survive native renewals and provisional viewers without replay',()=>{
 const camera=createPlotCamera(),intro=createPlotIntroState(),options={cameraState:camera,introState:intro},a=sceneFixture(false,undefined,undefined,options);a.flush(0);a.flush(200);a.emit('wheel',{deltaY:-100,clientX:200,clientY:100});const preserved=a.view.camera;a.view.dispose();
 const b=sceneFixture(false,undefined,undefined,{...options,allowIntro:false});try{b.flush(1000);assert.deepEqual(b.view.camera,preserved);assert.equal(b.view.intro.active,false);b.view.zoomBy(1.25);}finally{b.view.dispose();}
 const latest={...camera},c=sceneFixture(false,undefined,undefined,options);try{c.flush(2000);assert.deepEqual(c.view.camera,latest);assert.equal(c.view.intro.active,false);rearmPlotIntro(intro);c.view.setStyle({kind:'2d'});c.view.setStyle({kind:'3d'});assert.equal(c.view.intro.active,true);assert.deepEqual(c.view.camera,{...latest,yaw:0,pitch:0});}finally{c.view.dispose();}
});
test('reduced motion presents the final 3D orientation without animation and keeps native values intact',()=>{
 const f=sceneFixture(false,undefined,undefined,{reducedMotion:true}),before=f.points.values.slice();try{assert.equal(f.view.intro.active,false);f.flush(0);assert.equal(f.frames.size,0);close(f.view.camera.yaw,PLOT_INTRO_CAMERA.yaw);close(f.view.camera.pitch,PLOT_INTRO_CAMERA.pitch);assert.deepEqual(f.points.values,before);f.view.fit();assert.deepEqual(f.view.camera,createPlotCamera());}finally{f.view.dispose();}
});

test('all six canonical faces flatten their own axis in the actual main projection and preserve framing',()=>{
 const viewport={width:630,height:490},original=createPlotCamera({x:41,y:-63,zoom:2.5}),s=style('3d'),origin=[0,0,0,0,0,0];
 for(const face of PLOT_FACES){const camera=plotFaceCamera(face.id,original);assert.equal(camera.x,41);assert.equal(camera.y,-63);assert.equal(camera.zoom,2.5);assert.equal(nearestPlotFace(camera),face.id);const o=projectPlotPoint(origin,s,camera,viewport),axis=[...origin];axis[face.axis]=1;closePoint(projectPlotPoint(axis,s,camera,viewport),o);const others=[0,1,2].filter(i=>i!==face.axis).map(i=>{const p=[...origin];p[i]=1;return projectPlotPoint(p,s,camera,viewport).map((v,k)=>v-o[k]);});close(others[0][0]*others[1][0]+others[0][1]*others[1][1],0,1e-6);}
 assert.throws(()=>plotFaceCamera('no-face',original));assert.deepEqual(original,createPlotCamera({x:41,y:-63,zoom:2.5}));
});
test('closest-face selection hides the shortest projected axis through deterministic full rotations',()=>{
 const s=style('3d'),viewport={width:600,height:400};
 for(let i=0;i<=2000;i++){const c=createPlotCamera({yaw:(i*0.137)% (8*Math.PI)-4*Math.PI,pitch:Math.sin(i*0.193)*Math.PI/2}),id=nearestPlotFace(c),face=PLOT_FACES.find(f=>f.id===id),origin=projectPlotPoint([0,0,0,0,0,0],s,c,viewport),lengths=[0,1,2].map(j=>{const v=[0,0,0,0,0,0];v[j]=1;const p=projectPlotPoint(v,s,c,viewport);return Math.hypot(p[0]-origin[0],p[1]-origin[1]);});assert.ok(lengths[face.axis]<=Math.min(...lengths)+1e-8);assert.ok(plotViewDirection(c)[face.axis]*face.sign>0);}
});
test('cube face actions and doubleclick snap to nearby signed faces without resetting pan, zoom or scientific rows',()=>{
 const f=sceneFixture(),before=f.points.values.slice();try{f.view.cancelIntro();f.view.zoomBy(2);f.emit('pointerdown',{button:0,shiftKey:true,pointerId:1,clientX:80,clientY:80});f.emit('pointermove',{pointerId:1,clientX:120,clientY:50});f.emit('pointerup',{pointerId:1});const framing=f.view.camera;
 for(const face of PLOT_FACES){const button=f.parent.querySelector('.scatter-cube-menu [data-cube-face="'+face.id+'"]');button.click();const c=f.view.camera;close(c.yaw,face.yaw);close(c.pitch,face.pitch);close(c.zoom,framing.zoom);close(c.x,framing.x);close(c.y,framing.y);assert.equal(f.view.intro.interacted,true);}
 f.view.alignFace('x+');f.emit('pointerdown',{button:0,pointerId:3,clientX:100,clientY:100});f.emit('pointermove',{pointerId:3,clientX:109,clientY:105});f.emit('pointerup',{pointerId:3});assert.equal(nearestPlotFace(f.view.camera),'x+');f.emit('dblclick');close(f.view.camera.yaw,-Math.PI/2);close(f.view.camera.pitch,0);close(f.view.camera.zoom,framing.zoom);close(f.view.camera.x,framing.x);assert.deepEqual(f.points.values,before);
 f.view.setStyle({kind:'2d'});f.emit('dblclick');assert.deepEqual(f.view.camera,createPlotCamera());f.flush();assert.equal(f.parent.querySelector('.scatter-orientation').hidden,true);
 }finally{f.view.dispose();}
});
test('miniature uses the retained RGB or HSV coordinates and source colours with bounded transparent drawing',()=>{
 const f=sceneFixture();try{f.view.cancelIntro();f.flush();const canvas=f.parent.querySelector('.scatter-cube-cloud'),context=f.contexts.get(canvas),fills=context.fills.filter(v=>v.values[2]===1.1);assert.equal(f.view.miniPointCount,f.points.count);assert.equal(fills.length,2);for(let i=0;i<2;i++){const row=f.points.values.subarray(i*6,i*6+6),p=projectOrientationPoint([row[0],row[1],row[2]],f.view.camera);closePoint(fills[i].values,[p.x,p.y]);assert.equal(fills[i].color,`rgb(${row[0]*255},${row[1]*255},${row[2]*255})`);close(fills[i].alpha,.24);}
 context.fills.length=0;f.view.setStyle({x:3,y:4,z:5,colored:false,alpha:.8});f.flush();const hsv=context.fills.filter(v=>v.values[2]===1.1);for(let i=0;i<2;i++){const row=f.points.values.subarray(i*6,i*6+6),p=projectOrientationPoint([row[3],row[4],row[5]],f.view.camera);closePoint(hsv[i].values,[p.x,p.y]);assert.equal(hsv[i].color,'#338cd9');close(hsv[i].alpha,.384);}
 }finally{f.view.dispose();}
});
test('an interrupted native viewer resumes the same intro ticket rather than freezing at its intermediate angle',()=>{
 const camera=createPlotCamera(),intro=createPlotIntroState(),options={cameraState:camera,introState:intro},first=sceneFixture(false,undefined,undefined,options);first.flush(0);first.flush(180);const mid={...camera},ticket=intro.transition;first.view.dispose();assert.ok(ticket&&intro.transition===ticket);
 const next=sceneFixture(false,undefined,undefined,options);try{assert.deepEqual(next.view.camera,mid);assert.equal(intro.transition,ticket);next.flush(450);next.flush(451);close(next.view.camera.yaw,PLOT_INTRO_CAMERA.yaw);close(next.view.camera.pitch,PLOT_INTRO_CAMERA.pitch);assert.equal(next.view.intro.active,false);assert.equal(intro.transition,null);next.view.reinitialize();assert.equal(next.view.intro.active,true);assert.deepEqual(next.view.camera,createPlotCamera());}finally{next.view.dispose();}
});

test('SVG cube works with the restricted document facade used by real workspace panels',()=>{
 const f=sceneFixture(false,undefined,undefined,{scoped:true});try{f.view.cancelIntro();f.flush();assert.equal(f.parent.querySelectorAll('.scatter-cube-face').length,6);f.parent.querySelector('.scatter-cube-choice[data-cube-face="y-"]').click();close(f.view.camera.pitch,-Math.PI/2);f.view.setStyle({kind:'2d'});f.flush();assert.equal(f.parent.querySelector('.scatter-orientation').hidden,true);}finally{f.view.dispose();}
});
test('miniature caps its own display work without truncating the retained scientific table',()=>{
 const values=new Float32Array(4096*6);for(let i=0;i<values.length;i++)values[i]=(i%101)/100;const before=values.slice(),points={values,count:4096,total:4096},f=sceneFixture(false,undefined,undefined,{points});try{f.view.cancelIntro();f.flush();assert.ok(f.view.miniPointCount>0&&f.view.miniPointCount<=768);assert.equal(values.length,4096*6);assert.deepEqual(values,before);}finally{f.view.dispose();}
});
test('context loss resumes the current intro ticket in the retained Canvas fallback',()=>{
 const f=sceneFixture(true);try{f.flush(0);f.flush(150);assert.equal(f.view.intro.active,true);f.emit('webglcontextlost');f.flush(450);f.flush(451);close(f.view.camera.yaw,PLOT_INTRO_CAMERA.yaw);close(f.view.camera.pitch,PLOT_INTRO_CAMERA.pitch);assert.equal(f.view.intro.active,false);}finally{f.view.dispose();}
});


for(const gpu of [false,true])test(`held SVG face chooses on pointerup across redraws and updates ${gpu?'GPU uniforms':'Canvas points'}`,()=>{
 const initial=createPlotCamera({yaw:.4,pitch:.25,zoom:1.7,x:31,y:-19}),f=sceneFixture(gpu,undefined,undefined,{cameraState:{...initial},allowIntro:false});
 try{f.flush(0);const face=f.parent.querySelector('.scatter-cube-face[data-cube-face="x-"]'),group=face.parentElement,append=group.append.bind(group);let appends=0;group.append=(...nodes)=>{appends++;return append(...nodes);};
  event(f.window,face,'pointerdown',{button:0,isPrimary:true,pointerId:81,pointerType:'mouse',clientX:78,clientY:79});
  for(let i=1;i<=4;i++){f.view.setStyle({alpha:.5+i*.01});f.flush(i*16);}assert.equal(appends,0,'stationary redraws must preserve the pressed DOM target');
  event(f.window,f.window,'pointerup',{pointerId:81,pointerType:'mouse',clientX:78,clientY:79});f.clear();f.flush(100);const expected=plotFaceCamera('x-',initial);
  close(f.view.camera.yaw,expected.yaw);close(f.view.camera.pitch,expected.pitch);close(f.view.camera.x,31);close(f.view.camera.y,-19);close(f.view.camera.zoom,1.7);
  for(let i=0;i<f.points.count;i++){const row=f.points.values.subarray(i*6,i*6+6),actual=gpu?gpuPoint(row,f.uniforms,f.viewport):f.drawn()[i];closePoint(actual,projectPlotPoint(row,style('3d'),expected,f.viewport));}
  if(gpu){close(f.uniforms.camera[0],expected.yaw);close(f.uniforms.camera[1],expected.pitch);}
  assert.equal(f.frames.size,0);event(f.window,face,'click',{detail:1});assert.equal(f.frames.size,0,'the compatibility click must not align twice');
 }finally{f.view.dispose();}assert.equal(f.frames.size,0);
});
test('cube accepts touch and four-pixel releases, preserves the original target outside, and ignores unrelated pointers',()=>{
 for(const pointerType of ['mouse','touch','pen']){const initial=createPlotCamera({yaw:.4,pitch:.25}),f=sceneFixture(false,undefined,undefined,{cameraState:{...initial},allowIntro:false});try{f.flush(0);const face=f.parent.querySelector('.scatter-cube-face[data-cube-face="x-"]');event(f.window,face,'pointerdown',{button:0,isPrimary:true,pointerId:3,pointerType,clientX:100,clientY:100});event(f.window,f.window,'pointerup',{pointerId:4,pointerType,clientX:100,clientY:100});assert.deepEqual(f.view.camera,initial);event(f.window,f.window,'pointerup',{pointerId:3,pointerType,clientX:104,clientY:100});close(f.view.camera.yaw,Math.PI/2);f.flush(100);event(f.window,face,'click',{detail:1});assert.equal(f.frames.size,0);}finally{f.view.dispose();}}
});
test('cube drag and release beyond four pixels never align via a later compatibility click',()=>{
 for(const move of [true,false]){const initial=createPlotCamera({yaw:.4,pitch:.25}),f=sceneFixture(false,undefined,undefined,{cameraState:{...initial},allowIntro:false});try{f.flush(0);const face=f.parent.querySelector('.scatter-cube-face[data-cube-face="x-"]');event(f.window,face,'pointerdown',{button:0,pointerId:5,clientX:100,clientY:100});if(move)event(f.window,f.window,'pointermove',{pointerId:5,clientX:104.1,clientY:100});event(f.window,f.window,'pointerup',{pointerId:5,clientX:104.1,clientY:100});const released={...f.view.camera};assert.notEqual(released.yaw,Math.PI/2);event(f.window,face,'click',{detail:1});assert.deepEqual(f.view.camera,released);f.flush(100);assert.equal(face.getAttribute('aria-pressed'),'false');}finally{f.view.dispose();}}
});
test('cube cancellation, lost capture, blur and hidden document reject a pending face and its compatibility click',()=>{
 for(const end of ['pointercancel','lostpointercapture','blur','visibilitychange']){const initial=createPlotCamera({yaw:.4,pitch:.25}),f=sceneFixture(false,undefined,undefined,{cameraState:{...initial},allowIntro:false});try{f.flush(0);const face=f.parent.querySelector('.scatter-cube-face[data-cube-face="x-"]');event(f.window,face,'pointerdown',{button:0,pointerId:6,clientX:100,clientY:100});if(end==='visibilitychange'){Object.defineProperty(f.document,'hidden',{configurable:true,value:true});event(f.window,f.document,end);}else event(f.window,end==='lostpointercapture'?face:f.window,end,{pointerId:6});event(f.window,f.window,'pointerup',{pointerId:6,clientX:100,clientY:100});event(f.window,face,'click',{detail:1});assert.deepEqual(f.view.camera,initial);}finally{f.view.dispose();}}
});
test('cube keyboard and menu choices still work after a cancelled pointer gesture; disposal removes pending actions',()=>{
 const initial=createPlotCamera({yaw:.4,pitch:.25}),f=sceneFixture(false,undefined,undefined,{cameraState:{...initial},allowIntro:false});f.flush(0);const face=f.parent.querySelector('.scatter-cube-face[data-cube-face="x-"]');event(f.window,face,'pointerdown',{button:0,pointerId:9,clientX:100,clientY:100});event(f.window,f.window,'pointercancel',{pointerId:9});event(f.window,face,'keydown',{key:'Enter'});close(f.view.camera.yaw,Math.PI/2);f.parent.querySelector('.scatter-cube-choice[data-cube-face="y+"]').click();close(f.view.camera.pitch,Math.PI/2);event(f.window,face,'keydown',{key:' '});close(f.view.camera.yaw,Math.PI/2);close(f.view.camera.pitch,0);event(f.window,face,'pointerdown',{button:0,pointerId:10,clientX:100,clientY:100});const before=f.view.camera;f.view.dispose();event(f.window,f.window,'pointerup',{pointerId:10,clientX:100,clientY:100});event(f.window,face,'click',{detail:1});assert.deepEqual(f.view.camera,before);assert.equal(f.frames.size,0);
});


function capturedCubeFixture(){
 const initial=createPlotCamera({yaw:.4,pitch:.25}),f=sceneFixture(false,undefined,undefined,{cameraState:{...initial},allowIntro:false});f.flush(0);
 const svg=f.parent.querySelector('.scatter-cube'),face=f.parent.querySelector('.scatter-cube-face[data-cube-face="x-"]'),captured=new Set(),calls=[];
 Object.defineProperty(f.window,'innerWidth',{configurable:true,value:900});Object.defineProperty(f.window,'innerHeight',{configurable:true,value:700});
 svg.setPointerCapture=id=>{calls.push(['capture',id]);captured.add(id);};svg.hasPointerCapture=id=>captured.has(id);svg.releasePointerCapture=id=>{calls.push(['release',id]);captured.delete(id);event(f.window,svg,'lostpointercapture',{pointerId:id});};
 const down=(id=21,pointerType='mouse')=>event(f.window,face,'pointerdown',{button:0,buttons:1,isPrimary:true,pointerId:id,pointerType,clientX:100,clientY:100});
 return{...f,svg,face,captured,calls,down,initial};
}
test('mini-cube captures its stable SVG root and releases before a held face aligns',()=>{
 const f=capturedCubeFixture();try{f.down();assert.deepEqual(f.calls,[['capture',21]]);for(let n=1;n<=4;n++){f.view.setStyle({alpha:.5+n*.01});f.flush(n*16);}event(f.window,f.window,'pointerup',{pointerId:21,buttons:0,clientX:100,clientY:100});assert.deepEqual(f.calls,[['capture',21],['release',21]]);assert.equal(f.captured.size,0);close(f.view.camera.yaw,Math.PI/2);event(f.window,f.face,'click',{detail:1});close(f.view.camera.yaw,Math.PI/2);}finally{f.view.dispose();}
});
test('mini-cube returning with buttons zero cancels before movement and permits a new normal click',()=>{
 const f=capturedCubeFixture();try{f.down();event(f.window,f.window,'pointermove',{pointerId:21,pointerType:'mouse',buttons:1,clientX:130,clientY:120});const dragged=f.view.camera;event(f.window,f.window,'pointermove',{pointerId:21,pointerType:'mouse',buttons:0,clientX:260,clientY:250});assert.deepEqual(f.view.camera,dragged);assert.equal(f.captured.size,0);event(f.window,f.face,'click',{detail:1});assert.deepEqual(f.view.camera,dragged);event(f.window,f.window,'pointermove',{pointerId:21,buttons:1,clientX:270,clientY:260});assert.deepEqual(f.view.camera,dragged);f.down(22);event(f.window,f.window,'pointerup',{pointerId:22,buttons:0,clientX:100,clientY:100});close(f.view.camera.yaw,Math.PI/2);assert.equal(f.captured.size,0);}finally{f.view.dispose();}
});
test('mini-cube cancels at the real viewport boundary, not when leaving the SVG or a shadow subtree',()=>{
 const f=capturedCubeFixture();try{f.down();event(f.window,f.svg,'pointerout',{pointerId:21,buttons:1,relatedTarget:f.parent,clientX:220,clientY:140});assert.equal(f.captured.size,1);event(f.window,f.svg,'pointerout',{pointerId:21,buttons:1,relatedTarget:null,clientX:220,clientY:140});assert.equal(f.captured.size,1);event(f.window,f.window,'pointermove',{pointerId:21,buttons:1,clientX:240,clientY:150});const dragged=f.view.camera;event(f.window,f.svg,'pointerout',{pointerId:21,buttons:1,relatedTarget:null,clientX:900,clientY:150});assert.equal(f.captured.size,0);event(f.window,f.window,'pointermove',{pointerId:21,buttons:1,clientX:250,clientY:160});event(f.window,f.window,'pointerup',{pointerId:21,buttons:0,clientX:250,clientY:160});event(f.window,f.face,'click',{detail:1});assert.deepEqual(f.view.camera,dragged);}finally{f.view.dispose();}
});
test('mini-cube cannot rotate or align from outside-viewport coordinates even if boundary events were missed',()=>{
 for(const terminal of ['pointermove','pointerup']){const f=capturedCubeFixture();try{f.down();const before=f.view.camera;event(f.window,f.window,terminal,{pointerId:21,buttons:terminal==='pointermove'?1:0,clientX:-1,clientY:100});assert.deepEqual(f.view.camera,before);assert.equal(f.captured.size,0);event(f.window,f.face,'click',{detail:1});event(f.window,f.window,'pointermove',{pointerId:21,buttons:0,clientX:100,clientY:100});assert.deepEqual(f.view.camera,before);}finally{f.view.dispose();}}
});
test('mini-cube capture failure, touch/pen cancellation, blur and disposal release safely without an accidental snap',()=>{
 const failed=capturedCubeFixture();try{failed.svg.setPointerCapture=()=>{throw Error('capture unavailable');};failed.svg.hasPointerCapture=()=>true;failed.svg.releasePointerCapture=()=>{throw Error('already lost');};failed.down();event(failed.window,failed.window,'pointermove',{pointerId:21,buttons:0,clientX:200,clientY:200});assert.deepEqual(failed.view.camera,failed.initial);}finally{failed.view.dispose();}
 for(const pointerType of ['touch','pen'])for(const terminal of ['pointercancel','blur','dispose']){const f=capturedCubeFixture();try{f.down(31,pointerType);event(f.window,f.window,'pointermove',{pointerId:31,pointerType,buttons:1,clientX:110,clientY:108});assert.notDeepEqual(f.view.camera,f.initial);const before=f.view.camera;if(terminal==='dispose')f.view.dispose();else event(f.window,f.window,terminal,{pointerId:31,pointerType});assert.equal(f.captured.size,0);event(f.window,f.window,'pointermove',{pointerId:31,pointerType,buttons:0,clientX:200,clientY:200});event(f.window,f.face,'click',{detail:1});assert.deepEqual(f.view.camera,before);}finally{f.view.dispose();}}
});

test('miniature refreshes when a retained provisional point buffer is replaced or resized',()=>{const f=sceneFixture(false,undefined,undefined,{allowIntro:false});f.flush();const mini=f.parent.querySelector('.scatter-cube-cloud'),ctx=f.contexts.get(mini);f.points.values=Float32Array.from([.1,.2,.3,.4,.5,.6,.9,.8,.7,.6,.5,.4,.3,.6,.9,.2,.4,.8]);f.points.count=3;f.clear();ctx.fills.length=0;f.view.redraw();f.flush();assert.equal(f.view.miniPointCount,3);const fills=ctx.fills.filter(value=>value.values[2]===1.1);assert.equal(fills.length,3);for(let i=0;i<3;i++){const row=f.points.values.subarray(i*6,i*6+6),q=projectOrientationPoint([row[0],row[1],row[2]],f.view.camera);close(fills[i].values[0],q.x);close(fills[i].values[1],q.y);}f.points.count=1;f.clear();f.view.redraw();f.flush();assert.equal(f.view.miniPointCount,1);f.view.dispose();});
