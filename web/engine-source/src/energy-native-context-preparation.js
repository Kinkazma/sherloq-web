import {prepareEnergy} from './energy-prepare.js';
import {readEnergyPreparationContext,retainEnergyPreparationContext} from './energy-preparation-context.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
const signature=image=>{const original=image.originalSource??image,d=image.surface.descriptor,o=original.surface?.descriptor;return JSON.stringify([original.sha256??null,original.provenance??{},image.sha256??null,image.provenance??{},[image.sourceCeiling??null,original.sourceCeiling??null],[d.id??null,d.revision??null,d.width,d.height,d.format],[o?.id??null,o?.revision??null,o?.width,o?.height,o?.format]]);};
const samePolygons=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// Reuse the existing native raw context only for the exact stores and source
// that captured it. The returned preparation is the existing numerical kernel;
// its three outputs become real, independently owned segmented stores.
export function createEnergyNativePreparationReuse({prepare=prepareEnergy,createStore=createSegmentedBytes}={}){
 const bindings=new WeakMap();
 function remember(handle,image,planes,polygons){if(!handle)return;bindings.set(handle,{surface:image.surface,originalSurface:(image.originalSource??image).surface,source:signature(image),planes:[...planes],polygons:structuredClone(polygons)});}
 async function attempt(image,planes,quantiles,log,{budget,signal,onProgress,storage='auto',polygons,scoreGpu,scoreBackend='webgpu',planeCount=3,capturePreparationContext,scoreWorkingBytes=0}={}){
  const handle=capturePreparationContext?.owner.lookup(capturePreparationContext.key),binding=handle&&bindings.get(handle);
  if(!binding||binding.surface!==image.surface||binding.originalSurface!==(image.originalSource??image).surface||binding.source!==signature(image)||binding.planes.length!==planes.length||planes.some((store,i)=>store!==binding.planes[i])||!samePolygons(binding.polygons,polygons))return null;
  const raw=readEnergyPreparationContext(handle),{width,height}=image.surface.descriptor,n=width*height;
  if(raw.width!==width||raw.height!==height||raw.planeCount!==planeCount||storage==='temporary'||budget.recovering||budget.isBackingUnderPressure?.('array-buffer'))return null;
  // A conservative whole-phase admission keeps the previous streamed path
  // available without eviction. There is no image-size threshold or new math.
  const arrayBytes=(45-(3-planeCount)*4-8)*n+8192+binding.polygons.length*2048,summaryBytes=binding.polygons.length*2048;
  const requiredBytes=arrayBytes+12*n+summaryBytes+scoreWorkingBytes;
  if(!Number.isSafeInteger(requiredBytes)||budget.total()+requiredBytes>budget.limit)return null;
  checkAbort(signal);const unpin=retainEnergyPreparationContext(handle),fees=[],stores=new Set();let prepared,summaryRelease,active=true,closed=false,closing,unregister,localAllocationFailure=Symbol('no identified local allocation failure'),accountBytes=0;
  const rememberDebt=()=>{unregister??=budget.registerAsyncReclaimer?.(async()=>{if(active)return 0;const before=budget.total();await dispose();return Math.max(0,before-budget.total());},{owner:'ela-energy-preparation',label:'retiring-native-context-preparation',allocationKind:'array-buffer'});};
  const dispose=()=>{if(closed)return Promise.resolve();if(closing)return closing;const task=(async()=>{let failed=false,primary;for(const store of [...stores])try{const ack=await store.dispose();if(ack===false||ack===0)throw new EngineError('BUSY','Native context preparation store retirement awaits ACK.');stores.delete(store);}catch(error){if(!failed){failed=true;primary=error;}}if(failed){rememberDebt();throw primary;}summaryRelease?.();summaryRelease=null;closed=true;unregister?.();unregister=null;})();closing=task;void task.finally(()=>{if(closing===task)closing=null;}).catch(()=>{});return task;};
  const reserveLocal=bytes=>{try{return budget.reserve(bytes);}catch(error){if(error?.code==='MEMORY_LIMIT')localAllocationFailure=error;throw error;}};
  const cleanupOwner={dispose,snapshot:()=>({stores:stores.size,summaryBytes:summaryRelease?summaryBytes:0,active,closed,contextIdentity:handle.identity})};
  try{
   prepared=await prepare({width,height,format:'rgb8'},raw.planes,quantiles,log,{signal,scoreGpu,scoreBackend,planeCount,preparationContext:handle,onGpuSubmitted:detail=>onProgress?.({phase:'energy-score-gpu-submitted',...detail}),onProgress:fraction=>onProgress?.({phase:'energy-panel-scores',fraction}),account:bytes=>{const fee=reserveLocal(bytes);fees.push(fee);accountBytes+=bytes;return fee;}});checkAbort(signal);
   requireValue(binding.source===signature(image)&&capturePreparationContext.owner.lookup(capturePreparationContext.key)===handle,'Native context changed during preparation.');
   summaryRelease=reserveLocal(summaryBytes);const value={width,height,energy_summary:prepared.energy_summary};
   for(const name of ['energy_low_score','energy_high_score','energy_scope']){
    const array=prepared[name];requireValue(array?.byteLength===n*4,'Complete native context output required.');
    const label='native-context-'+name;let store;try{store=await createStore(n*4,{budget,storage:'memory',signal,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,owner:'ela-energy-preparation',label});}catch(error){if(error?.code==='MEMORY_LIMIT')localAllocationFailure=error;throw error;}stores.add(store);value[name]=store;
    try{await store.write(new Uint8Array(array.buffer,array.byteOffset,array.byteLength));}catch(error){const d=error?.details;if(error?.code==='MEMORY_ALLOCATION'&&d?.allocationKind==='array-buffer'&&d.label===label&&d.totalBytes===n*4)localAllocationFailure=error;throw error;}await store.flush();checkAbort(signal);
   }
   const runtime=prepared.scoreRuntime,identity=prepared.preparationContextIdentity;
   value.metrics={preparationWorkingBytes:accountBytes,...(identity?{preparationContextIdentity:identity}:{}),...(runtime?{energyScoreGpu:runtime}:{}),panels:prepared.energy_summary.length,sourcePanels:binding.polygons.length,lowStorage:value.energy_low_score.storage,highStorage:value.energy_high_score.storage,scopeStorage:value.energy_scope.storage,nativePreparationContextReuse:{hit:true,identity:handle.identity,sourceAndStoreBinding:true,outputCopyBytes:12*n}};
   value.dispose=dispose;active=false;return value;
  }catch(error){active=false;if(error?.cleanupOwner&&error.cleanupOwner!==cleanupOwner&&typeof error.cleanupOwner.dispose==='function')stores.add(error.cleanupOwner);try{await dispose();}catch(cleanup){rememberDebt();if(error&&typeof error==='object'&&Object.isExtensible(error)){error.cleanupOwner=cleanupOwner;error.energyOwnerCleanupError=cleanup;}else{const combined=new AggregateError([error,cleanup],'Native context preparation cleanup failed.',{cause:error});combined.code='CLEANUP_FAILED';combined.cleanupOwner=cleanupOwner;throw combined;}}if(error===localAllocationFailure&&closed&&!signal?.aborted&&binding.source===signature(image)&&capturePreparationContext.owner.lookup(capturePreparationContext.key)===handle)return null;throw error;}
  finally{prepared=null;for(const fee of fees)fee();unpin();}
 }
 return{remember,attempt};
}
const shared=createEnergyNativePreparationReuse();
export const rememberEnergyNativePreparation=shared.remember;
export const tryEnergyNativeContextPreparation=shared.attempt;
