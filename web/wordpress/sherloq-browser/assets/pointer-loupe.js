import {hasLoupeEffects} from './loupe-effects-settings.js';
import {loupeEffectQueue} from './loupe-effects-client.js';
import {createLoupeScan} from './loupe-scan.js';
import {createLoupeImageCache} from './loupe-full-client.js';
let loupeSerial=0;
import {loupeDefaults,validateLoupeSettings,loupeScale,loupeMinimumZoom,loupeGeometry,typingEvent} from './media-settings.js';
// The quintic transition follows Gaël's WordPress SDR loupe. This adaptation
// requests only visible image tiles; it never uploads the full original to GPU.
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
export function createPointerLoupe(view,{baseCanvas,getSurface,getCamera,canInteract=()=>true,onZoom=()=>{},onEffectsState=()=>{},onSweepChange=()=>{},effectsAllowed=()=>true,keepVisibleAtMinimum=()=>false,onError=()=>{}}){
 const document=view.ownerDocument??globalThis.document,overlay=document.createElement('canvas');overlay.className='pointer-loupe';overlay.hidden=true;view.append(overlay);
 const rings=document.createElementNS('http://www.w3.org/2000/svg','svg');rings.classList.add('pointer-loupe-rings');rings.setAttribute('aria-hidden','true');rings.style.display='none';for(let i=0;i<2;i++)rings.append(document.createElementNS(rings.namespaceURI,'circle'));view.append(rings);
 const hide=()=>{overlay.hidden=true;rings.style.display='none';view.classList.remove('loupe-magnifying');};
 let settings={...loupeDefaults},pointer=null,gl=null,program=null,textures=[],buffer=null,frame=0,clickTimer=0,clickInitial=null,source=null,forks=[],disposed=false,failed=false;
 const owner=++loupeSerial;let pinned=false,lastPointer=null,imageEpoch=0,effectBusy=false,wantedEffect='',submittedEffect='',effectResult=null,effectGeometry='',completedEffect='',lastMetrics=null,rawGeometry='',rawComplete=false,uploadedEffects=null,effectSource=null,effectWindows=null,effectScanned=false,completedParameters='',rawReady=[];
 let scanFork=null,scanEpoch=0,scanPreviewKey='',scanPreviewReady=false;const scanPreview=document.createElement('canvas');
 const sourceChanged=()=>{imageEpoch++;requestDraw();};
 const scan=createLoupeScan({read:()=>settings,write:(group,key,value)=>publish({effects:{...settings.effects,[group]:{...settings.effects[group],[key]:value}}}),changed:value=>{onSweepChange(value);requestDraw();}});
 const scratch=[0,1,2].map(()=>document.createElement('canvas'));
 const fullScratch=[0,1,2].map(()=>document.createElement('canvas'));let fullRevision=0,fullUpload='',localMode=false;
 const requestDraw=()=>{if(settings.enabled&&!frame&&!disposed)frame=requestAnimationFrame(()=>{frame=0;draw();});};
 const fullImage=createLoupeImageCache({changed:()=>{fullRevision++;requestDraw();},state:onEffectsState});
 function shader(type,source){const result=gl.createShader(type);gl.shaderSource(result,source);gl.compileShader(result);if(!gl.getShaderParameter(result,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(result);gl.deleteShader(result);throw Error(message);}return result;}
 function initialize(){
  if(gl)return true;if(failed)return false;
  try{gl=overlay.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:false});if(!gl)throw Error('WebGL unavailable');
   const a=shader(gl.VERTEX_SHADER,vertex),b=shader(gl.FRAGMENT_SHADER,fragment);program=gl.createProgram();gl.attachShader(program,a);gl.attachShader(program,b);gl.linkProgram(program);gl.deleteShader(a);gl.deleteShader(b);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
   rawGeometry='';fullUpload='';uploadedEffects=null;gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,1,1,1,-1,-1,1,-1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
   textures=[0,1,2,3,4,5].map(unit=>{const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.LINEAR);gl.uniform1i(gl.getUniformLocation(program,['baseImage','middleImage','detailImage','effectBase','effectMiddle','effectDetail'][unit]),unit);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));return texture;});return true;
  }catch(error){failed=true;gl=null;onError(error);return false;}
 }
 function detachSource(resetEffects=true){for(const fork of forks)fork?.close?.();forks=[];scanFork?.close?.();scanFork=null;scanPreviewKey='';source=null;if(resetEffects)fullImage.reset();fullUpload='';}
 function draw(){
  const camera=getCamera(),current=getSurface();if(disposed||!settings.enabled||!pointer||!current||!camera?.scale||!canInteract()){scan.stop();hide();return;}
  if(!initialize()){hide();return;}
  if(source!==current){detachSource(false);source=current;imageEpoch++;forks=[source.fork?.(sourceChanged),source.fork?.(sourceChanged)];scanFork=source.fork?.(()=>{scanEpoch++;requestDraw();});}
  const geometry=loupeGeometry(settings),radius=geometry.diameter/2+geometry.transition,size=radius*2,dpr=Math.min(globalThis.devicePixelRatio||1,2,1024/size),side=Math.max(1,Math.ceil(size*dpr)),zoom=loupeScale(settings,camera.scale,keepVisibleAtMinimum()),ratio=zoom/camera.scale;
  const effectsActive=effectsAllowed()&&hasLoupeEffects(settings.effects);
  localMode=pinned||!!scan.active||!source.readPixels;
  if(localMode||!effectsActive)fullImage.cancel();else fullImage.ensure(source,settings.effects);
  // At the wheel's lower stop ordinary tools hide the loupe (and its effects),
  // keeping wheel input available to bring it back. Only Enhanced magnifier
  // keeps its local effect there; switching to its full-image filter uses L.
  const atMinimum=zoom<=loupeScale({...settings,zoom:2},camera.scale)+.000001;
  if(!keepVisibleAtMinimum()&&(atMinimum||Math.abs(ratio-1)<.0001)){wantedEffect='';hide();return;}
  view.classList.toggle('loupe-magnifying',ratio>1&&(!pinned||!!scan.active));
  rings.style.display=settings.markers?'block':'none';rings.style.opacity=String(settings.ringOpacity/100);
  for(const [i,r]of [geometry.diameter/2,radius].entries()){const circle=rings.children[i];for(const [k,v]of Object.entries({cx:pointer.x,cy:pointer.y,r,stroke:settings.ringColor,'stroke-width':settings.ringWidth,'stroke-dasharray':settings.ringStyle==='dashed'?'4 4':'none'}))circle.setAttribute(k,String(v));}
  overlay.hidden=false;overlay.style.left=(pointer.x-radius)+'px';overlay.style.top=(pointer.y-radius)+'px';overlay.style.width=overlay.style.height=size+'px';
  if(overlay.width!==side)overlay.width=overlay.height=side;gl.viewport(0,0,side,side);
  const x=(pointer.x-camera.x)/camera.scale,y=(pointer.y-camera.y)/camera.scale,geometryKey=[owner,imageEpoch,x,y,camera.scale,zoom,radius,side].join(':');let complete=rawComplete;
  if(rawGeometry!==geometryKey){complete=true;rawReady=[true,true,true];for(let i=0;i<3;i++){
   const c=scratch[i];if(c.width!==side)c.width=c.height=side;const ctx=c.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,side,side);
   if(i===0){const sourceDpr=baseCanvas.width/(view.clientWidth||1);ctx.drawImage(baseCanvas,(pointer.x-radius)*sourceDpr,(pointer.y-radius)*sourceDpr,size*sourceDpr,size*sourceDpr,0,0,side,side);}
   else{const scale=i===1?Math.sqrt(zoom*camera.scale):zoom,extent=radius/scale,target=forks[i-1]??source;
    const bounds={left:x-extent,top:y-extent,right:x+extent,bottom:y+extent};if(target.prepare&&!target.prepare(bounds,scale*dpr)){complete=false;rawReady[i]=false;}
    ctx.setTransform(scale*dpr,0,0,scale*dpr,side/2-x*scale*dpr,side/2-y*scale*dpr);ctx.imageSmoothingEnabled=scale<3;target.draw(ctx,bounds,scale*dpr);}
   gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,textures[i]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);
  }
  rawGeometry=geometryKey;rawComplete=complete;}
  const windows=[camera.scale,Math.sqrt(zoom*camera.scale),zoom].map(scale=>{const extent=radius/scale;return[x-extent,y-extent,extent*2,extent*2];});
  const sweeping=!!scan.active,parameters=JSON.stringify(settings.effects),effectKey=geometryKey+parameters;wantedEffect=effectsActive&&localMode?effectKey:'';
  // A bounded overview accompanies the two native detail patches during B.
  // Its image coordinates remain valid while the pointer moves; no full-image
  // pipeline or moving-pointer cancellation is needed for every sweep value.
  const overviewScale=side/Math.max(source.width,source.height);
  if(sweeping){const key=[source.width,source.height,side,scanEpoch].join(':');if(scanPreviewKey!==key){
   scanPreview.width=scanPreview.height=side;const ctx=scanPreview.getContext('2d'),bounds={left:0,top:0,right:source.width,bottom:source.height},target=scanFork??source;
   scanPreviewReady=!target.prepare||target.prepare(bounds,overviewScale);ctx.setTransform(overviewScale,0,0,overviewScale,0,0);target.draw(ctx,bounds,overviewScale);scanPreviewKey=key;
  }}
  const scanPresented=sweeping&&effectSource===source&&completedParameters===parameters;
  if(effectsActive&&localMode&&(sweeping?scanPreviewReady:complete)&&!effectBusy&&!scanPresented&&submittedEffect!==effectKey){
   submittedEffect=effectKey;effectBusy=true;onEffectsState({busy:true});
   const input=source,rectangles=windows.map(v=>[...v]);if(sweeping)rectangles[0]=[0,0,side/overviewScale,side/overviewScale];
   const pixels=()=>scratch.map((c,i)=>sweeping&&i>0&&!rawReady[i]?{width:side,height:side,data:new Uint8ClampedArray(side*side*4)}:{width:side,height:side,data:(sweeping&&i===0?scanPreview:c).getContext('2d').getImageData(0,0,side,side).data});
   const scanFrames=sweeping?pixels():null;
   const capture=()=>{if(disposed||source!==input||!sweeping&&wantedEffect!==effectKey)throw Object.assign(Error('Superseded loupe view'),{code:'CANCELLED'});return scanFrames??pixels();};
   loupeEffectQueue.run(geometryKey+(sweeping?':scan:'+scanEpoch:''),settings.effects,capture,owner).then(result=>{
    if(!disposed&&result&&source===input&&wantedEffect&&(sweeping||rawGeometry===geometryKey)){effectResult=result.frames;effectSource=input;effectWindows=rectangles;effectScanned=sweeping;effectGeometry=geometryKey;completedEffect=effectKey;completedParameters=parameters;lastMetrics=result.metrics;onEffectsState({busy:JSON.stringify(settings.effects)!==parameters,metrics:lastMetrics});}
   }).catch(error=>{if(!disposed&&wantedEffect===effectKey&&error.code!=='CANCELLED'){scan.stop();onEffectsState({busy:false,error});}}).finally(()=>{effectBusy=false;if(!disposed){if(submittedEffect!==wantedEffect)submittedEffect='';requestDraw();}});
  }
  let ready=effectsActive&&(localMode||!fullImage.current)&&effectResult&&effectSource===source&&(effectGeometry===geometryKey||effectScanned),sampleWindows=effectWindows??windows;
  if(ready&&uploadedEffects!==effectResult){for(let i=0;i<3;i++){gl.activeTexture(gl.TEXTURE0+3+i);gl.bindTexture(gl.TEXTURE_2D,textures[3+i]);const f=effectResult[i];gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,f.width,f.height,0,gl.RGBA,gl.UNSIGNED_BYTE,f.data);}uploadedEffects=effectResult;}
  if(effectsActive&&(!localMode||!ready)&&fullImage.current?.source===source){
   // A complete overview is always available, even while a new detailed read
   // arrives. Movement changes texture coordinates, never the effect pipeline.
   const uploadKey=geometryKey+':'+fullImage.current.id+':'+fullRevision;
   if(fullUpload!==uploadKey){for(let i=0;i<3;i++){
    const c=fullScratch[i];if(c.width!==side)c.width=c.height=side;const ctx=c.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,side,side);
    const scale=i===0?camera.scale:i===1?Math.sqrt(zoom*camera.scale):zoom,extent=radius/scale,bounds={left:x-extent,top:y-extent,right:x+extent,bottom:y+extent};
    ctx.setTransform(scale*dpr,0,0,scale*dpr,side/2-x*scale*dpr,side/2-y*scale*dpr);ctx.imageSmoothingEnabled=scale<3;fullImage.draw(ctx,bounds,scale*dpr,i);
    gl.activeTexture(gl.TEXTURE0+3+i);gl.bindTexture(gl.TEXTURE_2D,textures[3+i]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);
   }fullUpload=uploadKey;uploadedEffects=null;}
   ready=true;sampleWindows=windows;lastMetrics={scope:'image',...fullImage.metrics};
  }else fullUpload='';
  gl.uniform1f(gl.getUniformLocation(program,'effectsReady'),ready?1:0);
  gl.uniform2f(gl.getUniformLocation(program,'imageCentre'),x,y);gl.uniform1f(gl.getUniformLocation(program,'imageScale'),camera.scale);
  sampleWindows.forEach((rect,i)=>gl.uniform4f(gl.getUniformLocation(program,'effectWindow'+i),...rect));
  for(const [name,value]of Object.entries({radius,innerRadius:geometry.diameter/2,transition:geometry.transition,magnification:ratio}))gl.uniform1f(gl.getUniformLocation(program,name),value);
  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  if(localMode&&ready&&!effectBusy&&completedParameters===parameters)scan.presented();
 }
 const move=e=>{if(pinned&&!scan.active)return;if(!canInteract(e)){pointer=null;hide();return;}const r=view.getBoundingClientRect();pointer={x:e.clientX-r.left,y:e.clientY-r.top};lastPointer={...pointer};requestDraw();};
 const leave=()=>{if(pinned||scan.active)return;scan.stop();pointer=null;wantedEffect='';hide();};
 const wheel=e=>{if(!settings.enabled||!getSurface()||!canInteract(e))return;e.preventDefault();e.stopImmediatePropagation();move(e);if(e.shiftKey&&settings.effects.sweep.enabled){publish({effects:{...settings.effects,sweep:{...settings.effects.sweep,position:Math.max(0,Math.min(255,settings.effects.sweep.position-Math.sign(e.deltaY)*Math.max(1,Math.round(Math.abs(e.deltaY)/15))))}}});return;}const camera=getCamera(),unit=e.deltaMode===1?16:e.deltaMode===2?view.clientHeight:1;const value=loupeScale(settings,camera.scale,keepVisibleAtMinimum())*Math.exp(Math.max(-1,Math.min(1,-e.deltaY*unit*.002)));settings={...settings,zoom:Math.min(3600,Math.max(loupeMinimumZoom(settings,camera.scale,keepVisibleAtMinimum()),value*100))};onZoom({...settings});requestDraw();};
 const available=e=>settings.enabled&&getSurface()&&canInteract(e)&&!typingEvent(e);
 const publish=patch=>{settings={...settings,...patch};onZoom({...settings});requestDraw();};
 const click=e=>{if(e.button!==0||!available(e))return;e.preventDefault();e.stopImmediatePropagation();move(e);if(e.detail>=2)return;clickInitial=settings.markers;clearTimeout(clickTimer);clickTimer=setTimeout(()=>{clickTimer=0;publish({markers:!clickInitial});},300);};
 const double=e=>{if(e.button!==0||!available(e))return;e.preventDefault();e.stopImmediatePropagation();clearTimeout(clickTimer);clickTimer=0;move(e);const markers=clickInitial??settings.markers;clickInitial=null;publish({zoom:100,markers,...(getCamera().scale>1?{unlock:true}:{})});};
 const keydown=e=>{if(!available(e)||e.ctrlKey||e.metaKey||e.altKey||e.isComposing)return false;const key=['ArrowUp','ArrowDown'].includes(e.key)?'diameter':['ArrowLeft','ArrowRight'].includes(e.key)?'transition':null;if(!key)return false;e.preventDefault();const direction=['ArrowUp','ArrowRight'].includes(e.key)?1:-1;publish({[key]:Math.min(key==='diameter'?2000:1000,Math.max(key==='diameter'?10:0,settings[key]+direction*(e.shiftKey?25:10)))});return true;};
 const lost=e=>{e.preventDefault();gl=null;program=null;textures=[];buffer=null;hide();};const restored=()=>{failed=false;requestDraw();};
 view.addEventListener('click',click,true);view.addEventListener('dblclick',double,true);view.addEventListener('pointermove',move);view.addEventListener('pointerleave',leave);view.addEventListener('wheel',wheel,{capture:true,passive:false});overlay.addEventListener('webglcontextlost',lost);overlay.addEventListener('webglcontextrestored',restored);
 return {get enabled(){return settings.enabled;},get sweeping(){return scan.active;},stopSweep:scan.stop,toggleSweep(group){if(scan.active){scan.stop({remember:true});return false;}if(!settings.enabled||!getSurface()||!canInteract())return false;group=group??(keepVisibleAtMinimum()?'enhance':['sweep','enhance','adjust'].find(key=>settings.effects[key].enabled));pointer=pointer??lastPointer??{x:view.clientWidth/2,y:view.clientHeight/2};publish({zoom:Math.max(settings.zoom,Math.min(3600,Math.round(getCamera().scale*100)+1))});return scan.start(group);},anchor(){const r=view.getBoundingClientRect(),p=pointer??lastPointer??{x:view.clientWidth/2,y:view.clientHeight/2};return{x:r.left+p.x,y:r.top+p.y};},pin(value){pinned=value;if(value){pointer=pointer??lastPointer??{x:view.clientWidth/2,y:view.clientHeight/2};view.classList.remove('loupe-magnifying');fullImage.cancel();}requestDraw();},diagnostics(){return{pinned,pointer,sweeping:scan.active,side:overlay.width,effectBusy,effectsReady:!!effectResult||!!fullImage.current,settled:localMode?(scan.active?completedParameters===JSON.stringify(settings.effects):completedEffect===wantedEffect)&&!effectBusy:fullImage.settled,metrics:lastMetrics,fullImage:fullImage.metrics};},prepareImage:(input,effects,onChange)=>fullImage.acquire(input,effects,onChange),cancelImage:()=>fullImage.cancel(),set(value){settings=validateLoupeSettings(value);scan.observe();if(!hasLoupeEffects(settings.effects)){wantedEffect='';effectResult=null;submittedEffect='';loupeEffectQueue.cancel(owner);fullImage.cancel();onEffectsState({busy:false});}if(!settings.enabled){wantedEffect='';effectResult=null;submittedEffect='';loupeEffectQueue.cancel(owner);hide();clearTimeout(clickTimer);clickInitial=null;detachSource(false);}requestDraw();},draw:requestDraw,keydown,hide,dispose(){scan.stop();disposed=true;wantedEffect='';effectResult=null;loupeEffectQueue.cancel(owner);clearTimeout(clickTimer);hide();cancelAnimationFrame(frame);detachSource();fullImage.dispose();view.removeEventListener('click',click,true);view.removeEventListener('dblclick',double,true);view.removeEventListener('pointermove',move);view.removeEventListener('pointerleave',leave);view.removeEventListener('wheel',wheel,true);if(gl){for(const texture of textures)gl.deleteTexture(texture);gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();}for(const c of [...scratch,...fullScratch,scanPreview])c.width=c.height=0;overlay.remove();rings.remove();}};
}
