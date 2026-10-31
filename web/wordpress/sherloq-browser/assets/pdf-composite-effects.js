import {createLoupeImageCache} from './pdf-native-effects.js?v=0.31.0';
import {validateLoupeEffects} from './loupe-effects-settings.js?v=0.31.0';
const cancelled=()=>Object.assign(Error('PDF display effect replaced.'),{code:'CANCELLED'});
const nativeSpan=(pixels,scale)=>{const value=pixels/scale;return value*scale>pixels?value-Math.abs(value)*Number.EPSILON:value;};
// Neighbourhood arithmetic has a finite halo. Only statistics need the whole
// fixed domain; neither sharpening nor a display zoom requires a full result.
export const pdfGlobalEffects=e=>e.enhance.enabled||e.adjust.enabled&&(e.adjust.equalize>0||e.adjust.threshold===0);
export function createPdfCompositeEffectService({memoryBudgetBytes}={}){
 const cache=createLoupeImageCache({memoryBudgetBytes});
 return{acquire:(input,effects,changed)=>cache.acquire(input,effects,changed),suspend:()=>cache.cancel(),resume:()=>cache.resume(),close:()=>cache.dispose()};
}
export async function pdfCompositePixels(source,{bounds,scale,signal}){
 signal?.throwIfAborted();if(source.samplePixels)return source.samplePixels({bounds,scale,signal});
 const [x,y,w,h]=bounds,width=Math.ceil(w*scale),height=Math.ceil(h*scale);await source.ready({left:x,top:y,right:x+w,bottom:y+h},scale);signal?.throwIfAborted();
 const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d',{willReadFrequently:true});
 try{ctx.fillStyle='white';ctx.fillRect(0,0,width,height);ctx.setTransform(scale,0,0,scale,-x*scale,-y*scale);source.draw(ctx,{left:x,top:y,right:x+w,bottom:y+h},scale);
  const rgba=ctx.getImageData(0,0,width,height).data,data=new Uint8Array(width*height*3);for(let a=0,b=0;a<rgba.length;a+=4,b+=3){data[b]=rgba[a];data[b+1]=rgba[a+1];data[b+2]=rgba[a+2];}return{width,height,format:'rgb8',data};
 }finally{canvas.width=canvas.height=0;}
}
export const pdfNativePixels=(source,rect,density)=>pdfCompositePixels(source,{bounds:[rect.x/density,rect.y/density,nativeSpan(rect.width,density),nativeSpan(rect.height,density)],scale:density});
// One immutable native grid, shared by every zoom of a given result. Effects
// precede the single final display sampling, just as for native image loupes.
export function createPdfCompositeEffects({source,effects,service,changed=()=>{},onError=()=>{},density=1,fixedSource,sourceCache}={}){
 if(!(Number.isFinite(density)&&density>=1))throw new RangeError('A fixed native PDF density is required.');
 const value=validateLoupeEffects(effects),effectsKey=JSON.stringify(value),held=source.fork(),width=source.width,height=source.height;
 let references=1,sourceReferences=1,closed=false,disposed=false,lease=null,failure=null,revision=0,phase='preparing',interactive=false;
 const releaseSource=()=>{if(--sourceReferences===0)held.close();};
 const readSource=rect=>pdfNativePixels(held,rect,density);
 const input={width:fixedSource?.width??Math.ceil(width*density),height:fixedSource?.height??Math.ceil(height*density),
  retain(){sourceReferences++;},release:releaseSource,
  readPixels:rect=>fixedSource?fixedSource.read(rect):sourceCache?sourceCache.readPixels(rect).catch(error=>{if(sourceCache.metrics.closed&&error.code==='CANCELLED')return readSource(rect);throw error;}):readSource(rect)};
 const notify=error=>{if(disposed)return;if(error&&error.code!=='CANCELLED'){failure=error;phase='failed';onError(error);}else{revision++;changed();}};
 const task=service.acquire(input,value,notify).then(result=>{if(disposed){result.close();throw cancelled();}lease=result;lease.setInteractive?.(interactive);phase='ready';notify();return result;}).catch(error=>{if(!disposed&&error.code!=='CANCELLED')notify(error);throw error;});
 task.catch(()=>{});
 const nativeBounds=b=>({left:b.left*density,top:b.top*density,right:b.right*density,bottom:b.bottom*density,...(b.circle?{circle:{x:b.circle.x*density,y:b.circle.y*density,radius:b.circle.radius*density}}:{})});
 const prepare=(bounds,scale=1)=>{if(disposed||failure)return false;return !!lease&&lease.prepare(nativeBounds(bounds),scale/density);};
 const draw=(ctx,bounds,scale=1)=>{if(disposed||!lease)return;ctx.save();try{ctx.scale(1/density,1/density);lease.draw(ctx,nativeBounds(bounds),scale/density);}finally{ctx.restore();}};
 const ready=async(bounds,scale=1)=>{if(disposed)throw cancelled();if(failure)throw failure;const result=await task;await result.ready(nativeBounds(bounds),scale/density);if(disposed)throw cancelled();};
 async function readPixels(rect){
  if(disposed)throw cancelled();if(![rect.x,rect.y,rect.width,rect.height].every(Number.isSafeInteger)||rect.x<0||rect.y<0||rect.width<1||rect.height<1||rect.x+rect.width>width||rect.y+rect.height>height)throw new RangeError('Invalid PDF effect export window.');
  if(rect.width*rect.height>4*1024**2)throw Object.assign(Error('Native PDF export window exceeds its bounded working grid.'),{code:'PDF_RENDER_LIMIT'});
  const bounds={left:rect.x,top:rect.y,right:rect.x+rect.width,bottom:rect.y+rect.height};await ready(bounds);
  const canvas=new OffscreenCanvas(rect.width,rect.height),ctx=canvas.getContext('2d',{willReadFrequently:true});
  try{ctx.fillStyle='white';ctx.fillRect(0,0,rect.width,rect.height);ctx.translate(-rect.x,-rect.y);draw(ctx,bounds);
   const rgba=ctx.getImageData(0,0,rect.width,rect.height).data,data=new Uint8Array(rect.width*rect.height*3);for(let a=0,b=0;a<rgba.length;a+=4,b+=3){data[b]=rgba[a];data[b+1]=rgba[a+1];data[b+2]=rgba[a+2];}if(disposed)throw cancelled();return{width:rect.width,height:rect.height,format:'rgb8',data};
  }finally{canvas.width=canvas.height=0;}
 }
 function release(){if(--references)return;disposed=true;lease?.close();void task.then(releaseSource,releaseSource);}
 const target={owner:source.owner,width,height,native:true,nativePdf:true,effectsKey,get revision(){return revision;},get presentationRevision(){return lease?.presentationRevision??0;},
  get composition(){return{grid:'fixed-native-effect-tiles',wholeComposite:true,classificationApplied:false,protectedPixels:0,guarded:false,partial:false};},
  get metrics(){return{...lease?.metrics,nativePdf:true,phase,preparation:phase,wholeComposite:true,classificationApplied:false,grid:'fixed-native-effect-tiles',globalDomain:pdfGlobalEffects(value)?[input.width,input.height]:null,nativeDensity:density,nativeWidth:input.width,nativeHeight:input.height,cacheBytes:lease?.byteLength??0,nativeReads:lease?.nativeReads??0};},
  setInteractive(value){interactive=!!value;lease?.setInteractive?.(interactive);},prepare,ready,draw,readPixels,fork(){if(disposed)throw cancelled();references++;let released=false;return{owner:target.owner,width,height,native:true,nativePdf:true,effectsKey,get revision(){return revision;},get presentationRevision(){return lease?.presentationRevision??0;},get metrics(){return target.metrics;},get composition(){return target.composition;},setInteractive:value=>{if(!released)target.setInteractive(value);},prepare:(...a)=>!released&&prepare(...a),ready:(...a)=>released?Promise.reject(cancelled()):ready(...a),draw:(...a)=>{if(!released)draw(...a);},readPixels:r=>released?Promise.reject(cancelled()):readPixels(r),fork:()=>{if(released)throw cancelled();return target.fork();},close(){if(released)return;released=true;release();}};},close(){if(closed)return;closed=true;release();}};
 return target;
}

