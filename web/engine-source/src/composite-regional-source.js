import {compileOriginalSourceRegions} from './source-region-geometry.js';
import {sourceRegionDomainShape} from './source-region-capabilities.js';
import {createSourceRegionRecord} from './source-region-record.js';
import {EngineError,checkAbort,requireValue} from './errors.js';
/** Explicit initial Composite contract: one literal complete acquisition only.
 * A bbox or a union of acquisitions is not a statistical context substitute. */
export async function compositeSourceDomain(input,{sourceSha256,width,height,signal}={}){
 if(input===undefined||input===null)return null;checkAbort(signal);
 const domain=await compileOriginalSourceRegions(input);checkAbort(signal);
 if(sourceSha256!==undefined&&domain.sourceSha256!==sourceSha256||width!==undefined&&domain.sourceWidth!==width||height!==undefined&&domain.sourceHeight!==height)throw new EngineError('SOURCE_CHANGED','Composite selection belongs to another Original source or grid.');
 const shape=sourceRegionDomainShape(domain);
 const frames=[domain.snapshot,domain.descriptor.ceiling?.snapshot??domain.descriptor.ceiling].filter(Boolean);
 const counts=frames.map(frame=>frame.enabled===false||frame.positiveMode==='full'?0:(frame.zones??[]).filter(zone=>zone.enabled!==false&&zone.kind==='acquisition').length);
 if(counts.some(n=>n>1))throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','Composite requires one acquisition; independent or combined multi-acquisition statistics are not qualified.',{details:{operation:'composite',shape,acquisitionCounts:counts}});
 if(shape==='identity')return {domain,regional:false};
 if(shape!=='rectangle'||domain.countIncluded!==domain.width*domain.height||counts.some(n=>n>1)||!counts.some(n=>n===1))throw new EngineError(shape==='empty'?'SOURCE_SCOPE_EMPTY':'SOURCE_SCOPE_UNSUPPORTED','Composite currently requires one complete rectangular acquisition. Holes and multiple acquisitions require an explicitly approved whole-image fallback.',{details:{operation:'composite',shape,acquisitionCounts:counts,contract:'single-complete-native-acquisition/1'}});
 return {domain,regional:true};
}
export function compositeRegionalImage(original,selection,{budget}={}){
 requireValue(selection?.regional===true,'An explicit Composite native rectangle is required.');
 return createSourceRegionRecord(original,selection.domain,{budget});
}
export function compositeRegionalResult(value,domain){
 const coordinates={contract:'single-complete-native-acquisition/1',coordinateSpace:'context-local-pixels',origin:[...domain.origin],width:domain.width,height:domain.height,sourceWidth:domain.sourceWidth,sourceHeight:domain.sourceHeight,sourceSha256:domain.sourceSha256,domainFingerprint:domain.fingerprint};
 return {...value,data:{...value.data,metadata:{...value.data.metadata,sourceRegion:coordinates}},provenance:{...value.provenance,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:[...domain.origin],sourceRegionGrid:{width:domain.width,height:domain.height,sourceWidth:domain.sourceWidth,sourceHeight:domain.sourceHeight},sourceRegionCoordinatePolicy:'Native arrays/range0/range1 remain local; Original = local + sourceRegionOrigin.',originalSourceSha256:domain.sourceSha256,originalEncodedBytesPreserved:true}};
}
