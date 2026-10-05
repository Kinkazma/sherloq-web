import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {PLOT_COLUMNS,plotStyle,plotCamera,plotMatrix,projectPlot,plotGrid} from './plot-camera.js';
const VERTEX=`#version 300 es
precision highp float;
layout(location=0) in vec3 rgb;
layout(location=1) in vec3 hsv;
uniform ivec3 axes;uniform mat4 matrix;uniform float size;uniform bool three;uniform bool colored;uniform bool grid;
out vec3 color;
float value(int a){if(a==0)return rgb.x;if(a==1)return rgb.y;if(a==2)return rgb.z;if(a==3)return hsv.x;if(a==4)return hsv.y;return hsv.z;}
void main(){vec3 pos=grid?rgb:vec3(value(axes.x),value(axes.y),three?value(axes.z):0.0);gl_Position=matrix*vec4(pos,1.0);gl_PointSize=size;color=grid?vec3(.65):(colored?rgb:vec3(31.0/255.0,119.0/255.0,180.0/255.0));}`;
const FRAGMENT=`#version 300 es
precision highp float;
in vec3 color;uniform float alpha;uniform bool grid;out vec4 outColor;
void main(){if(!grid&&distance(gl_PointCoord,vec2(.5))>.5)discard;outColor=vec4(color,grid?1.0:alpha);}`;
function program(gl,vertex=VERTEX,fragment=FRAGMENT){
 const shaders=[];let p;
 try{for(const [type,source]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new EngineError('GPU_UNAVAILABLE',gl.getShaderInfoLog(s));}
 p=gl.createProgram();for(const s of shaders)gl.attachShader(p,s);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new EngineError('GPU_UNAVAILABLE',gl.getProgramInfoLog(p));return p;
 }catch(e){if(p)gl.deleteProgram(p);throw e;}finally{for(const s of shaders)gl.deleteShader(s);}
}
// Input values or float32-table are borrowed immutable native Nx6 data; their CPU lease
// remains owned/accounted by the caller. No selected-position/color copies.
export function createPlotRenderer(canvas,{budget,chunkPoints=262144,onContextLost}={}){
 requireValue(budget?.reserve&&Number.isInteger(chunkPoints)&&chunkPoints>0&&chunkPoints<=1048576,'Plot renderer requires a shared budget and valid chunk size.');
 const baseline=budget.reserve(1024*1024);let gl,p,copyProgram,gridBuffer,framebufferRelease;
 try{gl=canvas.getContext('webgl2',{alpha:false,antialias:true,preserveDrawingBuffer:false});if(!gl)throw new EngineError('GPU_UNAVAILABLE','WebGL2 plot renderer unavailable.');p=program(gl);gridBuffer=gl.createBuffer();if(!gridBuffer)throw new EngineError('GPU_UNAVAILABLE','Plot grid allocation failed.');}catch(e){if(p)gl.deleteProgram(p);baseline();throw e;}
 const uniforms=Object.fromEntries(['axes','matrix','size','three','colored','grid','alpha'].map(n=>[n,gl.getUniformLocation(p,n)]));
 let paged=null,renderEpoch=0,values=null,buffers=[],dataRelease,disposed=false,lost=false,uploading=false,style=plotStyle(),camera=plotCamera(),width=640,height=480,pixelRatio=1;
 const stats={uploads:0,uploadedBytes:0,draws:0,points:0,gpuDataBytes:0};
 const alive=()=>{if(disposed)throw new EngineError('DISPOSED','Plot renderer disposed.');if(lost)throw new EngineError('GPU_UNAVAILABLE','Plot context lost; recreate the renderer and supply retained native values.');};
 function releaseData(){renderEpoch++;if(paged){paged.frameRelease?.();gl.deleteBuffer(paged.buffer);gl.deleteTexture(paged.texture);gl.deleteRenderbuffer(paged.depth);gl.deleteFramebuffer(paged.framebuffer);paged=null;}for(const b of buffers)gl.deleteBuffer(b.buffer);buffers=[];dataRelease?.();dataRelease=null;values=null;stats.points=0;stats.gpuDataBytes=0;}
 const lose=event=>{event.preventDefault();lost=true;releaseData();framebufferRelease?.();framebufferRelease=null;onContextLost?.();};canvas.addEventListener('webglcontextlost',lose);
 function render(){
  alive();if(paged)return renderPaged();return drawStart();}
 function drawStart(drawBuffers=true){
  alive();const matrix=plotMatrix(style,camera,width/height);gl.viewport(0,0,canvas.width,canvas.height);
  const bg=style.colored?(style.kind==='3d'?190/255:128/255):1;gl.clearColor(bg,bg,bg,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(p);gl.uniformMatrix4fv(uniforms.matrix,false,matrix);gl.uniform3i(uniforms.axes,style.x,style.y,style.z);gl.uniform1i(uniforms.three,style.kind==='3d');gl.uniform1i(uniforms.colored,style.colored);gl.uniform1f(uniforms.alpha,style.alpha);gl.uniform1f(uniforms.size,style.size*2*pixelRatio);
  gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.DEPTH_TEST);gl.enableVertexAttribArray(0);
  if(style.grid){const grid=plotGrid(style,camera);gl.uniform1i(uniforms.grid,true);gl.bindBuffer(gl.ARRAY_BUFFER,gridBuffer);gl.bufferData(gl.ARRAY_BUFFER,grid,gl.DYNAMIC_DRAW);gl.vertexAttribPointer(0,3,gl.FLOAT,false,12,0);gl.disableVertexAttribArray(1);gl.drawArrays(gl.LINES,0,grid.length/3);}
  gl.uniform1i(uniforms.grid,false);gl.enableVertexAttribArray(1);
  // Native opaque 3D uses depth; translucent retains native submission order.
  if(style.kind==='3d'&&style.alpha===1)gl.enable(gl.DEPTH_TEST);
  if(drawBuffers)for(const b of buffers){gl.bindBuffer(gl.ARRAY_BUFFER,b.buffer);gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);gl.drawArrays(gl.POINTS,0,b.count);}
  if(gl.isContextLost())throw new EngineError('GPU_UNAVAILABLE','Plot context lost.');stats.draws++;return {...stats};
 }
 function resize(w,h,ratio=globalThis.devicePixelRatio??1){
  alive();requireValue(Number.isInteger(w)&&w>0&&Number.isInteger(h)&&h>0&&Number.isFinite(ratio)&&ratio>0,'Invalid plot dimensions.');
  const pw=Math.round(w*ratio),ph=Math.round(h*ratio),max=gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);requireValue(pw>0&&ph>0&&pw<=max&&ph<=max,'Plot viewport exceeds GPU dimensions.');
  const next=budget.reserve(pw*ph*16);framebufferRelease?.();framebufferRelease=next;width=w;height=h;pixelRatio=ratio;canvas.width=pw;canvas.height=ph;return render();
 }
 const countOf=source=>source instanceof Float32Array?source.length/6:source.descriptor.rowCount;
 const readData=async(source,offset,length,signal)=>source instanceof Float32Array?{data:source.subarray(offset*6,(offset+length)*6),release(){}}:source.readRows({offset,length},{signal});
 function frameTarget(state){
  const frameRelease=budget.reserve(canvas.width*canvas.height*8);state.frameRelease?.();state.frameRelease=frameRelease;
  gl.bindTexture(gl.TEXTURE_2D,state.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,canvas.width,canvas.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.bindRenderbuffer(gl.RENDERBUFFER,state.depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,canvas.width,canvas.height);gl.bindFramebuffer(gl.FRAMEBUFFER,state.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,state.texture,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,state.depth);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new EngineError('GPU_UNAVAILABLE','Paged plot framebuffer unavailable.');state.width=canvas.width;state.height=canvas.height;
 }
 async function renderPaged({signal,onProgress,state=paged,source=values,count=countOf(source)}={}){
  alive();const epoch=++renderEpoch;
  try{
   if(state.width!==canvas.width||state.height!==canvas.height)frameTarget(state);
   gl.bindFramebuffer(gl.FRAMEBUFFER,state.framebuffer);drawStart(false);
   for(let offset=0;offset<count;offset+=state.chunk){
    checkAbort(signal);const page=await readData(source,offset,Math.min(state.chunk,count-offset),signal);
    try{if(epoch!==renderEpoch)return {...stats,superseded:true};alive();checkAbort(signal);gl.bindFramebuffer(gl.FRAMEBUFFER,state.framebuffer);gl.bindBuffer(gl.ARRAY_BUFFER,state.buffer);gl.bufferData(gl.ARRAY_BUFFER,page.data,gl.DYNAMIC_DRAW);gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);gl.drawArrays(gl.POINTS,0,page.data.length/6);stats.uploadedBytes+=page.data.byteLength;if(gl.getError()!==gl.NO_ERROR)throw new EngineError('GPU_UNAVAILABLE','Paged plot draw failed.');}finally{page.release();}
    onProgress?.({phase:'plot-render',completed:Math.min(count,offset+state.chunk),total:count});await controlCheckpoint(signal);
   }
   // Draw the accumulated texture into the possibly multisampled default
   // framebuffer. A single-sample -> multisample blit is invalid in WebGL2.
   copyProgram??=program(gl,`#version 300 es
   out vec2 uv;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));uv=p;gl_Position=vec4(p*2.0-1.0,0,1);}`,`#version 300 es
   precision highp float;in vec2 uv;uniform sampler2D pixels;out vec4 color;void main(){color=texture(pixels,uv);}`);
   gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.useProgram(copyProgram);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,state.texture);gl.uniform1i(gl.getUniformLocation(copyProgram,'pixels'),0);gl.drawArrays(gl.TRIANGLES,0,3);if(gl.getError()!==gl.NO_ERROR)throw new EngineError('GPU_UNAVAILABLE','Paged plot presentation failed.');return {...stats};
  }finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
 }
 async function setData(data,{signal,onProgress}={}){
  alive();requireValue(!uploading,'Plot upload already active.');requireValue(data instanceof Float32Array&&data.length%6===0||data?.descriptor?.format==='float32-table'&&data.descriptor.columns?.length===6&&typeof data.readRows==='function','Expected native Nx6 float32 values or paged table.');
  uploading=true;const staged=[];let reservation,state;
  try{checkAbort(signal);const count=countOf(data),bytes=count*24,room=budget.limit-budget.retained-budget.active-budget.cacheBytes;
   if(bytes+chunkPoints*24<=room){reservation=budget.reserve(bytes);for(let offset=0;offset<count;offset+=chunkPoints){
    alive();checkAbort(signal);const part=await readData(data,offset,Math.min(chunkPoints,count-offset),signal);
    try{const buffer=gl.createBuffer();if(!buffer)throw new EngineError('MEMORY_LIMIT','GPU plot allocation failed.');staged.push({buffer,count:part.data.length/6});gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,part.data,gl.STATIC_DRAW);const error=gl.getError();if(error!==gl.NO_ERROR)throw new EngineError(error===gl.OUT_OF_MEMORY?'MEMORY_LIMIT':'GPU_UNAVAILABLE','GPU rejected the plot upload.');}finally{part.release();}
    onProgress?.({phase:'upload',completed:Math.min(count,offset+chunkPoints),total:count});await controlCheckpoint(signal);
   }
   }else{
    const chunk=Math.min(chunkPoints,Math.floor((room-canvas.width*canvas.height*8-4*1024**2)/48));if(chunk<1)throw new EngineError('MEMORY_LIMIT','Paged plot GPU/CPU staging does not fit.');reservation=budget.reserve(chunk*24);state={buffer:gl.createBuffer(),framebuffer:gl.createFramebuffer(),texture:gl.createTexture(),depth:gl.createRenderbuffer(),chunk};if(!state.buffer||!state.framebuffer||!state.texture||!state.depth)throw new EngineError('GPU_UNAVAILABLE','Paged plot resources unavailable.');frameTarget(state);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
   }
   if(state)await renderPaged({signal,onProgress,state,source:data,count});
   alive();checkAbort(signal);releaseData();buffers=staged.splice(0);paged=state;state=null;dataRelease=reservation;reservation=null;values=data;stats.points=count;stats.gpuDataBytes=paged?paged.chunk*24:bytes;stats.uploads++;stats.storage=paged?'paged':'persistent';if(!paged)stats.uploadedBytes+=bytes;
   if(!paged)render();
  }finally{for(const b of staged)gl.deleteBuffer(b.buffer);if(state){state.frameRelease?.();gl.deleteBuffer(state.buffer);gl.deleteTexture(state.texture);gl.deleteRenderbuffer(state.depth);gl.deleteFramebuffer(state.framebuffer);}reservation?.();uploading=false;}
 }
 async function* exportSvg({signal,pointsPerChunk=2048}={}){
  alive();requireValue(values,'No plot data.');requireValue(Number.isInteger(pointsPerChunk)&&pointsPerChunk>0&&pointsPerChunk<=65536,'Invalid SVG chunk size.');
  const exportRelease=budget.reserve(pointsPerChunk*512);
  try{checkAbort(signal);
  const source=values,count=countOf(source),s={...style},c=plotCamera(camera),w=width,h=height,matrix=plotMatrix(s,c,w/h),bg=s.colored?(s.kind==='3d'?190:128):255;
  yield `<svg xmlns="http://www.w3.org/2000/svg" width="${w+80}" height="${h+70}" viewBox="0 0 ${w+80} ${h+70}"><title>${PLOT_COLUMNS[s.x]} / ${PLOT_COLUMNS[s.y]}${s.kind==='3d'?' / '+PLOT_COLUMNS[s.z]:''}</title><metadata>Native RGB/HSV points: ${count}; vector scatter in original submission order; projected 3D export has no depth buffer.</metadata><defs><clipPath id="plot-clip"><rect width="${w}" height="${h}"/></clipPath></defs><rect width="100%" height="100%" fill="white"/><g transform="translate(55 15)"><rect width="${w}" height="${h}" fill="rgb(${bg},${bg},${bg})"/><g clip-path="url(#plot-clip)">`;
  if(s.grid){const grid=plotGrid(s,c);let lines='';for(let i=0;i<grid.length;i+=6){const a=projectPlot(matrix,...grid.subarray(i,i+3),w,h),b=projectPlot(matrix,...grid.subarray(i+3,i+6),w,h);if(a&&b)lines+=`<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" stroke="#aaa"/>`;}yield lines;}
  for(let first=0;first<count;first+=pointsPerChunk){checkAbort(signal);let xml='';const page=await readData(source,first,Math.min(pointsPerChunk,count-first),signal);try{const data=page.data;for(let i=0;i<data.length;i+=6){const xy=projectPlot(matrix,data[i+s.x],data[i+s.y],s.kind==='3d'?data[i+s.z]:0,w,h);if(!xy)continue;const color=s.colored?`rgb(${data[i]*255},${data[i+1]*255},${data[i+2]*255})`:'rgb(31,119,180)';xml+=`<circle cx="${xy[0]}" cy="${xy[1]}" r="${s.size}" fill="${color}" fill-opacity="${s.alpha}"/>`;}}finally{page.release();}yield xml;await controlCheckpoint(signal);}
  let ticks='';if(s.kind!=='3d')for(let i=0;i<=4;i++){const t=i/4,[x0,x1,y0,y1]=c.limits;ticks+=`<text x="${t*w}" y="${h+18}" text-anchor="middle">${Number((x0+(x1-x0)*t).toPrecision(5))}</text><text x="-8" y="${h*(1-t)+4}" text-anchor="end">${Number((y0+(y1-y0)*t).toPrecision(5))}</text>`;}
  yield `</g><g font-family="sans-serif" font-size="12" fill="black">${ticks}<text x="${w/2}" y="${h+40}" text-anchor="middle">${PLOT_COLUMNS[s.x]}</text><text transform="translate(-40 ${h/2}) rotate(-90)" text-anchor="middle">${PLOT_COLUMNS[s.y]}</text>${s.kind==='3d'?`<text x="5" y="15">Z: ${PLOT_COLUMNS[s.z]}</text>`:''}</g></g></svg>`;
  }finally{exportRelease();}
 }
 try{resize(width,height,1);}catch(e){canvas.removeEventListener('webglcontextlost',lose);gl.deleteBuffer(gridBuffer);gl.deleteProgram(p);baseline();throw e;}
 return {setData,render,resize,exportSvg,
  setStyle(input){alive();style=plotStyle({...style,...input});return render();},
  setCamera(input){alive();camera=plotCamera({...camera,...input});return render();},
  resetCamera(){alive();camera=plotCamera();return render();},
  zoom2d(delta,x=.5,y=.5){alive();requireValue([delta,x,y].every(Number.isFinite),'Invalid zoom.');const [x0,x1,y0,y1]=camera.limits,f=Math.pow(.999,delta),cx=x0+x*(x1-x0),cy=y0+y*(y1-y0);camera=plotCamera({...camera,limits:[cx+(x0-cx)*f,cx+(x1-cx)*f,cy+(y0-cy)*f,cy+(y1-cy)*f]});return render();},
  snapshot(){return {style:{...style},camera:plotCamera(camera),width,height,...stats};},
  async exportPng(){await render();return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new EngineError('GPU_UNAVAILABLE','PNG export failed.')),'image/png'));},
  dispose(){if(disposed)return;disposed=true;canvas.removeEventListener('webglcontextlost',lose);releaseData();framebufferRelease?.();framebufferRelease=null;gl.deleteBuffer(gridBuffer);gl.deleteProgram(p);if(copyProgram)gl.deleteProgram(copyProgram);baseline();}
 };
}
