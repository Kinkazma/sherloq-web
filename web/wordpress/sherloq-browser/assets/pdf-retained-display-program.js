import {SherloqPdfCanvasGraphics as NativeCanvasGraphics,SherloqPdfObjects as NativeObjects,SHERLOQ_PDF_NATIVE_DISPLAY_INTERFACE as nativeBinding} from './pdf-native-library.js';
// Retained display program, pinned to the vendored PDF.js implementation.
// Native Canvas/decoder heap
// is not claimed to be completely measurable by the JS cache accounting.
import {retireCompositeOwners} from './unified-engine/src/composite-owner-release.js';
import {createAccountedNativeCanvasFactory,nativeCanvasBytes} from './pdf-retained-display-factory.js';
const locks=new WeakMap();
const cancelled=()=>Object.assign(new Error('Retained PDF program is closed or cancelled.'),{code:'CANCELLED'});
const check=signal=>{if(signal?.aborted)throw signal.reason??cancelled();};
async function documentLock(key,signal){
 const previous=locks.get(key)??Promise.resolve();let release;const gate=new Promise(r=>{release=r;}),tail=previous.then(()=>gate);locks.set(key,tail);await previous;
 let held=true;const unlock=()=>{if(!held)return;held=false;release();if(locks.get(key)===tail)locks.delete(key);};
 try{check(signal);return unlock;}catch(error){unlock();throw error;}
}
function camera(request,maxPixels){
 const b=request?.bounds,s=request?.scale;
 if(!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)||b[2]<=0||b[3]<=0||!Number.isFinite(s)||s<=0)throw new RangeError('Invalid PDF window.');
 const width=Math.ceil(b[2]*s),height=Math.ceil(b[3]*s),pixels=width*height;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||!Number.isSafeInteger(pixels)||pixels>maxPixels)throw new RangeError('PDF window exceeds its admitted pixel limit.');
 return{bounds:[...b],scale:s,width,height};
}
export function createRetainedPdfProgram(page,input,{version,build,signal,maxPixels=4*1024**2,budget,onInitialPaint}={}){
 if(onInitialPaint!==undefined&&typeof onInitialPaint!=='function')throw new TypeError('Initial PDF presentation consumer must be a function.');
 if(typeof budget?.reserve!=='function')throw new TypeError('Native retained program requires a Budget.');
 if(version!=='5.6.205'||build!=='ada343803'||nativeBinding?.version!==version||nativeBinding?.build!==build||nativeBinding?.revision!==1||nativeBinding?.upstreamSha256!=='2221020ea508479dcc1221f36f2731656339230097c69ba1f78802832c0ad685')throw new Error('Unqualified native PDF display version.');
 const record={id:String(input?.id),width:input?.width,height:input?.height};
 if(![record.width,record.height,maxPixels].every(v=>Number.isSafeInteger(v)&&v>0))throw new RangeError('Invalid native PDF page geometry.');
 const all=new Map(),copies=new Map(),keys=[],bufferReleases=new Set(),copyReleases=new Map(),reads=new Set(),renderers=new Set(),controller=new AbortController();
 let program,Program,viewport,factory,filters,content,pageColors,common,objects,transparent=false,initialized=false,closing=false,closed=false,closeTask,compilePdfCalls=0,replays=0,draws=0,filtersClosed=false,accountedBytes=0,peakAccountedBytes=0,liveFrames=0,canonicalPaints=0,canonicalPixels=0,canonicalChunks=0;
 function reserve(bytes){const drop=budget.reserve(bytes);accountedBytes+=bytes;peakAccountedBytes=Math.max(peakAccountedBytes,accountedBytes);let live=true;return()=>{if(live){drop();live=false;accountedBytes-=bytes;}};}
 function copied(bytes,create){const release=reserve(bytes);try{const result=create();bufferReleases.add(release);return result;}catch(error){release();throw error;}}
 const initializationAbort=()=>controller.abort(signal.reason??cancelled());signal?.addEventListener('abort',initializationAbort,{once:true});if(signal?.aborted)initializationAbort();
 async function clone(value,seen=new Map()){
  check(controller.signal);
  if(value===null||typeof value!=='object')return value;if(seen.has(value))return seen.get(value);
  if(typeof ImageBitmap==='function'&&value instanceof ImageBitmap||typeof VideoFrame==='function'&&value instanceof VideoFrame){
   let copy=copies.get(value);if(!copy){const release=reserve(nativeCanvasBytes(value.width??value.displayWidth,value.height??value.displayHeight));try{copy=typeof value.clone==='function'?value.clone():await createImageBitmap(value);}catch(error){release();throw error;}copies.set(value,copy);copyReleases.set(value,release);check(controller.signal);}return copy;
  }
  if(typeof Path2D==='function'&&value instanceof Path2D){const out=new Path2D(value);seen.set(value,out);return out;}
  if(ArrayBuffer.isView(value)){const out=copied(value.byteLength,()=>value instanceof DataView?new DataView(value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength)):new value.constructor(value));seen.set(value,out);return out;}
  if(value instanceof ArrayBuffer){const out=copied(value.byteLength,()=>value.slice(0));seen.set(value,out);return out;}
  const prototype=Object.getPrototypeOf(value);
  // PDF.js font objects and optional-content configuration retain their native
  // class semantics; all plain recipes/buffers/paths are copied into our owner.
  if(!Array.isArray(value)&&prototype!==Object.prototype&&prototype!==null)return value;
  const out=Array.isArray(value)?[]:Object.create(prototype);seen.set(value,out);
  for(const[k,v]of Object.entries(value))out[k]=await clone(v,seen);return out;
 }
 const initializing=(async()=>{
  const unlock=await documentLock(page.commonObjs,controller.signal),restores=[];let canvas,task,compiled,compileRelease;
  const stop=()=>task?.cancel();controller.signal.addEventListener('abort',stop,{once:true});
  try{
   check(controller.signal);compileRelease=reserve(nativeCanvasBytes(record.width,record.height));canvas=new OffscreenCanvas(record.width,record.height);const ctx=canvas.getContext('2d',{alpha:false,willReadFrequently:true});
   for(const store of[page.commonObjs,page.objs]){const original=store.get,own=Object.getOwnPropertyDescriptor(store,'get');store.get=function(id,...args){const value=original.call(this,id,...args);if(this.has(id))all.set(id,{data:original.call(this,id)});return value;};restores.push(()=>{if(own)Object.defineProperty(store,'get',own);else delete store.get;});}
   compilePdfCalls++;task=page.render({canvas:null,canvasContext:ctx,viewport:page.getViewport({scale:2}),operationsFilter:()=>{transparent=!!task._internalRenderTask.gfx.transparentCanvas;return true;}});await task.promise;check(controller.signal);compiled=task._internalRenderTask;
   if(!compiled.operatorList.lastChunk||!compiled.gfx)throw new Error('Unfinished native display program.');
   const old=compiled.gfx;if(!(old instanceof NativeCanvasGraphics)||!(page.commonObjs instanceof NativeObjects)||!(page.objs instanceof NativeObjects))throw new Error('Unqualified native PDF display binding.');Program=NativeCanvasGraphics;viewport=page.getViewport({scale:2});factory=createAccountedNativeCanvasFactory(new old.canvasFactory.constructor({ownerDocument:document,enableHWA:false}),budget);filters=new old.filterFactory.constructor({ownerDocument:document,docId:'private-retained-program-'+record.id});content=old.optionalContentConfig;pageColors=compiled.pageColors??null;common=new NativeObjects();objects=new NativeObjects();
   const seen=new Map();for(const[id,entry]of all){entry.data=await clone(entry.data,seen);(id.startsWith('g_')?common:objects).resolve(id,entry.data);keys.push(id);}
   program={fnArray:Object.freeze([...compiled.operatorList.fnArray]),argsArray:await clone(compiled.operatorList.argsArray,seen),lastChunk:true,separateAnnots:await clone(compiled.operatorList.separateAnnots,seen)};Object.freeze(program.argsArray);Object.freeze(program);check(controller.signal);if(onInitialPaint){await onInitialPaint({canvas,viewport:page.getViewport({scale:2}),width:record.width,height:record.height,signal:controller.signal});check(controller.signal);}initialized=true;
  }catch(error){if(controller.signal.aborted&&error?.name==='RenderingCancelledException')throw controller.signal.reason??cancelled();throw error;}finally{for(const restore of restores)restore();controller.signal.removeEventListener('abort',stop);signal?.removeEventListener('abort',initializationAbort);if(canvas)canvas.width=canvas.height=0;compileRelease?.();unlock();}
 })();initializing.catch(()=>{});
 function alive(readSignal){check(readSignal);if(closing)throw cancelled();}
 function make(state,context,transform,view){state.gfx=new Program(context,common,objects,factory,filters,{optionalContentConfig:content},undefined,pageColors);renderers.add(state);state.gfx.beginDrawing({transform,viewport:view,transparency:transparent,background:'rgb(255,255,255)'});return state.gfx;}
 function endRender(state){if(state.gfx&&!state.ended){state.gfx.endDrawing();state.ended=true;}}
 function retireRender(state){endRender(state);if(state.canvas)state.canvas.width=state.canvas.height=0;state.canvasRelease?.();renderers.delete(state);}

 const source={owner:'private-native-program-'+record.id,width:record.width,height:record.height,native:true,nativePdf:true,revision:1,
  prepare:()=>initialized&&!closing,
  async ready(){await initializing;alive();},
  draw(context){alive();if(!initialized)throw new Error('Native display program is not ready.');const m=context.getTransform(),state={gfx:null,canvas:null,ended:false};let primary,failed=false;replays++;context.save();context.resetTransform();try{const gfx=make(state,context,[m.a,m.b,m.c,m.d,m.e,m.f],viewport);let at=0;while(at<program.fnArray.length){const next=gfx.executeOperatorList(program,at);if(next<=at)throw new Error('Missing retained display dependency.');at=next;}draws++;}catch(error){failed=true;primary=error;throw error;}finally{try{try{retireRender(state);}catch(error){if(!failed)throw error;}}finally{context.restore();}}},
  // Paint the whole fixed reference once. Chunking happens only while reading
  // that completed Canvas, so native image sampling is never viewport-dependent.
  paintCanonical(reference,{signal:readSignal,write,maxChunkPixels=262144,maxPixels=64*1024**2,maxDimension=32767}={}){
   let grid;try{alive(readSignal);const density=reference?.density,width=reference?.width,height=reference?.height,pixels=width*height;
    if(typeof write!=='function'||!Number.isFinite(density)||density<=0||![width,height,maxChunkPixels,maxPixels,maxDimension].every(n=>Number.isSafeInteger(n)&&n>0)||width!==Math.ceil(record.width*density)||height!==Math.ceil(record.height*density)||!Number.isSafeInteger(pixels)||pixels>maxPixels||width>maxDimension||height>maxDimension)throw Object.assign(new RangeError('Canonical PDF grid is outside its admitted geometry. No density reduction was applied.'),{code:'PDF_CANONICAL_UNSUPPORTED'});
    grid={density,width,height,pixels};nativeCanvasBytes(width,height);
   }catch(error){return Promise.reject(error);}
   const task=(async()=>{await initializing;alive(readSignal);const canvasRelease=reserve(nativeCanvasBytes(grid.width,grid.height));let canvas;
    try{canvas=new OffscreenCanvas(grid.width,grid.height);if(canvas.width!==grid.width||canvas.height!==grid.height)throw new Error('Native Canvas changed canonical dimensions.');}catch(error){canvasRelease();throw error;}
    const state={gfx:null,canvas,canvasRelease,ended:false};let failed=false,primary;replays++;canonicalPaints++;
    try{const context=canvas.getContext('2d',{alpha:false,willReadFrequently:true});if(!context)throw new Error('Canonical native Canvas is unavailable.');const gfx=make(state,context,[1,0,0,1,0,0],viewport.clone({scale:2*grid.density}));let at=0;
     while(at<program.fnArray.length){alive(readSignal);const next=gfx.executeOperatorList(program,at,()=>{});if(next<=at)throw new Error('Missing retained display dependency.');at=next;if(at<program.fnArray.length)await new Promise(r=>setTimeout(r,0));}
     endRender(state);alive(readSignal);draws++;const columns=Math.min(grid.width,maxChunkPixels),rows=Math.max(1,Math.min(128,Math.floor(maxChunkPixels/columns)));
     for(let y=0;y<grid.height;y+=rows)for(let x=0;x<grid.width;x+=columns){alive(readSignal);const width=Math.min(columns,grid.width-x),height=Math.min(rows,grid.height-y),pixels=width*height,rgbaRelease=reserve(pixels*4);let rgbRelease;
      try{const rgba=context.getImageData(x,y,width,height).data;if(rgba.length!==pixels*4)throw new Error('Incomplete native canonical readback.');rgbRelease=reserve(pixels*3);const data=new Uint8Array(pixels*3);let checkpoint=performance.now();for(let row=0;row<height;row++){for(let col=0,a=row*width*4,b=row*width*3;col<width;col++,a+=4,b+=3){data[b]=rgba[a];data[b+1]=rgba[a+1];data[b+2]=rgba[a+2];}if((row&31)===31&&performance.now()-checkpoint>=8){await new Promise(r=>setTimeout(r,0));alive(readSignal);checkpoint=performance.now();}}alive(readSignal);
       await write({x,y,width,height,format:'rgb8',data},{signal:readSignal});alive(readSignal);canonicalChunks++;canonicalPixels+=pixels;
      }finally{rgbRelease?.();rgbaRelease();}
      await new Promise(r=>setTimeout(r,0));
     }
     alive(readSignal);return{...grid,bytes:grid.pixels*3};
    }catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners([()=>retireRender(state)],failed?{primary}:{});if(!failed)alive(readSignal);}
   })();reads.add(task);task.then(()=>reads.delete(task),()=>reads.delete(task));return task;
  },
  samplePixels(request,{signal:readSignal}={}){
   let wanted;try{alive(readSignal);wanted=camera(request,maxPixels);}catch(error){return Promise.reject(error);}
   const task=(async()=>{await initializing;alive(readSignal);const canvasRelease=reserve(nativeCanvasBytes(wanted.width,wanted.height));let outCanvas;try{outCanvas=new OffscreenCanvas(wanted.width,wanted.height);}catch(error){canvasRelease();throw error;}const out=outCanvas.getContext('2d',{alpha:false,willReadFrequently:true});const state={gfx:null,canvas:outCanvas,canvasRelease,ended:false};let gfx,primary,produced,failed=false;replays++;
    try{gfx=make(state,out,[1,0,0,1,-wanted.bounds[0]*wanted.scale,-wanted.bounds[1]*wanted.scale],viewport.clone({scale:2*wanted.scale}));let at=0;while(at<program.fnArray.length){alive(readSignal);const next=gfx.executeOperatorList(program,at,()=>{});if(next<=at)throw new Error('Missing retained display dependency.');at=next;if(at<program.fnArray.length)await new Promise(r=>setTimeout(r,0));}endRender(state);alive(readSignal);const rgbaRelease=reserve(nativeCanvasBytes(wanted.width,wanted.height));let rgbRelease,published=false;try{const rgba=out.getImageData(0,0,wanted.width,wanted.height).data;rgbRelease=reserve(wanted.width*wanted.height*3);const data=new Uint8Array(wanted.width*wanted.height*3);let checkpoint=performance.now();for(let y=0;y<wanted.height;y++){for(let x=0,a=y*wanted.width*4,b=y*wanted.width*3;x<wanted.width;x++,a+=4,b+=3){data[b]=rgba[a];data[b+1]=rgba[a+1];data[b+2]=rgba[a+2];}if((y&63)===63&&performance.now()-checkpoint>=8){await new Promise(r=>setTimeout(r,0));alive(readSignal);checkpoint=performance.now();}}alive(readSignal);draws++;liveFrames++;published=true;let frameLive=true;return produced={width:wanted.width,height:wanted.height,format:'rgb8',data,release(){if(frameLive){rgbRelease();frameLive=false;liveFrames--;}}};}finally{rgbaRelease();if(!published)rgbRelease?.();}}
    catch(error){failed=true;primary=error;throw error;}
    finally{try{await retireCompositeOwners([()=>retireRender(state)],failed?{primary}:{});if(!failed)alive(readSignal);}catch(error){produced?.release();throw error;}}
   })();reads.add(task);task.then(()=>reads.delete(task),()=>reads.delete(task));return task;
  },
  get metrics(){return{compilePdfCalls,replays,draws,canonicalPaints,canonicalPixels,canonicalChunks,transparent,displayOperators:program?.fnArray.length??0,resources:keys.length,nativeOriginalImages:copies.size,activeReads:reads.size,pendingRenderers:renderers.size,initialized,closing,closed,displayProgramOnly:true,accountedBytes,peakAccountedBytes,liveFrames,factory:factory?.metrics??null,accountingScope:'Logical RGBA images/canvases, copied typed buffers, RGB leases; native Path2D/font/GPU allocator overhead not measured.',resourceTypes:[...copies.values()].map(v=>({type:v.constructor.name,width:v.width??v.displayWidth,height:v.height??v.displayHeight}))};},
  close(){if(closed)return Promise.resolve();if(closeTask)return closeTask;closing=true;controller.abort(cancelled());
   closeTask=(async()=>{await initializing.catch(()=>{});await Promise.allSettled([...reads]);await retireCompositeOwners([...renderers].map(state=>()=>retireRender(state)));await retireCompositeOwners([()=>{if(filters&&!filtersClosed){filters.destroy();filtersClosed=true;}},...Array.from(copies,([original,copy])=>async()=>{await copy.close();copyReleases.get(original)?.();copyReleases.delete(original);copies.delete(original);})]);await factory?.dispose();for(const release of bufferReleases)release();bufferReleases.clear();for(const id of keys)(id.startsWith('g_')?common:objects)?.delete(id);keys.length=0;all.clear();program=null;content=null;pageColors=null;closed=true;})();closeTask.then(()=>{},()=>{closeTask=null;});return closeTask;
  }
 };
 return source;
}
