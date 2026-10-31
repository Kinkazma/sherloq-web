import {createPointerLoupe} from './pdf-pointer-loupe.js?v=0.31.0';
import * as media from './media-settings.js?v=0.31.0';
import {createRemoteSurface} from './remote-surface.js?v=0.31.0';
import {TileCache} from './tiled-surface.js?v=0.31.0';
import {createToolClient} from './tool-client.js?v=0.31.0';
import {createWorkspaceEnginePool} from './workspace-engine-pool.js?v=0.31.0';

const cancelled=()=>Object.assign(Error('Placement magnifier source changed.'),{code:'CANCELLED'});
const compatible=(image,value)=>value?.file===image.blob&&value.hash===image.sourceSha256&&value.source?.width===image.width&&value.source?.height===image.height;
export function placementLoupeWorkingBytes(settings,dpr=globalThis.devicePixelRatio||1,cacheBytes=0){
 const v=media.validatePlacementLoupeSettings(settings),side=Math.ceil((v.diameter+2*v.transition)*dpr);
 if(!Number.isSafeInteger(side)||side<1||!Number.isSafeInteger(side*side*48+4*cacheBytes+4096))throw Error('Invalid placement magnifier size.');
 // Three RAW CPU frames and textures, drawing/upload temporaries and backing
 // stores. The bounded source LRU and up to three in-flight tile copies are
 // separate. These credits are held until their actual presentation is closed.
 return side*side*48+4*cacheBytes+4096;
}

/** UI pixels only. No run/configure/model entry point is used by this owner. */
export async function createPlacementLoupeSource({image,document=globalThis.document,computeProfile='maximum',engineFactory,getBorrowedSource,clientFactory=createToolClient,changed=()=>{},isCurrent=()=>true,cacheBytes=8*1024**2,onOwner=()=>{}}={}){
 let client,creditClient,owned=false,base,cache,closing,closed=false,complete=false,total=0,forget=()=>{},sourceIsCurrent=()=>true;const raw=[],credits=[],reads=new Set();let creditQueue=Promise.resolve();
 const current=()=>!closed&&isCurrent()&&sourceIsCurrent();
 const credit=bytes=>{const task=creditQueue.then(async()=>{if(!current())throw cancelled();if(bytes<=total)return;const release=await creditClient.reserveExport(bytes-total);credits.push(release);total=bytes;if(!current())throw cancelled();});creditQueue=task.catch(()=>{});return task;};
 async function close(){
  if(complete)return;if(closing)return closing;closed=true;
  const task=(async()=>{
   await creditQueue;await Promise.allSettled([...reads]);
   // A failed release leaves that exact owner reachable; successes are removed.
   while(raw.length){await raw[0].close?.();raw.shift();}
   if(base){await base.close?.();base=null;}if(cache){cache.release('');cache=null;}
   if(owned&&client){await client.dispose();client=null;}
   while(credits.length){await credits[0]();credits.shift();}total=0;
   if(owned&&creditClient){await creditClient.dispose();creditClient=null;}complete=true;forget();
  })();closing=task;try{return await task;}finally{if(closing===task)closing=null;}
 }
 const owner={width:image.width,height:image.height,owner:'placement/'+image.id+'/'+image.sourceSha256,raw:index=>raw[index],async reserve(settings,dpr){await credit(placementLoupeWorkingBytes(settings,dpr,cacheBytes));},close,get ownedBytes(){return total;}};
 const forgotten=onOwner(owner);if(typeof forgotten==='function')forget=forgotten;
 try{
  const borrowed=await getBorrowedSource?.(image);
  if(borrowed&&compatible(image,borrowed)){
   sourceIsCurrent=borrowed.isCurrent??sourceIsCurrent;creditClient=await borrowed.getClient();if(!current())throw cancelled();
   // The Original owner is never closed. Only this presentation loan is owned.
   base=borrowed.source.fork?.(changed);if(!base)throw cancelled();
   cacheBytes=0;
  }else{
   owned=true;engineFactory??=createWorkspaceEnginePool();const options={computeProfile,engineFactory};creditClient=await clientFactory(options);if(!current())throw cancelled();client=await clientFactory(options);if(!current())throw cancelled();
   const source=await client.load({id:image.id,blob:image.blob});
   if(!current())throw cancelled();
   if(source.sha256!==image.sourceSha256||source.surface?.format!=='rgb8'||source.surface.width!==image.width||source.surface.height!==image.height)throw Object.assign(Error('Placement magnifier does not match the Original source.'),{code:'INVALID_INPUT'});
   await credit(4*cacheBytes+4096);cache=new TileCache(cacheBytes,changed);
   const request=(_action,{display,tile})=>{
    if(!current())return Promise.reject(cancelled());
    const task=Promise.resolve().then(()=>client.readTile(display,tile)).then(pixels=>{if(!current())throw cancelled();return{pixels};});reads.add(task);task.finally(()=>reads.delete(task)).catch(()=>{});return task;
   };
   base=createRemoteSurface(source.surface,cache,request,changed);
  }
  for(let i=0;i<3;i++){const fork=base.fork?.(changed);if(!fork)throw cancelled();raw.push(fork);}
  return owner;
 }catch(primary){try{await close();}catch(secondary){if(primary&&typeof primary==='object')primary.cleanupError=secondary;}throw primary;}
}

