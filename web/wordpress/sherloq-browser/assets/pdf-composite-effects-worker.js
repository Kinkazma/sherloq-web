import {Budget} from './unified-engine/src/cache.js';
import {adjustLocalRows,ADJUST_HEAP_BYTES} from './unified-engine/src/adjust-math.js';
import {segmentedAdjust} from './unified-engine/src/segmented-adjust.js';
import {segmentedMagnifierLarge} from './unified-engine/src/segmented-magnifier-large.js';
import {createTemporarySession} from './unified-engine/src/temporary-storage.js';
import {disposePixelStoreCaches} from './unified-engine/src/pixel-store-cache.js';
import {validateLoupeEffects,adjustmentParameters,sweepPixels} from './loupe-effects-settings.js?v=0.30.0';
const cancelled=()=>Object.assign(Error('PDF display effect replaced.'),{code:'CANCELLED'});
const encode=e=>({name:e?.name,code:e?.code??'PDF_EFFECT_FAILED',message:e?.message??String(e),stack:e?.stack});
export const usesPdfGlobalEffects=e=>e.enhance.enabled||e.adjust.enabled&&(e.adjust.sharpen>0||e.adjust.equalize>0||e.adjust.threshold===0);
export async function applyPdfPointEffects(pixels,effects,{signal}={}){
 const e=validateLoupeEffects(effects);if(usesPdfGlobalEffects(e))throw Object.assign(Error('These effects require the fixed whole-page domain.'),{code:'PDF_EFFECT_GLOBAL_DOMAIN'});
 signal?.throwIfAborted();let result=pixels;
 if(e.adjust.enabled){const p=adjustmentParameters(e.adjust),rows=Math.max(1,Math.floor((ADJUST_HEAP_BYTES-4*1024**2-256*1024)/(pixels.width*48))),data=new Uint8Array(pixels.data.length);for(let y=0;y<pixels.height;y+=rows){signal?.throwIfAborted();const count=Math.min(rows,pixels.height-y),part={...pixels,height:count,data:pixels.data.subarray(y*pixels.width*3,(y+count)*pixels.width*3)};data.set(await adjustLocalRows(part,p,0,count,{signal}),y*pixels.width*3);}for(let i=0;i<data.length;i++){let value=p.threshold<255?(data[i]>p.threshold?255:0):data[i];data[i]=p.invert?255-value:value;}result={...pixels,data};}
 if(e.sweep.enabled)result=sweepPixels(result,e.sweep);signal?.throwIfAborted();return result;
}
export function installPdfCompositeEffectsWorker(scope){
 let budget,sessionPromise,queue=Promise.resolve(),serial=0,closed=false,closing=false;const sources=new Map(),results=new Map(),reads=new Map(),controllers=new Map(),cancelledTickets=new Set(),queuedTickets=new Set();
 const post=(value,transfer)=>scope.postMessage(value,transfer??[]),check=signal=>{signal?.throwIfAborted();if(closed)throw cancelled();};
 const sourceRead=(source,rect,signal)=>new Promise((resolve,reject)=>{check(signal);const read=++serial;let release,settled=false;const cleanup=()=>{reads.delete(read);signal?.removeEventListener('abort',abort);},abort=()=>{if(settled)return;settled=true;cleanup();release?.();reject(signal.reason??cancelled());};try{release=budget.reserve(rect.width*rect.height*3);reads.set(read,{resolve:value=>{if(settled)return;settled=true;cleanup();try{check(signal);if(value?.format!=='rgb8'||value.width!==rect.width||value.height!==rect.height||!(value.data instanceof Uint8Array)||value.data.length!==rect.width*rect.height*3)throw Error('Invalid fixed PDF composite source window.');resolve({pixels:value,release});}catch(e){release();reject(e);}},reject:e=>{if(settled)return;settled=true;cleanup();release?.();reject(e);}});signal?.addEventListener('abort',abort,{once:true});post({action:'source',source,read,rect});}catch(e){settled=true;cleanup();release?.();reject(e);}});
 const temporary=()=>sessionPromise??=createTemporarySession({budget});
 async function disposeResult(id){const result=results.get(id);if(!result)return;results.delete(id);if(result.owns)await result.surface.dispose();}
 async function handle(m){if((closed||closing)&&m.action!=='close'&&m.action!=='initialize')throw cancelled();if(cancelledTickets.delete(m.ticket))throw cancelled();const controller=new AbortController();controllers.set(m.ticket,controller);try{
  if(m.action==='initialize'){budget=new Budget(m.memoryBudgetBytes);return {initialized:true};}
  if(m.action==='point'){check(controller.signal);const effects=validateLoupeEffects(m.effects),release=budget.reserve(m.pixels.data.byteLength*4+(effects.adjust.enabled?64*1024**2:0));try{return{pixels:await applyPdfPointEffects(m.pixels,effects,{signal:controller.signal})};}finally{release();}}
  if(m.action==='register'){if(!sources.has(m.source)){const descriptor={id:m.source,revision:1,width:m.width,height:m.height,format:'rgb8'},image={surface:{descriptor,readWindow:(rect,{signal}={})=>sourceRead(m.source,rect,signal)},ensureTemporarySession:temporary,pixelStoreCaches:new Map()};sources.set(m.source,image);}return{registered:true};}
  if(m.action==='build'){const image=sources.get(m.source);if(!image)throw cancelled();const effects=validateLoupeEffects(m.effects);if(!usesPdfGlobalEffects(effects))throw Object.assign(Error('Pointwise PDF effects do not require a retained global result.'),{code:'PDF_EFFECT_GLOBAL_DOMAIN'});let current=image.surface,adjusted,enhanced;try{
   if(effects.adjust.enabled){adjusted=await segmentedAdjust(image,adjustmentParameters(effects.adjust),{budget,signal:controller.signal,cacheKey:'pdf-composite/'+m.source+'/',maxWorkers:m.maxWorkers});current=adjusted.surface;}
   if(effects.enhance.enabled){enhanced=await segmentedMagnifierLarge({...image,surface:current},{...effects.enhance,bounds:null},{budget,signal:controller.signal,cacheKey:'pdf-composite/'+m.source+'/'+JSON.stringify(effects.adjust)+'/'});if(adjusted){await adjusted.surface.dispose();adjusted=null;}current=enhanced.surface;}
   check(controller.signal);results.set(m.ticket,{surface:current,owns:current!==image.surface,effects});return{result:m.ticket,metrics:{grid:'retained-composite-hd',globalDomain:[image.surface.descriptor.width,image.surface.descriptor.height],adjust:adjusted?.metrics??null,enhance:enhanced?.metrics??null}};
  }catch(e){await adjusted?.surface.dispose();await enhanced?.surface.dispose();throw e;}}
  if(m.action==='read'){const r=results.get(m.result);if(!r)throw cancelled();const part=m.step>1?await r.surface.readSampledWindow({x:m.rect.x,y:m.rect.y,w:m.rect.width,h:m.rect.height,step:m.step},{signal:controller.signal}):await r.surface.readWindow(m.rect,{signal:controller.signal});try{check(controller.signal);return{pixels:r.effects.sweep.enabled?sweepPixels(part.pixels,r.effects.sweep):part.pixels};}finally{part.release();}}
  if(m.action==='release'){await disposeResult(m.result);return{released:true};}
  if(m.action==='close'){closed=true;for(const c of controllers.values())if(c!==controller)c.abort(cancelled());for(const pending of reads.values())pending.reject(cancelled());reads.clear();for(const id of [...results.keys()])await disposeResult(id);for(const image of sources.values())await disposePixelStoreCaches(image);sources.clear();budget.clear();if(sessionPromise)await(await sessionPromise).dispose();return{closed:true,memory:budget.snapshot()};}
  throw Error('Unknown PDF composite effect request.');
 }finally{controllers.delete(m.ticket);}}
 scope.onmessage=({data:m})=>{if(m.action==='source'){const read=reads.get(m.read);reads.delete(m.read);if(read)m.error?read.reject(Object.assign(Error(m.error.message),m.error)):read.resolve(m.pixels);return;}if(m.action==='close'){closing=true;for(const c of controllers.values())c.abort(cancelled());}if(m.action==='cancel'){const controller=controllers.get(m.request);if(controller)controller.abort(cancelled());else if(queuedTickets.has(m.request))cancelledTickets.add(m.request);return;}queuedTickets.add(m.ticket);queue=queue.catch(()=>{}).then(async()=>{try{const answer=await handle(m);post({ticket:m.ticket,...answer},answer.pixels?[answer.pixels.data.buffer]:[]);}catch(e){post({ticket:m.ticket,error:encode(e)});}finally{queuedTickets.delete(m.ticket);cancelledTickets.delete(m.ticket);}});};
 return{stats:()=>({queued:queuedTickets.size,cancelled:cancelledTickets.size,active:controllers.size,sourceReads:reads.size})};
}
if(typeof self!=='undefined'&&typeof document==='undefined')installPdfCompositeEffectsWorker(self);
