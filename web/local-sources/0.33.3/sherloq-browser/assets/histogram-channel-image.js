import {createRemoteSurface} from './remote-surface.js?v=0.33.3';
import {gray} from './unified-engine/src/pixel-utils.js';
import {sensorFilterName} from './unified-engine/src/raw-sensor-facts.js';

// A display consumer, never a replacement for scientific samples or an ICC
// transform. Composite RGB/CMYK uses the existing, color-managed SDR partner.
// Isolated native channels show their actual amplitudes, tinted by channel.
const MiB=1024**2;
const channelIndex=curve=>({red:0,green:1,blue:2,black:3})[curve]??-1;
function settingsFor(p,{curve,range=[0,p.depth===16?65535:255]}={}){
 const sensor=p.sensor,cfa=sensor?.kind==='cfa'&&(sensor.cfa.filterCode===9||sensor.cfa.filterCode>=1000),pattern=[];
 if(cfa)for(let y=0;y< (sensor.cfa.filterCode===9?6:8);y++)for(let x=0;x<(sensor.cfa.filterCode===9?6:2);x++)pattern.push(({R:0,G:1,B:2})[sensorFilterName(sensor,x,y)]??3);
 return{curve,index:channelIndex(curve),low:range[0],span:range[1]-range[0]||1,space:p.space??'RGB',channels:p.channels??3,cfa,pattern,columns:cfa?(sensor.cfa.filterCode===9?6:2):1,rows:cfa?(sensor.cfa.filterCode===9?6:8):1,x:p.origin?.x??0,y:p.origin?.y??0,step:p.samplingStep??1};
}
export function histogramImageRgba(p,selection,target=new Uint8ClampedArray(p.width*p.height*4)){
 const s=settingsFor(p,selection),count=p.width*p.height,C=s.channels;
 if(!p.data||p.data.length!==count*C||target.length!==count*4)throw Error('Histogram display samples differ from their grid.');
 const code=v=>Math.round(Math.max(0,Math.min(1,Number.isFinite(v)?(v-s.low)/s.span:0))*255);
 for(let i=0;i<count;i++){
  const j=i*C,k=i*4;let r=0,g=0,b=0;
  if(C===1&&!s.cfa){r=g=b=code(p.data[j]);}
  else if(s.curve==='gray'){r=g=b=gray(p.data[j],p.data[j+1],p.data[j+2]);}
  else if(s.cfa){const filter=s.pattern[((s.y+Math.floor(i/p.width)*s.step)%s.rows)*s.columns+(s.x+i%p.width*s.step)%s.columns],v=code(p.data[j]);if(s.index<0||s.index===filter){if(filter===0)r=v;else if(filter===1)g=v;else if(filter===2)b=v;else r=g=b=v;}}
  else if(s.space==='CMYK'){const v=code(p.data[j+Math.max(0,s.index)]);r=g=b=255;if(s.index===0)r=255-v;else if(s.index===1)g=255-v;else if(s.index===2)b=255-v;else r=g=b=255-v;}
  else if(s.space==='SENSOR'&&C===4){r=g=b=code(p.data[j+(i%p.width%2)+2*(Math.floor(i/p.width)%2)]);}
  else if(C===1){r=g=b=code(p.data[j]);}
  else if(s.index>=0){const v=code(p.data[j+s.index]);if(s.index===0)r=v;else if(s.index===1)g=v;else b=v;}
  else{r=code(p.data[j]);g=code(p.data[j+1]);b=code(p.data[j+2]);}
  target[k]=r;target[k+1]=g;target[k+2]=b;target[k+3]=255;
 }
 return target;
}
const vertex=`#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}`;
function fragment(floating){return`#version 300 es
precision highp float;precision highp int;precision highp ${floating?'sampler2D':'usampler2D'};
uniform ${floating?'sampler2D':'usampler2D'} samples;
uniform int curve,space,channels,cfa,columns,rows,stepSize;uniform ivec2 origin,size;uniform int pattern[48];uniform vec2 bounds;
out vec4 outColor;
float code(float v){return clamp((isnan(v)||isinf(v)?0.:(v-bounds.x)/bounds.y),0.,1.);}
void main(){ivec2 q=ivec2(int(gl_FragCoord.x),size.y-1-int(gl_FragCoord.y));vec4 v=vec4(texelFetch(samples,q,0));vec3 rgb=vec3(0.);
 if(channels==1&&cfa==0)rgb=vec3(code(v.r));
 else if(curve==4){float y=clamp(floor((dot(v.rgb,vec3(9798.,19235.,3735.))+16384.)/32768.),0.,255.)/255.;rgb=vec3(y);}
 else if(cfa==1){ivec2 at=origin+q*stepSize;int f=pattern[(at.y%rows)*columns+(at.x%columns)];float z=code(v.r);if(curve<0||curve==f){if(f<3)rgb[f]=z;else rgb=vec3(z);}}
 else if(space==1){float z=code(v[max(0,curve)]);rgb=vec3(1.);if(curve<3)rgb[max(0,curve)]=1.-z;else rgb=vec3(1.-z);}
 else if(space==2&&channels==4)rgb=vec3(code(v[(q.x%2)+2*(q.y%2)]));
 else if(channels==1)rgb=vec3(code(v.r));
 else if(curve>=0)rgb[curve]=code(v[curve]);else rgb=vec3(code(v.r),code(v.g),code(v.b));
 outColor=vec4(floor(rgb*255.+.5)/255.,1.);
}`;}

