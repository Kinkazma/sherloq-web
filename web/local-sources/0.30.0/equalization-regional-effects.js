import {checkAbort} from './unified-engine/src/errors.js';
import {retireCompositeOwners} from './unified-engine/src/composite-owner-release.js';
import {segmentedAdjust} from './unified-engine/src/segmented-adjust.js';
import {segmentedMagnifierLarge} from './unified-engine/src/segmented-magnifier-large.js';
import {adjustmentParameters,sweepPixels} from './loupe-effects-settings.js?v=0.30.0';
// Only newly selected methods need this global mapping. Existing regional
// workers retain their original priority/caching path and native kernels.
export function createEqualizationRegionalEffects(source,p,{budget,temporarySession}){
 let surface=null,initializing=null,closed=false,closing=false,closeTask=null;const owners=new Set();const controller=new AbortController(),{width,height}=source.descriptor;
 const metrics={native:true,progressive:true,fullPixels:width*height,globalDependencies:['equalization'],equalization:true};
 const retire=async value=>{await value.dispose();owners.delete(value);};
 async function initialize(signal){let current=source;
  try{checkAbort(signal);await retireCompositeOwners([...owners].map(value=>()=>retire(value)));for(const name of ['adjust','enhance'])if(p[name].enabled){const image={surface:current,ensureTemporarySession:temporarySession},hooks={budget,signal},next=name==='adjust'?await segmentedAdjust(image,adjustmentParameters(p.adjust),hooks):await segmentedMagnifierLarge(image,{...p.enhance,bounds:null},hooks);owners.add(next.surface);const previous=current;current=next.surface;if(owners.has(previous))await retire(previous);metrics[name]=next.metrics;}checkAbort(signal);surface=current;metrics.retainedBytes=surface.descriptor.storage==='memory'?width*height*3:0;return surface;}
  catch(error){await retireCompositeOwners([...owners].map(value=>()=>retire(value)),{primary:error});throw error;}
 }
 return {descriptor:{width,height,format:'rgb8'},metrics,setPriority(){},async readWindow(rect,{signal}={}){
  const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;checkAbort(combined);if(closed||closing)throw Error('Equalization view disposed');if(!initializing){const task=initialize(combined);initializing=task;task.catch(()=>{if(initializing===task)initializing=null;});}const current=await initializing;checkAbort(combined);const part=await current.readWindow(rect,{signal:combined});
  if(!p.sweep.enabled)return part;try{return{...part,pixels:sweepPixels(part.pixels,p.sweep)};}catch(error){part.release();throw error;}
 },dispose(){if(closed)return Promise.resolve();if(closeTask)return closeTask;closing=true;controller.abort();const task=(async()=>{await initializing?.catch(()=>{});await retireCompositeOwners([...owners].map(value=>()=>retire(value)));surface=null;closed=true;})();closeTask=task;task.catch(()=>{if(closeTask===task)closeTask=null;});return task;}};
}
