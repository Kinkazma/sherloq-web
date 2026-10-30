import {loupeDefaults,validateLoupeSettings,loupeScale,loupeMinimumZoom,loupeGeometry,typingEvent} from './native-media-settings.js';
import {createLoupeScan} from './native-scan.js';
export function loupeMapping(radius,inner,transition,relativeZoom){
 const t=transition?Math.max(0,Math.min(1,(radius-inner)/transition)):Number(radius>inner),s=t*t*t*(t*(t*6-15)+10);
 return radius*(1/relativeZoom+(1-1/relativeZoom)*s);
}
const vertex='attribute vec2 position;varying vec2 uv;void main(){uv=vec2((position.x+1.)*.5,(1.-position.y)*.5);gl_Position=vec4(position,0.,1.);}';
const fragment=`precision highp float;
varying vec2 uv;uniform sampler2D baseImage;uniform sampler2D middleImage;uniform sampler2D detailImage;
uniform sampler2D effectBase;uniform sampler2D effectMiddle;uniform sampler2D effectDetail;uniform float effectsReady;
uniform vec2 imageCentre;uniform float imageScale;uniform vec4 effectWindow0;uniform vec4 effectWindow1;uniform vec4 effectWindow2;
uniform float radius;uniform float innerRadius;uniform float transition;uniform float magnification;
vec4 sampleInside(sampler2D image,vec2 coord){if(any(lessThan(coord,vec2(0.)))||any(greaterThan(coord,vec2(1.))))return vec4(0.);return texture2D(image,coord);}
void main(){vec2 d=(uv-.5)*(radius*2.);float r=length(d);if(r>radius)discard;
float t=transition>0.?clamp((r-innerRadius)/transition,0.,1.):step(innerRadius,r);float s=t*t*t*(t*(t*6.-15.)+10.);
vec2 q=d*(1./magnification+(1.-1./magnification)*s);vec2 a=q/(2.*radius);
vec4 colour=sampleInside(baseImage,.5+a);
vec4 middle=sampleInside(middleImage,.5+a*sqrt(magnification));if(middle.a>.99)colour=middle;
vec4 detail=sampleInside(detailImage,.5+a*magnification);if(detail.a>.99)colour=detail;
if(effectsReady>.5){vec2 world=imageCentre+q/imageScale;
 vec2 eb=(world-effectWindow0.xy)/effectWindow0.zw;vec4 changed=sampleInside(effectBase,eb);
 vec2 mb=(world-effectWindow1.xy)/effectWindow1.zw;vec4 em=sampleInside(effectMiddle,mb);if(em.a>.99){float edge=min(min(mb.x,mb.y),min(1.-mb.x,1.-mb.y));changed=mix(changed,em,smoothstep(0.,.06,edge));}
 vec2 db=(world-effectWindow2.xy)/effectWindow2.zw;vec4 ed=sampleInside(effectDetail,db);if(ed.a>.99){float edge=min(min(db.x,db.y),min(1.-db.x,1.-db.y));changed=mix(changed,ed,smoothstep(0.,.06,edge));}
 colour=mix(colour,vec4(changed.rgb,colour.a),(1.-s)*step(.99,changed.a));}gl_FragColor=colour;}`;
