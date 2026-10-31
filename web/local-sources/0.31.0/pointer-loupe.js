import * as imageMedia from './media-settings.js?v=0.31.0';
import {hasLoupeEffects} from './loupe-effects-settings.js?v=0.31.0';
import {createPointerLoupe as createNativePointerLoupe,loupeMapping} from './pdf-pointer-loupe.js?v=0.31.0';
import {createLoupeImageCache} from './loupe-full-client.js?v=0.31.0';
export {loupeMapping};
let serial=0;
// The renderer, exact native tiles, statistics and seam-free assembly are shared
// with the PDF reader. Only the ordinary image's camera convention differs.
export function createPointerLoupe(view,options){
 const {getSurface,onZoom=()=>{},onEffectsState=()=>{},effectsAllowed=()=>true}=options;
 let renderer=null,settings={...imageMedia.loupeDefaults},source=null,presentation=null,raw=[],revision=0,disposed=false,effectBusy=false;
 const changed=()=>renderer?.invalidate(),rawChanged=()=>{revision++;changed();};
 const cache=createLoupeImageCache({changed,state:value=>{if(value.error){effectBusy=false;onEffectsState(value);}else if(value.busy){effectBusy=true;onEffectsState(value);}}});
 const mediaSettings={...imageMedia,storedZoom:value=>value*100,resetZoom:100};
 function detach(){for(const handle of raw)if(handle!==source)handle?.close?.();raw=[];source=null;presentation=null;cache.reset();}
 function currentSource(){
  const value=getSurface();if(value===source)return presentation;
  detach();if(!value||disposed)return null;source=value;revision=0;
  raw=Array.from({length:3},()=>value.fork?.(rawChanged)??value);
  presentation={width:value.width,height:value.height,owner:'image-loupe-'+(++serial),get previewOnly(){return source?.previewOnly===true;},get revision(){return revision;}};
  return presentation;
 }
 function effectsSurface(){
  if(!source||!effectsAllowed()||!hasLoupeEffects(settings.effects)){cache.cancel();if(effectBusy){effectBusy=false;onEffectsState({busy:false});}return null;}
  return cache.ensure(source,settings.effects)?.surface??null;
 }
 renderer=createNativePointerLoupe(view,{...options,mediaSettings,getSurface:currentSource,getRawSurface:(_source,index)=>raw[index],getEffectsSurface:effectsSurface,
  getEffectsPending:()=>cache.pending,
  onZoom:value=>{settings=value;onZoom(value);},
  onPresented:value=>{if(value.effectsKey===JSON.stringify(settings.effects)){effectBusy=false;onEffectsState({busy:false,scope:'native-region',metrics:cache.metrics});}options.onPresented?.(value);},
  getEffectsState:()=>({fullImage:cache.metrics,effectBusy})
 });
 return {...renderer,
  get enabled(){return renderer.enabled;},get sweeping(){return renderer.sweeping;},get visible(){return renderer.visible;},
  anchor(){const pointer=renderer.diagnostics().pointer??{x:view.clientWidth/2,y:view.clientHeight/2},rect=view.getBoundingClientRect();return{x:rect.left+pointer.x,y:rect.top+pointer.y};},
  prepareImage:(input,effects,onChange)=>cache.acquire(input,effects,onChange),cancelImage:()=>cache.cancel(),
  set(value){settings=imageMedia.validateLoupeSettings(value);if(!settings.enabled){cache.cancel();if(effectBusy){effectBusy=false;onEffectsState({busy:false});}}renderer.set(settings);},
  dispose(){if(disposed)return;disposed=true;renderer.dispose();detach();cache.dispose();}
 };
}
