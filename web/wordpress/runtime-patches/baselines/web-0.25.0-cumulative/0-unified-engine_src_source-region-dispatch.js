import {compileOriginalSourceRegions} from './source-region-geometry.js';
import {assertSourceRegionOperation,sourceRegionDomainShape,sourceRegionCapabilities} from './source-region-capabilities.js';
import {SOURCE_REGION_SPATIAL_ADAPTERS} from './source-region-spatial.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
export {sourceRegionDomainShape};
export const registeredSourceRegionCapabilities=()=>sourceRegionCapabilities(SOURCE_REGION_SPATIAL_ADAPTERS);
export async function prepareSourceRegionDomain(original,input,{signal}={}){
 checkAbort(signal);const domain=await compileOriginalSourceRegions(input);checkAbort(signal);const d=original.surface?.descriptor??original.pixels;
 if(!d||domain.sourceSha256!==original.sha256||domain.sourceWidth!==d.width||domain.sourceHeight!==d.height)throw new EngineError('SOURCE_REGIONS_INVALID','Original-source regions belong to another encoded source or native grid.');
 if(domain.empty)throw new EngineError('SOURCE_SCOPE_EMPTY','The original-source selection contains no admitted pixels.');return domain;
}
export function admitSourceRegionOperation(operation,domain,params,task){return assertSourceRegionOperation(operation,{shape:sourceRegionDomainShape(domain),params,task,adapters:SOURCE_REGION_SPATIAL_ADAPTERS});}
export function registeredSourceRegionAdapter(operation,domain){const adapter=SOURCE_REGION_SPATIAL_ADAPTERS[operation];return adapter?.shapes.includes(sourceRegionDomainShape(domain))?adapter:null;}
export async function sourceRegionCacheIdentity(imageId,domain){
 const bytes=new TextEncoder().encode(JSON.stringify(['original-native-domain/1',imageId,domain.sourceSha256,domain.fingerprint]));return'source-region-'+[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export function sourceRegionResult(answer,{task,original,domain,sourceSurface,cacheIdentity,identity=false,localization}){
 const descriptor=domain.descriptor;
 return{...answer,imageId:task.imageId,sourceRegionDomain:descriptor,sourceRegionSourceSurface:sourceSurface,sourceRegionOrigin:[...domain.origin],...(localization?{sourceRegionLocalization:localization}:{}),
  provenance:{...answer.provenance,originalSha256:original.sha256,sourceRegionDomain:descriptor,sourceRegionOrigin:[...domain.origin],sourceRegionGrid:{width:domain.width,height:domain.height,sourceWidth:domain.sourceWidth,sourceHeight:domain.sourceHeight},originalEncodedBytesPreserved:true,...(localization?{sourceRegionLocalization:localization}:{})},
  metrics:{...answer.metrics,sourceRegion:{shape:sourceRegionDomainShape(domain),identityFastPath:identity,originalImageId:task.imageId,cacheIdentity:cacheIdentity??task.imageId,domainFingerprint:domain.fingerprint,includedPixels:domain.countIncluded,excludedPixelsInEnvelope:domain.width*domain.height-domain.countIncluded,encodedSourceRewritten:false}}
 };
}

export {sourceRegionTransportBytes} from './source-region-transport.js';