// Geometry is rendered at the display's actual pixel density. Every effect source is native.
export function createPointerLoupe(view,{baseCanvas,getSurface,getEffectsSurface=()=>null,getPixelRatio=()=>globalThis.devicePixelRatio||1,getScreen=()=>globalThis.screen,getCamera,canInteract=()=>true,onZoom=()=>{},onSweepChange=()=>{},onPresented=()=>{},keepVisibleAtMinimum=()=>false,onError=()=>{},getEffectsState=()=>({})}){
 const document=view.ownerDocument,overlay=document.createElement('canvas');overlay.className='pointer-loupe';overlay.hidden=true;view.append(overlay);
 const rings=document.createElementNS('http://www.w3.org/2000/svg','svg');rings.classList.add('pointer-loupe-rings');rings.setAttribute('aria-hidden','true');rings.style.display='none';for(let i=0;i<2;i++)rings.append(document.createElementNS(rings.namespaceURI,'circle'));view.append(rings);
 const hide=()=>{overlay.hidden=true;rings.style.display='none';view.classList.remove('loupe-magnifying');};
 let settings={...loupeDefaults},pointer=null,lastPointer=null,pinned=false,gl=null,program=null,textures=[],buffer=null,frame=0,clickTimer=0,clickInitial=null,disposed=false,failed=false,rawGeometry='',effectGeometry='',lastSource=null,lastEffect=null,effectsReady=false,sampleWindows=null,settled=false,paintNotification=0,pendingPaint='',notifiedPaint='';
 const scratch=Array.from({length:6},()=>document.createElement('canvas'));
 const requestDraw=()=>{if(settings.enabled&&!frame&&!disposed)frame=requestAnimationFrame(()=>{frame=0;try{draw();}catch(error){onError(error);}});};
 const scan=createLoupeScan({read:()=>settings,write:(group,key,value)=>publish({effects:{...settings.effects,[group]:{...settings.effects[group],[key]:value}}}),changed:value=>{onSweepChange(value);requestDraw();}});
 function shader(type,source){const result=gl.createShader(type);gl.shaderSource(result,source);gl.compileShader(result);if(!gl.getShaderParameter(result,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(result);gl.deleteShader(result);throw Error(message);}return result;}
 function initialize(){
  if(gl)return true;if(failed)return false;
  try{gl=overlay.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:false});if(!gl)throw Error('WebGL unavailable');
   const a=shader(gl.VERTEX_SHADER,vertex),b=shader(gl.FRAGMENT_SHADER,fragment);program=gl.createProgram();gl.attachShader(program,a);gl.attachShader(program,b);gl.linkProgram(program);gl.deleteShader(a);gl.deleteShader(b);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
   rawGeometry='';effectGeometry='';gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,1,1,1,-1,-1,1,-1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
   textures=[0,1,2,3,4,5].map(unit=>{const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.LINEAR);gl.uniform1i(gl.getUniformLocation(program,['baseImage','middleImage','detailImage','effectBase','effectMiddle','effectDetail'][unit]),unit);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));return texture;});return true;
  }catch(error){failed=true;gl=null;onError(error);return false;}
 }

 function draw(){
  const camera=getCamera(),source=getSurface();if(disposed||!settings.enabled||!pointer||!source||!camera?.scale||!canInteract()){hide();return;}if(!initialize()){hide();return;}
  const geometry=loupeGeometry(settings,getScreen()),radius=geometry.diameter/2+geometry.transition,size=radius*2,dpr=getPixelRatio(),side=Math.max(1,Math.ceil(size*dpr)),zoom=loupeScale(settings,camera.scale),ratio=zoom/camera.scale;
  if(side>gl.getParameter(gl.MAX_TEXTURE_SIZE))throw Error('Diamètre supérieur à la capacité graphique.');
  if(lastSource!==source){if(lastSource?.owner!==source.owner){effectsReady=false;sampleWindows=null;lastEffect=null;}lastSource=source;rawGeometry='';}
  view.classList.toggle('loupe-magnifying',ratio>1&&!pinned);rings.style.display=settings.markers?'block':'none';rings.style.opacity=String(settings.ringOpacity/100);
  for(const [i,r]of [geometry.diameter/2,radius].entries())for(const [k,v]of Object.entries({cx:pointer.x,cy:pointer.y,r,stroke:settings.ringColor,'stroke-width':settings.ringWidth,'stroke-dasharray':settings.ringStyle==='dashed'?'4 4':'none'}))rings.children[i].setAttribute(k,String(v));
  overlay.hidden=false;overlay.style.left=(pointer.x-radius)+'px';overlay.style.top=(pointer.y-radius)+'px';overlay.style.width=overlay.style.height=size+'px';if(overlay.width!==side)overlay.width=overlay.height=side;gl.viewport(0,0,side,side);
  const x=(pointer.x-camera.x)/camera.scale,y=(pointer.y-camera.y)/camera.scale,scales=[camera.scale,Math.sqrt(zoom*camera.scale),zoom],windows=scales.map(scale=>{const extent=radius/scale;return[x-extent,y-extent,extent*2,extent*2];}),bounds=windows.map(([left,top,width,height])=>({left,top,right:left+width,bottom:top+height,circle:{x,y,radius:radius/camera.scale}})),key=[x,y,camera.scale,zoom,radius,side].join(':');
  function paint(target,index){const c=scratch[index];if(c.width!==side)c.width=c.height=side;const ctx=c.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,side,side);const i=index%3,scale=scales[i];ctx.setTransform(scale*dpr,0,0,scale*dpr,side/2-x*scale*dpr,side/2-y*scale*dpr);ctx.imageSmoothingEnabled=scale*dpr<3;target.draw(ctx,bounds[i],scale*dpr);gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,textures[index]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);}
  const rawKey=key+':'+(source.revision||'');if(rawGeometry!==rawKey){for(let i=0;i<3;i++)paint(source,i);rawGeometry=rawKey;}
  let target=getEffectsSurface(),ready=false;for(let fallback=0;target&&fallback<3;fallback++){ready=bounds.map((b,i)=>target.prepare?.(b,scales[i]*dpr)!==false).every(Boolean);if(ready)break;if(!target.fallback)break;target=target.fallback;}
  settled=false;
  if(target&&ready){if(lastEffect!==target||effectGeometry!==key){for(let i=0;i<3;i++)paint(target,i+3);lastEffect=target;effectGeometry=key;sampleWindows=windows;effectsReady=true;}settled=target.provisional===true||target.effectsKey===JSON.stringify(settings.effects);}
  // While the next native result or its tiles arrive, keep the previous native result.
  // Its world coordinates stay attached to the same image; no fallback overview exists.
  if(!target){effectsReady=false;sampleWindows=null;lastEffect=null;}
  gl.uniform1f(gl.getUniformLocation(program,'effectsReady'),effectsReady?1:0);gl.uniform2f(gl.getUniformLocation(program,'imageCentre'),x,y);gl.uniform1f(gl.getUniformLocation(program,'imageScale'),camera.scale);
  (sampleWindows??windows).forEach((rect,i)=>gl.uniform4f(gl.getUniformLocation(program,'effectWindow'+i),...rect));
  for(const [name,value]of Object.entries({radius,innerRadius:geometry.diameter/2,transition:geometry.transition,magnification:ratio}))gl.uniform1f(gl.getUniformLocation(program,name),value);
  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);if(settled){
   const paintKey=source.owner+':'+target.effectsKey+':'+(target.presentationKey||'');
   if(notifiedPaint===paintKey&&scan.active)scan.presented();
   if(notifiedPaint!==paintKey&&pendingPaint!==paintKey){cancelAnimationFrame(paintNotification);pendingPaint=paintKey;paintNotification=requestAnimationFrame(()=>{pendingPaint='';if(disposed||overlay.hidden||document.hidden||lastSource?.owner!==source.owner||lastEffect?.effectsKey!==target.effectsKey)return;notifiedPaint=paintKey;onPresented({owner:source.owner,effectsKey:target.effectsKey,provisional:!!target.provisional,previewId:target.previewId});if(target.effectsKey===JSON.stringify(settings.effects))scan.presented();});}
  }
 }
 const move=e=>{if(pinned&&!scan.active)return;if(!canInteract(e)){pointer=null;hide();return;}const r=view.getBoundingClientRect();pointer={x:e.clientX-r.left,y:e.clientY-r.top};lastPointer={...pointer};requestDraw();};
 const leave=()=>{if(pinned||scan.active)return;scan.stop();pointer=null;hide();};
 const wheel=e=>{if(!settings.enabled||!getSurface()||!canInteract(e))return;e.preventDefault();e.stopImmediatePropagation();move(e);if(e.shiftKey&&settings.effects.sweep.enabled){publish({effects:{...settings.effects,sweep:{...settings.effects.sweep,position:Math.max(0,Math.min(255,settings.effects.sweep.position-Math.sign(e.deltaY)*Math.max(1,Math.round(Math.abs(e.deltaY)/15))))}}});return;}const camera=getCamera(),unit=e.deltaMode===1?16:e.deltaMode===2?view.clientHeight:1;const value=loupeScale(settings,camera.scale,keepVisibleAtMinimum())*Math.exp(Math.max(-1,Math.min(1,-e.deltaY*unit*.002)));settings={...settings,zoom:Math.min(3600,Math.max(loupeMinimumZoom(settings,camera.scale,keepVisibleAtMinimum()),value*100/camera.scale))};onZoom({...settings});requestDraw();};
 const available=e=>settings.enabled&&getSurface()&&canInteract(e)&&!typingEvent(e);
 const publish=patch=>{settings={...settings,...patch};onZoom({...settings});requestDraw();};
 const click=e=>{if(e.button!==0||!available(e))return;e.preventDefault();e.stopImmediatePropagation();move(e);if(e.detail>=2)return;clickInitial=settings.markers;clearTimeout(clickTimer);clickTimer=setTimeout(()=>{clickTimer=0;publish({markers:!clickInitial});},300);};
 const double=e=>{if(e.button!==0||!available(e))return;e.preventDefault();e.stopImmediatePropagation();clearTimeout(clickTimer);clickTimer=0;move(e);const markers=clickInitial??settings.markers;clickInitial=null;publish({zoom:101,markers,...(getCamera().scale>1?{unlock:true}:{})});};
 const keydown=e=>{if(!available(e)||e.ctrlKey||e.metaKey||e.altKey||e.isComposing)return false;const key=['ArrowUp','ArrowDown'].includes(e.key)?'diameter':['ArrowLeft','ArrowRight'].includes(e.key)?'transition':null;if(!key)return false;e.preventDefault();const direction=['ArrowUp','ArrowRight'].includes(e.key)?1:-1;publish({[key]:Math.min(key==='diameter'?2000:1000,Math.max(key==='diameter'?10:0,settings[key]+direction*(e.shiftKey?25:10)))});return true;};

 const lost=e=>{e.preventDefault();gl=null;program=null;textures=[];buffer=null;hide();};const restored=()=>{failed=false;requestDraw();};
 view.addEventListener('click',click,true);view.addEventListener('dblclick',double,true);view.addEventListener('pointermove',move);view.addEventListener('pointerleave',leave);view.addEventListener('wheel',wheel,{capture:true,passive:false});overlay.addEventListener('webglcontextlost',lost);overlay.addEventListener('webglcontextrestored',restored);
 return {get visible(){return !overlay.hidden;},get enabled(){return settings.enabled;},get sweeping(){return scan.active;},stopSweep:scan.stop,toggleSweep(group,range){if(scan.active){scan.stop({remember:true});return false;}if(!settings.enabled||!getSurface())return false;pointer=pointer??lastPointer??{x:view.clientWidth/2,y:view.clientHeight/2};return scan.start(group??['adjust','sweep','enhance'].find(key=>settings.effects[key].enabled),range);},pin(value){pinned=value;if(value)pointer=pointer??lastPointer??{x:view.clientWidth/2,y:view.clientHeight/2};requestDraw();},diagnostics(){return {pinned,pointer,sweeping:scan.active,side:overlay.width,relativeZoom:loupeScale(settings,getCamera()?.scale||1)/(getCamera()?.scale||1),nativeScale:loupeScale(settings,getCamera()?.scale||1),effectsReady,settled,displayedEffects:lastEffect?.effectsKey,provisional:!!lastEffect?.provisional,...getEffectsState()};},set(value){settled=false;settings=validateLoupeSettings(value);scan.observe();if(!settings.enabled){hide();clearTimeout(clickTimer);}requestDraw();},draw:requestDraw,invalidate(){settled=false;requestDraw();},keydown,hide,dispose(){disposed=true;scan.stop();hide();cancelAnimationFrame(frame);cancelAnimationFrame(paintNotification);clearTimeout(clickTimer);view.removeEventListener('click',click,true);view.removeEventListener('dblclick',double,true);view.removeEventListener('pointermove',move);view.removeEventListener('pointerleave',leave);view.removeEventListener('wheel',wheel,true);if(gl){for(const texture of textures)gl.deleteTexture(texture);gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();}for(const c of scratch)c.width=c.height=0;overlay.remove();rings.remove();}};
}
