import "../../runtime-context.js?v=0.30.0";
import {automaticPointSnapshot} from './automatic-point-snapshot.js';
import {streamAutomaticNpz} from './automatic-npz-stream.js';
export function denseNativeParameters(p,backend){return [p.profile,p.limit,p.radius,p.minimum,p.threshold,p.tolerance,p.model,p.geometricThreshold,p.geometricMinimum,p.patch,p.iterations,p.flip,p.texture,backend==='cpu',p.auto,p.compact,p.excluded,p.guides];}
export function streamDenseNpz({raw,params,backend,style,visible},provenance,request,hooks){
 if(raw.dense_windows){
  const {dense_windows,windowResults,globalResult,...presentation}=raw;
  const native_windows=dense_windows.map(({raw:native,...window})=>{const p={...native.params,model:native.geometry.model,tolerance:native.geometry.tolerance,geometricThreshold:native.geometry.threshold,geometricMinimum:native.geometry.minimum};return {...window,result:automaticPointSnapshot(native,{nativeParams:denseNativeParameters(p,backend)})};});
  return streamAutomaticNpz({schema:'sherloq.clone-dense-windows/1',cloneWindowMode:raw.cloneWindowMode,presentation:automaticPointSnapshot(presentation,{nativeParams:denseNativeParameters(params,backend)}),native_windows,display:style,visible_biomes:visible},provenance,request,hooks);
 }
 return streamAutomaticNpz({schema:'sherloq.clone-dense/1',result:automaticPointSnapshot(raw,{nativeParams:denseNativeParameters(params,backend)}),display:style,visible_biomes:visible},provenance,request,hooks);
}
