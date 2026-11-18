import * as imageMedia from './media-settings.js?v=0.33.3';
import {effectDefaults,hasLoupeEffects} from './loupe-effects-settings.js?v=0.33.3';
import {createPointerLoupe as createNativePointerLoupe,loupeMapping} from './pdf-pointer-loupe.js?v=0.33.3';
import {createLoupeImageCache} from './loupe-full-client.js?v=0.33.3';
export {loupeMapping};
// Only the viewport coordinates change. Native pixels and the cache owner's
// dimensions remain those of surface, including reduced Core publications.
export function mapLoupePresentation(surface,reference){
 const x=reference.width/surface.width,y=reference.height/surface.height;let effectsKey;
 const bounds=value=>value?{left:value.left/x,top:value.top/y,right:value.right/x,bottom:value.bottom/y}:value;
 return {width:reference.width,height:reference.height,get owner(){return surface.owner;},get revision(){return surface.revision??surface.presentationRevision??0;},get presentationRevision(){return surface.presentationRevision??surface.metrics?.presentationRevision??0;},get metrics(){return surface.metrics;},get available(){return surface.available;},get effectsKey(){return effectsKey??surface.effectsKey;},set effectsKey(value){effectsKey=value;},
  setInteractive:value=>surface.setInteractive?.(value),
  prepare:(value,scale=1,options)=>surface.prepare?.(bounds(value),scale*Math.max(x,y),options),
  draw(ctx,value,scale=1){const samplingScale=scale*Math.max(x,y);ctx.save();try{ctx.scale(x,y);ctx.imageSmoothingEnabled=samplingScale<3;surface.draw(ctx,bounds(value),samplingScale);}finally{ctx.restore();}}
 };
}
let serial=0;
// The renderer, exact native tiles, statistics and seam-free assembly are shared
// with the PDF reader. Only the ordinary image's camera convention differs.
export function createPointerLoupe(view,options){
 const {getSurface,getComparisonSurface=()=>null,getComparingOriginal=()=>false,onZoom=()=>{},onEffectsState=()=>{},effectsAllowed=()=>true,getEffectsSurface:preparedEffectsSurface,getEffectsPending:preparedEffectsPending,getWorkspace}=options;
 let renderer=null,settings={...imageMedia.loupeDefaults},source=null,presentation=null,raw=[],revision=0,disposed=false,effectBusy=false,preparedTarget=undefined,rawPresentation=null,comparisonInput=null,comparisonPresentation=null,comparisonRaw=[],comparisonRevision=0,preparedMapping=null,regionalMapping=null;
 const changed=()=>renderer?.invalidate(),rawChanged=()=>{revision++;changed();};
 const cache=createLoupeImageCache({changed,getWorkspace,state:value=>{if(value.error){effectBusy=false;onEffectsState(value);}else if(value.busy){effectBusy=true;onEffectsState(value);}}});
 // These two leases reuse the maintained native tile worker and its shared
 // bounded store. Identity effects cache the actual display pixels, never
 // recompute a native Core result through the SDR effect operators.
 const rawCache=createLoupeImageCache({changed:rawChanged,state:()=>{}}),preparedCache=createLoupeImageCache({changed,state:value=>{if(value.error)onEffectsState(value);}}),comparisonCache=createLoupeImageCache({changed:()=>{comparisonRevision++;changed();},state:()=>{}});
 const mediaSettings={...imageMedia,storedZoom:value=>value*100,resetZoom:100};
 function detachComparison(){for(const handle of comparisonRaw)handle.close();comparisonRaw=[];comparisonInput=null;comparisonPresentation=null;comparisonCache.reset();}
 function detach(){detachComparison();for(const handle of raw)if(handle!==source)handle?.close?.();raw=[];source=null;presentation=null;preparedTarget=undefined;rawPresentation=null;preparedMapping=null;regionalMapping=null;cache.reset();rawCache.reset();preparedCache.reset();}
 function comparisonSource(){
  const value=getComparisonSurface();if(value!==comparisonInput){detachComparison();comparisonInput=value;}
  // Main's Original is already the raw producer; retain only one owner.
  if(!source||!value||value===source)return;
  const warmed=!value.previewOnly?comparisonCache.ensure(value,effectDefaults)?.surface:null,target=warmed??value;
  if(comparisonPresentation!==target){for(const handle of comparisonRaw)handle.close();comparisonPresentation=target;comparisonRaw=Array.from({length:3},()=>{
   const native=target.fork?.(()=>{comparisonRevision++;changed();})??target,mapped=mapLoupePresentation(native,source);
   Object.defineProperty(mapped,'revision',{get:()=>comparisonRevision+(native.revision??native.presentationRevision??0)});
   mapped.close=()=>{if(native!==target)native.close?.();};return mapped;
  });}
 }
 function currentSource(){
  if(!settings.enabled)return null;
  const value=getSurface();if(value!==source){
   detach();if(!value||disposed)return null;source=value;revision=0;
   raw=Array.from({length:3},()=>value.fork?.(rawChanged)??value);
   presentation={width:value.width,height:value.height,owner:'image-loupe-'+(++serial),get previewOnly(){return source?.previewOnly===true;},get revision(){return revision;}};
  }
  if(source&&!source.previewOnly){
   const warmed=rawCache.ensure(source,effectDefaults)?.surface;
   if(warmed&&warmed!==rawPresentation){for(const handle of raw)if(handle!==source)handle?.close?.();rawPresentation=warmed;raw=Array.from({length:3},()=>warmed.fork(rawChanged));revision++;}
  }
  comparisonSource();
  return presentation;
 }
 function effectsSurface(){
  preparedTarget=undefined;
  if(!source||!effectsAllowed()){cache.cancel();preparedCache.cancel();if(effectBusy){effectBusy=false;onEffectsState({busy:false});}return null;}
  // undefined keeps the existing SDR regional processor. null explicitly
  // waits for the native Core final and must never start an RGB8 substitute.
  preparedTarget=preparedEffectsSurface?.(source,settings.effects);
  if(preparedTarget!==undefined){
   cache.cancel();const busy=preparedEffectsPending?.()??preparedTarget===null;
   if(effectBusy!==busy){effectBusy=busy;onEffectsState({busy,scope:'core-final',metrics:preparedTarget?.metrics});}
   if(busy||!preparedTarget){preparedCache.cancel();return preparedTarget;}
   const warmed=preparedCache.ensure(preparedTarget.prefetchSource??preparedTarget,effectDefaults)?.surface;
   if(warmed){if(preparedMapping?.target!==preparedTarget||preparedMapping?.warmed!==warmed)preparedMapping={target:preparedTarget,warmed,surface:preparedTarget.mapPrefetched?.(warmed)??warmed};preparedMapping.surface.effectsKey=JSON.stringify(settings.effects);return preparedMapping.surface;}
   return preparedTarget;
  }
  preparedCache.cancel();
  if(!hasLoupeEffects(settings.effects)){cache.cancel();if(effectBusy){effectBusy=false;onEffectsState({busy:false});}return null;}
  const surface=cache.ensure(source,settings.effects)?.surface??null;
  if(surface&&(surface.width!==source.width||surface.height!==source.height)){
   if(regionalMapping?.surface!==surface||regionalMapping?.reference!==source)regionalMapping={surface,reference:source,mapped:mapLoupePresentation(surface,source)};
   return regionalMapping.mapped;
  }
  regionalMapping=null;return surface;
 }
 renderer=createNativePointerLoupe(view,{...options,mediaSettings,getSurface:currentSource,getComparingOriginal,getRawSurface:(_source,index,bounds,scale)=>{const before=comparisonRaw[index];before?.prepare(bounds,scale,{priority:'loupe'});return getComparingOriginal()&&before?before:raw[index];},getEffectsSurface:effectsSurface,
  getEffectsPending:()=>preparedTarget!==undefined?(preparedEffectsPending?.()??preparedTarget===null):cache.pending,
  onZoom:value=>{settings=value;onZoom(value);},
  onPresented:value=>{if(value.effectsKey===JSON.stringify(settings.effects)){effectBusy=false;onEffectsState({busy:false,scope:'native-region',metrics:preparedTarget!==undefined?preparedTarget?.metrics:cache.metrics});}options.onPresented?.(value);},
  getEffectsState:()=>({rawPrefetch:rawCache.metrics,comparisonPrefetch:comparisonCache.metrics,corePrefetch:preparedCache.metrics,fullImage:preparedTarget!==undefined?preparedTarget?.metrics:cache.metrics,effectBusy,preparedCore:preparedTarget!==undefined})
 });
 return {...renderer,
  get enabled(){return renderer.enabled;},get sweeping(){return renderer.sweeping;},get visible(){return renderer.visible;},
  releaseSource(){detach();renderer?.invalidate();},
  anchor(){const pointer=renderer.diagnostics().pointer??{x:view.clientWidth/2,y:view.clientHeight/2},rect=view.getBoundingClientRect();return{x:rect.left+pointer.x,y:rect.top+pointer.y};},
  prepareImage:(input,effects,onChange)=>cache.acquire(input,effects,onChange),cancelImage:()=>cache.cancel(),
  set(value){const wasEnabled=settings.enabled;settings=imageMedia.validateLoupeSettings(value);if(wasEnabled&&!settings.enabled){cache.cancel();rawCache.cancel();preparedCache.cancel();comparisonCache.cancel();if(effectBusy){effectBusy=false;onEffectsState({busy:false});}}renderer.set(settings);},
  dispose(){if(disposed)return;disposed=true;renderer.dispose();detach();cache.dispose();rawCache.dispose();preparedCache.dispose();comparisonCache.dispose();}
 };
}