export function createHistogramImageRenderer({document=globalThis.document}={}){
 let backing,gl,texture,vao,lost=false,disposed=false;const programs=new Map();
 const metrics={renders:0,gpuFrames:0,cpuFrames:0,lastMilliseconds:0};
 function initialize(){
  if(disposed||lost)return null;if(gl)return gl;backing=document.createElement('canvas');
  gl=backing.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true});
  if(!gl){lost=true;backing.width=backing.height=0;return null;}
  backing.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;});
  texture=gl.createTexture();vao=gl.createVertexArray();gl.bindVertexArray(vao);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.disable(gl.DITHER);return gl;
 }
 function program(floating){
  if(programs.has(floating))return programs.get(floating);
  const shaders=[];let p;
  try{for(const [type,source]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment(floating)]]){const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));}p=gl.createProgram();for(const s of shaders)gl.attachShader(p,s);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));programs.set(floating,p);return p;}catch(e){if(p)gl.deleteProgram(p);throw e;}finally{for(const s of shaders)gl.deleteShader(s);}
 }
 return{
  metrics,
  async render(p,selection){
   const at=performance.now(),s=settingsFor(p,selection),canvas=document.createElement('canvas');canvas.width=p.width;canvas.height=p.height;const ctx=canvas.getContext('2d');let gpu=false;
   try{if(initialize()){
    const floating=p.data instanceof Float32Array,C=s.channels,P=program(floating);backing.width=p.width;backing.height=p.height;gl.viewport(0,0,p.width,p.height);gl.useProgram(P);gl.bindVertexArray(vao);gl.bindTexture(gl.TEXTURE_2D,texture);
    const layouts=floating?[[gl.R32F,gl.RED],[gl.RG32F,gl.RG],[gl.RGB32F,gl.RGB],[gl.RGBA32F,gl.RGBA]]:p.data.BYTES_PER_ELEMENT===2?[[gl.R16UI,gl.RED_INTEGER],[gl.RG16UI,gl.RG_INTEGER],[gl.RGB16UI,gl.RGB_INTEGER],[gl.RGBA16UI,gl.RGBA_INTEGER]]:[[gl.R8UI,gl.RED_INTEGER],[gl.RG8UI,gl.RG_INTEGER],[gl.RGB8UI,gl.RGB_INTEGER],[gl.RGBA8UI,gl.RGBA_INTEGER]],l=layouts[C-1];
    gl.texImage2D(gl.TEXTURE_2D,0,l[0],p.width,p.height,0,l[1],floating?gl.FLOAT:p.data.BYTES_PER_ELEMENT===2?gl.UNSIGNED_SHORT:gl.UNSIGNED_BYTE,p.data);
    const loc=n=>gl.getUniformLocation(P,n);gl.uniform1i(loc('samples'),0);gl.uniform1i(loc('curve'),s.curve==='gray'?4:s.index);gl.uniform1i(loc('space'),s.space==='CMYK'?1:s.space==='SENSOR'?2:0);gl.uniform1i(loc('channels'),C);gl.uniform1i(loc('cfa'),s.cfa?1:0);gl.uniform1i(loc('columns'),s.columns);gl.uniform1i(loc('rows'),s.rows);gl.uniform1i(loc('stepSize'),s.step);gl.uniform2i(loc('origin'),s.x,s.y);gl.uniform2i(loc('size'),p.width,p.height);gl.uniform2f(loc('bounds'),s.low,s.span);gl.uniform1iv(loc('pattern[0]'),new Int32Array([...s.pattern,...Array(48-s.pattern.length).fill(0)]));gl.drawArrays(gl.TRIANGLES,0,3);
    if(gl.getError()!==gl.NO_ERROR||gl.isContextLost())throw Error('Histogram GPU presentation unavailable.');ctx.drawImage(backing,0,0);
    // Only the bounded SDR canvas survives publication. Release the native
    // texture and render target before acknowledging the captured sample loan.
    gl.texImage2D(gl.TEXTURE_2D,0,gl.R8UI,1,1,0,gl.RED_INTEGER,gl.UNSIGNED_BYTE,null);backing.width=backing.height=1;
    const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();
    try{if(!fence)throw Error('Histogram GPU completion unavailable.');for(;;){const status=gl.clientWaitSync(fence,0,0);if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED)break;if(status===gl.WAIT_FAILED||gl.isContextLost())throw Error('Histogram GPU presentation lost.');await new Promise(resolve=>setTimeout(resolve,1));}}finally{if(fence)gl.deleteSync(fence);}gpu=true;
   }}catch(error){lost=true;metrics.gpuFallback=error.message;if(gl)gl.getExtension('WEBGL_lose_context')?.loseContext();if(backing)backing.width=backing.height=1;}
   if(!gpu){const im=ctx.createImageData(p.width,p.height);histogramImageRgba(p,selection,im.data);ctx.putImageData(im,0,0);metrics.cpuFrames++;}else metrics.gpuFrames++;
   metrics.renders++;metrics.lastMilliseconds=performance.now()-at;return canvas;
  },
  dispose(){if(disposed)return;disposed=true;if(gl){for(const p of programs.values())gl.deleteProgram(p);gl.deleteTexture(texture);gl.deleteVertexArray(vao);gl.getExtension('WEBGL_lose_context')?.loseContext();}programs.clear();if(backing)backing.width=backing.height=0;gl=null;}
 };
}