/** The ordinary native magnifier renderer observes editor pointers. It never
 * owns drawing, wheel navigation, source pixels, effects or scientific masks. */
export function createPlacementPointerLoupe(view,{image,getCamera,isEditing=()=>true,getSettings=()=>media.placementLoupeDefaults,onSettings=()=>{},openSettings=()=>{},closeSettings=()=>false,sourceFactory=createPlacementLoupeSource,rendererFactory=createPointerLoupe,sourceOptions={},onError=()=>{},onEnabled=()=>{},getPixelRatio=()=>globalThis.devicePixelRatio||1}={}){
 const owners=new Set();let renderer,source,start,visualClosed=false,refreshEpoch=0,disposed=false,enabled=true,epoch=0,closing,inside=false;
 const settings=()=>media.validatePlacementLoupeSettings(getSettings());
 const effective=()=>!disposed&&enabled&&isEditing();
 const nativeSettings=value=>({...media.loupeDefaults,...value,enabled:effective(),proportional:false,unlock:true,markers:false,effects:media.loupeDefaults.effects});
 const mediaSettings={...media,loupeScale:(value,scale)=>scale*value.zoom/100,loupeMinimumZoom:()=>media.placementLoupeMinimumZoom,storedZoom:(value,scale)=>value*100/scale,resetZoom:300};
 renderer=rendererFactory(view,{mediaSettings,getPixelRatio,getSurface:()=>source,getRawSurface:(_value,index)=>source.raw(index),getCamera,canInteract:()=>effective(),interactionMode:'observe',cursorMarker:'contrast',getEffectsSurface:()=>null,onZoom:value=>{onSettings(media.validatePlacementLoupeSettings(value));void refresh();},onError});
 renderer.set({...nativeSettings(settings()),enabled:false});
 async function ensureSource(){
  if(source)return source;if(start)return start;const ticket=epoch;
  const task=(async()=>{for(const owner of [...owners])await owner.close();const value=await sourceFactory({image,document:view.ownerDocument,...sourceOptions,changed:()=>renderer.invalidate(),isCurrent:()=>!disposed&&ticket===epoch,onOwner:owner=>{owners.add(owner);return()=>owners.delete(owner);}});source=value;if(disposed||ticket!==epoch){await value.close();source=null;throw cancelled();}return value;})();
  start=task;try{return await task;}finally{if(start===task)start=null;}
 }
 async function refresh(){
  if(!effective()||(!inside&&!renderer.diagnostics().pinned)){renderer.set({...nativeSettings(settings()),enabled:false});return;}
  const ticket=epoch,request=++refreshEpoch,value=settings();
  try{const owner=await ensureSource();await owner.reserve(value,getPixelRatio());if(ticket!==epoch||request!==refreshEpoch||!effective()||(!inside&&!renderer.diagnostics().pinned))return;renderer.set(nativeSettings(value));renderer.invalidate();}
  catch(error){renderer.set({...nativeSettings(value),enabled:false});if(error?.code!=='CANCELLED')onError(error);}
 }
 const move=()=>{inside=true;void refresh();},leave=()=>{inside=false;if(!renderer.diagnostics().pinned){refreshEpoch++;renderer.hide();}};
 view.addEventListener('pointermove',move);view.addEventListener('pointerleave',leave);
 const api={get enabled(){return enabled;},setEnabled(value){enabled=value===true;onEnabled(enabled);void refresh();return enabled;},toggle(){return api.setEnabled(!enabled);},refresh,
  keydown(event){if(event.key==='Escape'&&closeSettings(view.closest('dialog'))){event.preventDefault();return true;}if(media.typingEvent(event))return false;if(media.loupeKey(event)){event.preventDefault();api.toggle();return true;}if(media.loupeSettingsKey(event)){event.preventDefault();api.showSettings();return true;}return renderer.keydown(event);},
  showSettings(){openSettings({parent:view.closest('dialog'),controller:api});},pin(value){if(value)inside=true;renderer.pin(value);void refresh();},anchor(){const p=renderer.diagnostics().pointer??{x:view.clientWidth/2,y:view.clientHeight/2},r=view.getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y};},diagnostics:()=>({...renderer.diagnostics(),placement:true,enabled,ownedBytes:source?.ownedBytes??0}),
  async dispose(){if(closing)return closing;disposed=true;epoch++;closeSettings(view.closest('dialog'));renderer.set({...nativeSettings(settings()),enabled:false});view.removeEventListener('pointermove',move);view.removeEventListener('pointerleave',leave);if(!visualClosed){renderer.dispose();visualClosed=true;}
   const task=(async()=>{if(start)await start.catch(()=>{});for(const owner of [...owners])await owner.close();if(source){await source.close();source=null;}})();closing=task;try{return await task;}finally{if(closing===task)closing=null;}
  }
 };return api;
}
