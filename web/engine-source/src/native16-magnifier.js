import {EngineError,requireValue,checkAbort} from './errors.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {native16Descriptor} from './rgb16-surface.js';
import {magnifierRegion} from './magnifier.js';
import {prepareMagnifierSurface} from './prepared-magnifier-surface.js';
import {native16MagnifierParams} from './native16-magnifier-contract.js';
import {createNative16DisplayOwner} from './native16-display-owner.js';

// One complete-region histogram and immutable LUT at every size. Exact
// native windows are mapped on demand; only the display reader converts colour.
export async function runNative16Magnifier(surface,input,options){
 requireValue(options?.budget&&typeof options.isSourceCurrent==='function'&&options.sourceBinding,'A captured native Original owner is required for magnifier output.');
 const p=native16MagnifierParams(input);
 if(!p)throw new EngineError('UNSUPPORTED_PRECISION','This post-equalizer has no qualified native16 producer yet.');
 const descriptor=native16Descriptor(surface),region=magnifierRegion(descriptor,p);
 checkAbort(options.signal);
 const precision={...descriptor,operation:'inspection.magnifier',numericalInputDepth:16,profileConversion:'none',presentationOutputDepth:8};
 if(!region.width||!region.height)return{data:{bounds:region.bounds,empty:true},provenance:precision,semantics:'Empty clipped native16 magnifier region; no pixel calculation.',metrics:{inputDepth:16,outputDepth:16,sourceReads:0,workers:0},dispose:async()=>{}};
 let display,record,published=false,failed=false,primary;
 try{
  display=createNative16DisplayOwner({nativeSource:options.sourceSurface??surface,budget:options.budget,isCurrent:options.isSourceCurrent,sourceBinding:options.sourceBinding,displayAssumption:options.displayAssumption,totalPixels:region.width*region.height,backend:options.colorBackend??'auto'});
  record=await prepareMagnifierSurface({surface},p,{...options,sourceBinding:options.native16ProcessingBinding??options.sourceBinding,displayTransform:display.displayTransform,onProgress:value=>options.onProgress?.(value.fraction??value)});
  checkAbort(options.signal);
  display.attach(record.surface);
  const result={...record,provenance:{...precision,...(display.plan.displayAssumption?{presentationAssumption:display.plan.displayAssumption,colorimetryKnown:false}:{})},semantics:'Exact uint16 selected-region enhancement: native-code CDF or discrete contrast tails, complete-region statistics and unchanged oriented bounds. Color conversion applies only to presentation.',metrics:{...record.metrics,inputDepth:16,outputDepth:16,nativeInputDepth:16,backend:'cpu',retainedResultBytes:record.metrics.retainedResultBytes},dispose:()=>record.surface.dispose()};
  published=true;return result;
 }catch(error){failed=true;primary=error;throw error;}
 finally{if(!published)await retireCompositeOwners([()=>record?.surface.dispose(),()=>display?.dispose()],failed?{primary,requireAck:true}:{requireAck:true});}
}