export function createHistogramChannelImage({source,reader,curve,sensor=false,range,cache,renderer,document,changed,onError=()=>{},onRead=()=>{},isCurrent=()=>true}){
 const capability=reader?.capability,channels=capability?.channels?.length??3,bytes=capability?.sampleType==='float32'?4:capability?.depth===16?2:1;
 // The same 48 MiB native UI envelope includes retained histogram arrays.
 // Leave at least16MiB for those arrays/rows, and bound both sample and GPU
 // texture plus two display backings. There is no original image-size cap.
 const maximumDisplayPixels=Math.min(1024**2,Math.floor(24*MiB/(2*channels*bytes+8))),width=sensor?capability.width:source.width,height=sensor?capability.height:source.height;
 let closed=false;const pending=new Set();
 const display={width,height,format:'rgb8',maximumDisplayPixels,samplingPeriod:sensor&&capability.sensor?.kind==='cfa'?(capability.sensor.cfa.filterCode===9?6:2):1};
 const request=(action,{tile})=>{
  if(action!=='read-display')throw Error('A histogram channel image is a display-only surface.');
  const task=(async()=>{let pixels;
   try{if(closed||!isCurrent())throw Object.assign(Error('Histogram display changed.'),{code:'CANCELLED'});
    pixels=reader?await reader.readSampledPixels(tile):await source.readSampledDisplayPixels(tile);
    if(closed||!isCurrent())throw Object.assign(Error('Histogram display changed.'),{code:'CANCELLED'});
    const canvas=await renderer.render(pixels,{curve,range});onRead({curve,native:!!reader,sensor,...renderer.metrics});return{canvas};
   }finally{if(pixels&&reader)await reader.releasePixels?.(pixels);}
  })();pending.add(task);void task.then(()=>pending.delete(task),()=>pending.delete(task));return task;
 };
 const surface=createRemoteSurface(display,cache,request,changed,onError),close=surface.close;
 surface.parameterPreviewCurrent=()=>!closed&&isCurrent();surface.histogramChannel=curve;surface.histogramSensor=sensor;
 surface.close=()=>{closed=true;close();return Promise.allSettled([...pending]).then(results=>{const failed=results.find(x=>x.status==='rejected'&&x.reason?.code!=='CANCELLED');if(failed)throw failed.reason;});};
 return surface;
}
