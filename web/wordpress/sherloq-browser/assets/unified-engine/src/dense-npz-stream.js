import "../../runtime-context.js?v=0.14.5";
import {automaticPointSnapshot} from './automatic-point-snapshot.js';
import {streamAutomaticNpz} from './automatic-npz-stream.js';
export function denseNativeParameters(p,backend){return [p.profile,p.limit,p.radius,p.minimum,p.threshold,p.tolerance,p.model,p.geometricThreshold,p.geometricMinimum,p.patch,p.iterations,p.flip,p.texture,backend==='cpu',p.auto,p.compact,p.excluded,p.guides];}
export function streamDenseNpz({raw,params,backend,style,visible},provenance,request,hooks){
 return streamAutomaticNpz({schema:'sherloq.clone-dense/1',result:automaticPointSnapshot(raw,{nativeParams:denseNativeParameters(params,backend)}),display:style,visible_biomes:visible},provenance,request,hooks);
}
