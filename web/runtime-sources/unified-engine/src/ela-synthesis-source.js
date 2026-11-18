import "../../runtime-context.js?v=0.33.2";
import {allocateTypedArray} from './allocation.js';
import {ownGpuArrays} from './gpu-owned-arrays.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';

const MiB=1024**2,contiguous=new WeakMap();
// A complete JPEG GPU context may borrow this series-owned RAM bank instead
// of making another complete Original copy. The bank outlives every quality.
export function synthesisRgbContiguousBytes(surface){return contiguous.get(surface)?.bytes??0;}
export function borrowSynthesisRgb(surface){return contiguous.get(surface)?.borrow()??null;}

// Created only for an active synthesis job, never at import or proxy startup.
// Original/source identity stays with the caller. This one exact SDR staging
// removes the 1--2 remote reads per pixel for every independently encoded frame.
export async function createElaSynthesisSource(image,{budget,futureBytes=0,signal}={}){
 const input=image.surface,d=input?.descriptor,bytes=d?.width*d?.height*3;
 requireValue(d?.format==='rgb8'&&Number.isSafeInteger(bytes)&&bytes>0&&budget?.reserve&&Number.isSafeInteger(futureBytes)&&futureBytes>=0,'An admitted synthesis Original RGB8 surface is required.');
 checkAbort(signal);let ram,store,surface,view,closed=false,closing=false,disposal,pins=0,pinsDone;const leases=new Set();
 const windowRows=Math.max(1,Math.min(32,Math.floor(MiB/(d.width*3)))),windowBytes=d.width*windowRows*3;
 const metrics={schema:'sherloq.ela-synthesis-source/1',byteLength:bytes,sourcePasses:0,sourceWindows:0,sourceBytes:0,storage:null,contiguousBorrowCount:0,copiedAtImport:false};
 const releaseRam=async()=>{if(ram){await ram.release();ram=null;}};
 const caches=['rgbRecompression','selectedRecompression','selectedGhostRecompression','recompressionCache','sourceRegionRecompressionCache'];
 const owner={get image(){if(closed||closing)throw new EngineError('DISPOSED','Synthesis Original staging is retiring.');return view;},get metrics(){return{...metrics};},
  borrowPixels(){if(closed||closing)throw new EngineError('DISPOSED','Synthesis Original staging is retiring.');const lease=borrowSynthesisRgb(surface);return lease?{pixels:{width:d.width,height:d.height,format:'rgb8',data:lease.rgb},release:lease.release}:null;},
  dispose(){if(disposal)return disposal;if(closed)return Promise.resolve();closing=true;
   const task=(async()=>{await retireCompositeOwners([...leases].map(part=>async()=>{await part.release();leases.delete(part);}));await retireCompositeOwners(caches.map(key=>async()=>{const value=view?.[key];if(value){await value.dispose();view[key]=null;}}));if(pins)await new Promise(resolve=>{pinsDone=resolve;});await retireCompositeOwners([async()=>{if(surface){contiguous.delete(surface);await surface.dispose();surface=null;}},async()=>{if(store){await store.dispose();store=null;}},releaseRam]);closed=true;view=null;})();
   disposal=task;void task.catch(()=>{if(disposal===task)disposal=null;});return task;
  }
 };
 try{
  // Fund both the useful staging and its future native work. A real RAM
  // allocation refusal falls back to the existing temporary owner, not a
  // lower resolution or an image-size-specific engine.
  const ramFits=!budget.isBackingUnderPressure?.('array-buffer')&&bytes+windowBytes*3+futureBytes<=budget.limit-budget.total();
  if(ramFits)try{const free=budget.reserve(bytes);let data;try{data=allocateTypedArray(Uint8Array,bytes,{label:'synthesis-original-rgb'});}catch(error){free();throw error;}const backings=[];ram=ownGpuArrays({data},free,backings,budget);backings.push({bytes,release:budget.registerBacking?.('array-buffer',bytes,{owner:'ela-synthesis',label:'synthesis-original-rgb',identity:data.buffer})});}catch(error){await releaseRam();if(!['MEMORY_ALLOCATION','MEMORY_LIMIT'].includes(error?.code))throw error;}
  if(ram){store={byteLength:bytes,storage:'memory',readInto(target,offset=0){target.set(ram.data.subarray(offset,offset+target.length));return target;},write(data,offset=0){ram.data.set(data,offset);},flush(){},dispose(){}};}
  else store=await createSegmentedBytes(bytes,{budget,storage:'temporary',temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal,owner:'ela-synthesis',label:'synthesis-original-rgb'});
  metrics.storage=store.storage;
  const cooperate=createCooperator(signal);
  for(let y=0;y<d.height;y+=windowRows){await cooperate();checkAbort(signal);const rows=Math.min(windowRows,d.height-y),part=await input.readWindow({x:0,y,width:d.width,height:rows},{signal});leases.add(part);
   try{const p=part.pixels;requireValue(p?.format==='rgb8'&&p.width===d.width&&p.height===rows&&p.data instanceof Uint8Array&&p.data.length===d.width*rows*3,'Synthesis source returned another RGB grid.');await store.write(p.data,y*d.width*3,{signal});metrics.sourceWindows++;metrics.sourceBytes+=p.data.length;}
   finally{await part.release();leases.delete(part);}
  }
  await store.flush();checkAbort(signal);metrics.sourcePasses=1;
  surface=createRgbSurface(store,{width:d.width,height:d.height,budget,ownsStore:false});
  if(ram)contiguous.set(surface,{bytes,borrow(){requireValue(!closing&&!closed,'Synthesis Original staging is retiring.');pins++;metrics.contiguousBorrowCount++;let released=false;return{rgb:ram.data,release(){if(released)return;released=true;if(!--pins){pinsDone?.();pinsDone=null;}}};}});
  view=Object.assign(Object.create(image),{surface,store});for(const key of caches)view[key]=null;
  return owner;
 }catch(error){try{await owner.dispose();}catch(cleanup){if(error&&typeof error==='object'&&Object.isExtensible(error)){error.synthesisSourceCleanupError=cleanup;error.cleanupOwner=owner;}else{const failure=new AggregateError([error,cleanup],'Synthesis source cleanup was not acknowledged.',{cause:error});failure.cleanupOwner=owner;throw failure;}}throw error;}
}
