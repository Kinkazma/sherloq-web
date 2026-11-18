import {checkAbort,requireValue} from './unified-engine/src/errors.js';
import {equalizationPlan} from './unified-engine/src/equalization-settings.js';
import {proxyGeometry} from './unified-engine/src/sherloq7c-proxy-geometry.js';
import {retireCompositeOwners} from './unified-engine/src/composite-owner-release.js';
import {segmentedAdjust} from './unified-engine/src/segmented-adjust.js';
import {segmentedMagnifierLarge} from './unified-engine/src/segmented-magnifier-large.js';
import {adjustmentParameters,sweepPixels} from './loupe-effects-settings.js?v=0.33.3';
// Only newly selected methods need this global mapping. Existing regional
// workers retain their original priority/caching path and native kernels.
export function regionalEffectsOutputGeometry(descriptor,p){
 const sourceWidth=descriptor.width,sourceHeight=descriptor.height;let width=sourceWidth,height=sourceHeight;
 for(const name of ['adjust','enhance'])if(p[name].enabled){const plan=equalizationPlan(name==='adjust'?'inspection.adjust':'inspection.magnifier',name==='adjust'?adjustmentParameters(p.adjust):p.enhance);if(plan?.state.method==='sherloq7c'){const next=proxyGeometry(width,height,plan.state.sherloq7c.maxSide);width=next.width;height=next.height;}}
 return{width,height,sourceWidth,sourceHeight,coordinateDomain:width===sourceWidth&&height===sourceHeight?'native':'selected-output-resolution'};
}
export function createEqualizationRegionalEffects(source,p,{budget,temporarySession}){
 let surface=null,initializing=null,closed=false,closing=false,closeTask=null;const owners=new Set();const controller=new AbortController(),geometry=regionalEffectsOutputGeometry(source.descriptor,p),{width,height,sourceWidth,sourceHeight}=geometry;
 const reduced=geometry.coordinateDomain==='selected-output-resolution',metrics={native:true,progressive:true,fullPixels:sourceWidth*sourceHeight,globalDependencies:['equalization'],equalization:true,...(reduced?{outputDimensions:{width,height},coordinateDomain:geometry.coordinateDomain}:{})};
 const retire=async value=>{await value.dispose();owners.delete(value);};
 async function initialize(signal){let current=source;
  try{
   checkAbort(signal);await retireCompositeOwners([...owners].map(value=>()=>retire(value)));
   for(const name of ['adjust','enhance'])if(p[name].enabled){
    const image={surface:current,ensureTemporarySession:temporarySession},hooks={budget,signal},next=name==='adjust'?await segmentedAdjust(image,adjustmentParameters(p.adjust),hooks):await segmentedMagnifierLarge(image,{...p.enhance,bounds:null},hooks);
    const auxiliary=new Set(Object.values(next.planeRecords??{}).map(record=>record?.surface).filter(value=>value&&value!==next.surface));owners.add(next.surface);for(const value of auxiliary)owners.add(value);
    // The three 7C views retain the same frozen result independently. This
    // display pipeline needs only RGB8; retire unused scalar/RGB16 claims now.
    await retireCompositeOwners([...auxiliary].map(value=>()=>retire(value)));
    const previous=current;current=next.surface;if(owners.has(previous))await retire(previous);metrics[name]=next.metrics;
   }
   checkAbort(signal);requireValue(current.descriptor.width===width&&current.descriptor.height===height&&current.descriptor.format==='rgb8','Regional equalization output differs from its declared selected raster.');surface=current;metrics.retainedBytes=surface.descriptor.storage==='memory'?width*height*3:0;return surface;
  }
  catch(error){await retireCompositeOwners([...owners].map(value=>()=>retire(value)),{primary:error});throw error;}
 }
 return {descriptor:{width,height,format:'rgb8',...(reduced?{sourceWidth,sourceHeight,coordinates:geometry.coordinateDomain}:{})},metrics,setPriority(){},async readWindow(rect,{signal}={}){
  const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;checkAbort(combined);if(closed||closing)throw Error('Equalization view disposed');if(!initializing){const task=initialize(combined);initializing=task;task.catch(()=>{if(initializing===task)initializing=null;});}const current=await initializing;checkAbort(combined);const part=await current.readWindow(rect,{signal:combined});
  if(!p.sweep.enabled)return part;try{return{...part,pixels:sweepPixels(part.pixels,p.sweep)};}catch(error){part.release();throw error;}
 },dispose(){if(closed)return Promise.resolve();if(closeTask)return closeTask;closing=true;controller.abort();const task=(async()=>{await initializing?.catch(()=>{});await retireCompositeOwners([...owners].map(value=>()=>retire(value)));surface=null;closed=true;})();closeTask=task;task.catch(()=>{if(closeTask===task)closeTask=null;});return task;}};
}
