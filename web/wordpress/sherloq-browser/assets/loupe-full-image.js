import {Budget} from './unified-engine/src/cache.js';
import {segmentedAdjust} from './unified-engine/src/segmented-adjust.js';
import {segmentedMagnifierLarge} from './unified-engine/src/segmented-magnifier-large.js';
import {createSegmentedBytes} from './unified-engine/src/segmented-bytes.js';
import {createRgbSurface} from './unified-engine/src/rgb-surface.js';
import {checkAbort,controlCheckpoint} from './unified-engine/src/errors.js';
import {validateLoupeEffects,adjustmentParameters,sweepPixels} from './loupe-effects-settings.js';

// Compute full-resolution effects once. Global histograms, CLAHE and sharpening
// retain the engine's semantics; row groups are storage, never separate images.
// Published images share a separate bounded budget and can spill to OPFS/IDB.
export async function buildLoupeImage(source,effects,{storageBudget,temporarySession,signal,onProgress=()=>{},maxWorkers=1}={}){
 const p=validateLoupeEffects(effects),budget=new Budget(256*1024**2),{width,height}=source.descriptor;
 let stage=source,owned=false,store,result;const started=performance.now(),metrics={fullPixels:width*height,computed:[],stages:[]};
 const image=()=>({surface:stage,ensureTemporarySession:temporarySession});
 try{
  for(const name of ['adjust','enhance'])if(p[name].enabled){
   checkAbort(signal);const hooks={budget,signal,maxWorkers,onProgress:value=>onProgress({stage:name,value})};
   const next=name==='adjust'?await segmentedAdjust(image(),adjustmentParameters(p.adjust),hooks):await segmentedMagnifierLarge(image(),{...p.enhance,bounds:null},hooks);
   const previous=stage;stage=next.surface;const previousOwned=owned;owned=true;if(previousOwned)await previous.dispose();
   metrics.computed.push(name);metrics.stages.push({name,...next.metrics});
  }
  // Leave room for simultaneous display reads. A large retained image goes to
  // temporary storage instead of occupying another unbounded RGB allocation.
  const bytes=width*height*3,room=storageBudget.limit-storageBudget.total()-32*1024**2;
  const storage=bytes+Math.min(4*1024**2,bytes)+4*1024**2<=room?'auto':'temporary';
  store=await createSegmentedBytes(bytes,{budget:storageBudget,storage,getTemporarySession:temporarySession,signal,owner:'loupe',label:'full-image-effects'});
  const rows=Math.max(1,Math.floor(262144/width));
  for(let y=0;y<height;y+=rows){
   await controlCheckpoint(signal);const part=await stage.readWindow({x:0,y,width,height:Math.min(rows,height-y)},{signal});
   try{const pixels=p.sweep.enabled?sweepPixels(part.pixels,p.sweep):part.pixels;await store.write(pixels.data,y*width*3);}
   finally{part.release();}
   onProgress({stage:'publish',fraction:Math.min(height,y+rows)/height});
  }
  if(p.sweep.enabled)metrics.computed.push('sweep');await store.flush();checkAbort(signal);
  result=createRgbSurface(store,{width,height,budget:storageBudget});store=null;
  metrics.storage=result.descriptor.storage;metrics.elapsedMs=performance.now()-started;metrics.workspace=budget.snapshot();
  return {surface:result,metrics};
 }catch(error){await store?.dispose();await result?.dispose();throw error;}
 finally{if(owned)await stage.dispose();budget.clear();}
}
