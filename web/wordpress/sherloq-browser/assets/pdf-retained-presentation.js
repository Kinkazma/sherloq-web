// Exact prepared windows shared by the page view and pointer loupe.
// No page bitmap/canonical raster is used as a fine source.
import {createRetainedProgramWindowCache} from './pdf-retained-display-cache.js?v=0.30.0';
import {retainResult} from './unified-engine/src/retained-result.js';
import {retireCompositeOwners} from './unified-engine/src/composite-owner-release.js';
import {createCooperator} from './unified-engine/src/errors.js';
const cancelled=()=>Object.assign(new Error('Retained PDF presentation released.'),{code:'CANCELLED'});
const check=signal=>{if(signal?.aborted)throw signal.reason??cancelled();};
export function createRetainedPdfPresentation(program,{budget,changed=()=>{},onError=()=>{},maxWindowPixels=4*1024**2,maxRawBytes=16*1024**2,maxPresentationBytes=32*1024**2}={}){
 if(typeof budget?.reserve!=='function'||!Number.isSafeInteger(maxPresentationBytes)||maxPresentationBytes<0)throw new TypeError('PDF presentation requires an admitted cache and Budget.');
 const cache=createRetainedProgramWindowCache(program,{budget,maxBytes:maxRawBytes,maxPixels:maxWindowPixels}),buffers=new Map(),allEntries=new Set(),pending=new Map(),tasks=new Set(),frames=new Set(),frameRetirements=new Map(),lanes=new Map(),collecting=new Map(),errors=new Map();
 let ownerReleased=false,closing=false,closed=false,closeTask,presentationRevision=0,bytes=0,peakBytes=0,clock=0,draws=0,hits=0,evictions=0,leaseSerial=0,contextLosses=0;
 const wanted=()=>new Set([...new Map([...lanes,...collecting]).values()].flatMap(keys=>[...keys]));
 function requestOf(bounds,scale,bounded=true){
  if(!bounds||![bounds.left,bounds.top,bounds.right,bounds.bottom,scale].every(Number.isFinite)||bounds.right<=bounds.left||bounds.bottom<=bounds.top||scale<=0)throw new RangeError('Invalid native PDF presentation geometry.');
  const boundsCopy=[bounds.left,bounds.top,bounds.right-bounds.left,bounds.bottom-bounds.top],width=Math.ceil(boundsCopy[2]*scale),height=Math.ceil(boundsCopy[3]*scale),pixels=width*height;
  if(!Number.isSafeInteger(pixels)||bounded&&pixels>maxWindowPixels)throw Object.assign(new RangeError('PDF presentation exceeds its admitted native window. No source reduction was applied.'),{code:'PDF_RENDER_LIMIT',details:{bounds:boundsCopy,scale,width,height,pixels,maxWindowPixels,pageWidth:program.width,pageHeight:program.height}});
  return{bounds:boundsCopy,scale,width,height,key:[...boundsCopy,scale].join(':')};
 }
 function requestsOf(bounds,scale){
  const original=requestOf(bounds,scale,false),left=Math.max(0,bounds.left),top=Math.max(0,bounds.top),right=Math.min(program.width,bounds.right),bottom=Math.min(program.height,bounds.bottom);
  if(right<=left||bottom<=top)return[];
  if(left===bounds.left&&top===bounds.top&&right===bounds.right&&bottom===bounds.bottom&&original.width*original.height<=maxWindowPixels)return[original];
  // Keep the original native sampling phase. Clipping at world zero instead
  // would change text antialiasing under a fractional camera translation.
  const phaseX=bounds.left*scale-Math.floor(bounds.left*scale),phaseY=bounds.top*scale-Math.floor(bounds.top*scale),x0=Math.floor(left*scale-phaseX),y0=Math.floor(top*scale-phaseY),x1=Math.ceil(right*scale-phaseX),y1=Math.ceil(bottom*scale-phaseY);
  const rectangle=(x,y,r,b)=>({left:(phaseX+x)/scale,top:(phaseY+y)/scale,right:(phaseX+r)/scale,bottom:(phaseY+b)/scale}),clipped=requestOf(rectangle(x0,y0,x1,y1),scale,false);
  if(clipped.width*clipped.height<=maxWindowPixels)return[clipped];
  // Keep native rasterization support around each central tile. The halo is
  // sampled at the same phase, then clipped away; it is never a resize/filter.
  // Page-owned grid and halo keys stay stable across a one-native-pixel pan.
  const edge=Math.floor(Math.sqrt(maxWindowPixels)),halo=Math.min(4,Math.max(0,Math.floor((edge-2)/4))),side=Math.max(1,edge-1-2*halo),pageX=Math.floor(-phaseX),pageY=Math.floor(-phaseY),pageRight=Math.ceil(program.width*scale-phaseX),pageBottom=Math.ceil(program.height*scale-phaseY),answer=[];
  for(let y=pageY+Math.floor((y0-pageY)/side)*side;y<y1;y+=side)for(let x=pageX+Math.floor((x0-pageX)/side)*side;x<x1;x+=side){
   const cx=Math.max(pageX,x),cy=Math.max(pageY,y),cr=Math.min(pageRight,x+side),cb=Math.min(pageBottom,y+side),request=requestOf(rectangle(Math.max(pageX,cx-halo),Math.max(pageY,cy-halo),Math.min(pageRight,cr+halo),Math.min(pageBottom,cb+halo)),scale),core=rectangle(cx,cy,cr,cb);
   request.core=[core.left,core.top,core.right-core.left,core.bottom-core.top];request.key+=':'+request.core.join(':');answer.push(request);
  }
  return answer;
 }
 function retireEntry(entry){if(!allEntries.has(entry))return;entry.canvas.removeEventListener?.('contextlost',entry.lost);entry.canvas.removeEventListener?.('contextrestored',entry.lost);entry.canvas.width=entry.canvas.height=0;entry.release();allEntries.delete(entry);if(buffers.get(entry.key)===entry)buffers.delete(entry.key);bytes-=entry.bytes;}
 function healthy(entry){if(entry.context?.isContextLost?.()){entry.lost();return false;}return allEntries.has(entry);}
 function trim(){const keep=wanted();for(const entry of [...buffers.values()].sort((a,b)=>a.used-b.used)){if(bytes<=maxPresentationBytes)break;if(keep.has(entry.key))continue;retireEntry(entry);evictions++;}}
 function retireFrame(frame){if(!frames.has(frame))return Promise.resolve();if(frameRetirements.has(frame))return frameRetirements.get(frame);const task=Promise.resolve().then(()=>frame.release()).then(()=>{frames.delete(frame);frameRetirements.delete(frame);},error=>{frameRetirements.delete(frame);throw error;});frameRetirements.set(frame,task);return task;}
 function stopUndemanded(){const keep=wanted();for(const [key,job]of pending)if(!keep.has(key))job.controller.abort(cancelled());}
 function demand(key,lane){let keys=collecting.get(lane);if(!keys){keys=new Set();collecting.set(lane,keys);queueMicrotask(()=>{if(collecting.get(lane)!==keys)return;collecting.delete(lane);lanes.set(lane,keys);stopUndemanded();trim();});}if(key!==undefined)keys.add(key);}
 function ensure(request){if(closing)return Promise.reject(cancelled());const existing=buffers.get(request.key);if(existing&&healthy(existing)){existing.used=++clock;hits++;return Promise.resolve(existing);}if(pending.has(request.key))return pending.get(request.key).promise;
  const controller=new AbortController();let operation;
  operation=(async()=>{let frame,entry,rgbaRelease,returned=false,failed=false,primary;try{
   frame=await cache.samplePixels(request,{signal:controller.signal});frames.add(frame);check(controller.signal);if(closing)throw cancelled();
   const canvasRelease=budget.reserve(frame.width*frame.height*4);let canvas;try{canvas=new OffscreenCanvas(frame.width,frame.height);}catch(error){canvasRelease();throw error;}
   entry={key:request.key,request,canvas,release:canvasRelease,bytes:frame.width*frame.height*4,used:++clock};bytes+=entry.bytes;peakBytes=Math.max(peakBytes,bytes);allEntries.add(entry);entry.lost=()=>{if(!allEntries.has(entry))return;retireEntry(entry);presentationRevision++;contextLosses++;if(!closing)changed();};canvas.addEventListener?.('contextlost',entry.lost);canvas.addEventListener?.('contextrestored',entry.lost);
   if(canvas.width!==frame.width||canvas.height!==frame.height)throw new Error('Native PDF presentation backing changed dimensions.');const context=canvas.getContext('2d',{alpha:false});entry.context=context;if(!context||context.isContextLost?.())throw new Error('Native PDF presentation backing is unavailable.');rgbaRelease=budget.reserve(frame.width*frame.height*4);const image=context.createImageData(frame.width,frame.height),cooperate=createCooperator(controller.signal);
   for(let y=0;y<frame.height;y++){await cooperate();for(let x=0,a=y*frame.width*4,b=y*frame.width*3;x<frame.width;x++,a+=4,b+=3){image.data[a]=frame.data[b];image.data[a+1]=frame.data[b+1];image.data[a+2]=frame.data[b+2];image.data[a+3]=255;}}
   context.putImageData(image,0,0);rgbaRelease();rgbaRelease=null;check(controller.signal);if(closing||!allEntries.has(entry)||context.isContextLost?.())throw cancelled();
   await retireFrame(frame);check(controller.signal);if(closing)throw cancelled();buffers.set(request.key,entry);returned=true;errors.delete(request.key);trim();if(!closing)changed();return entry;
  }catch(error){failed=true;primary=error;throw error;}finally{rgbaRelease?.();await retireCompositeOwners([()=>retireFrame(frame),()=>{if(!returned&&entry)retireEntry(entry);}],failed?{primary}:{});}})();
  const job={controller,promise:operation};pending.set(request.key,job);tasks.add(operation);operation.then(()=>{pending.delete(request.key);tasks.delete(operation);},error=>{pending.delete(request.key);tasks.delete(operation);if(!closing&&error?.code!=='CANCELLED'&&error?.name!=='AbortError'){errors.set(request.key,error);onError(error);}});return operation;
 }
 async function disposeBacking(){if(closed)return;if(closeTask)return closeTask;closing=true;for(const job of pending.values())job.controller.abort(cancelled());closeTask=(async()=>{await Promise.allSettled([...tasks]);await retireCompositeOwners([...frames].map(frame=>()=>retireFrame(frame)));await retireCompositeOwners([...allEntries].map(entry=>()=>retireEntry(entry)));await cache.close();closed=true;})();closeTask.then(()=>{},()=>{closeTask=null;});return closeTask;}
 const retained=retainResult({descriptor:{id:program.owner,revision:program.revision,width:program.width,height:program.height},dispose:disposeBacking});
 function surface(retire){const id=++leaseSerial,controller=new AbortController(),operations=new Set();let released=false,releaseTask;
  const alive=signal=>{check(signal);if(released||closing)throw cancelled();};
  const track=task=>{operations.add(task);task.then(()=>operations.delete(task),()=>operations.delete(task));return task;};
  const api={owner:program.owner,width:program.width,height:program.height,native:true,nativePdf:true,
   get revision(){return(program.revision??1)+presentationRevision;},get presentationRevision(){return presentationRevision;},
   get composition(){return{wholeComposite:true,protectedPixels:0,guarded:false,partial:false,grid:'retained-native-display-commands'};},
   prepare(bounds,scale=1,{priority='viewport'}={}){if(released||closing)return false;const requests=requestsOf(bounds,scale);if(!requests.length)demand(undefined,id+':'+priority);let ready=true;for(const request of requests){demand(request.key,id+':'+priority);const entry=buffers.get(request.key);if(entry&&healthy(entry)){entry.used=++clock;continue;}ready=false;if(!errors.has(request.key))void ensure(request).catch(()=>{});}return ready;},
   ready(bounds,scale=1,{signal:readSignal,priority='viewport'}={}){const signal=readSignal?AbortSignal.any([readSignal,controller.signal]):controller.signal;return track((async()=>{alive(signal);const requests=requestsOf(bounds,scale);if(!requests.length)demand(undefined,id+':'+priority);for(const request of requests){demand(request.key,id+':'+priority);const error=errors.get(request.key);if(error)throw error;}await Promise.all(requests.map(ensure));alive(signal);})());},
   draw(context,bounds,scale=1){if(released||closing)return false;const requests=requestsOf(bounds,scale),entries=[];for(const request of requests){const entry=buffers.get(request.key);if(!entry||!healthy(entry)){const error=errors.get(request.key);if(error)throw error;return false;}entries.push(entry);}context.save();try{context.beginPath();context.rect(0,0,program.width,program.height);context.clip();context.imageSmoothingEnabled=false;for(const entry of entries){entry.used=++clock;const request=entry.request;context.save();try{context.beginPath();context.rect(...(request.core??request.bounds));context.clip();context.drawImage(entry.canvas,request.bounds[0],request.bounds[1],entry.canvas.width/scale,entry.canvas.height/scale);}finally{context.restore();}}if(entries.length)draws++;return entries.length>0;}finally{context.restore();}},
   samplePixels(request,{signal:readSignal}={}){const signal=readSignal?AbortSignal.any([readSignal,controller.signal]):controller.signal;return track((async()=>{alive(signal);let frame,failed=false,primary,returned=false;try{frame=await cache.samplePixels(request,{signal});frames.add(frame);alive(signal);frames.delete(frame);returned=true;return frame;}catch(error){failed=true;primary=error;throw error;}finally{if(!returned&&frame)await retireCompositeOwners([()=>retireFrame(frame)],failed?{primary}:{});}})());},
   readPixels(rect,{signal}={}){return api.samplePixels({bounds:[rect.x,rect.y,rect.width,rect.height],scale:1},{signal});},
   get metrics(){return{retainedNative:true,preparation:'ready',displayProgram:true,presentationRevision,presentationBytes:bytes,presentationPeakBytes:peakBytes,presentationWindows:buffers.size,presentationPending:pending.size,pendingFrames:frames.size,draws,hits,evictions,contextLosses,cache:cache.metrics,program:program.metrics,closed,closing};},
   fork(){alive();const held=retained.lease();return surface(()=>held.dispose());},
   close(){if(releaseTask)return releaseTask;released=true;controller.abort(cancelled());for(const key of [...lanes.keys()])if(key.startsWith(id+':'))lanes.delete(key);for(const key of [...collecting.keys()])if(key.startsWith(id+':'))collecting.delete(key);stopUndemanded();releaseTask=(async()=>{await Promise.allSettled([...operations]);await retire();})();releaseTask.then(()=>{},()=>{releaseTask=null;});return releaseTask;}
  };return api;
 }
 const base=surface(()=>retained.dispose()),fork=base.fork;base.fork=()=>{if(ownerReleased)throw cancelled();return fork();};const close=base.close;base.close=()=>{ownerReleased=true;return close();};return base;
}
