import {compileOriginalSourceRegions} from './unified-engine/src/source-region-geometry.js';
import {EngineError,requireValue,checkAbort} from './unified-engine/src/errors.js';

/** The unchanged Original Blob identifies the source. JPEG keeps its stored DCT;
 * other native formats use the global Q100/444 companion. A separate RGB
 * envelope is retained only for presentation; it never enters analyzeBlob. */
export async function prepareCatnetScopedBlobRequest({blob,domain,sourceSha256,params={}},{signal}={}){
 requireValue(blob instanceof Blob&&blob.size>0&&params&&typeof params==='object'&&!Array.isArray(params),'CAT-Net requires the loaded Original Blob and its native parameters.');
 requireValue(!Object.hasOwn(params,'catnetSourceScope'),'The CAT-Net source context is an internal signed transport.');
 const scientific=structuredClone(params),captured=structuredClone(domain);checkAbort(signal);
 const compiled=await compileOriginalSourceRegions(captured);checkAbort(signal);
 requireValue(compiled.sourceSha256===sourceSha256,'CAT-Net source regions differ from the loaded Original.');
 if(compiled.empty)throw new EngineError('SOURCE_SCOPE_EMPTY','CAT-Net selection admits no Original observations.');
 const magic=new Uint8Array(await blob.slice(0,2).arrayBuffer());checkAbort(signal);
 const jpeg=magic[0]===255&&magic[1]===216;
 return{blob,expectedSourceSha256:sourceSha256,domain:compiled.descriptor,params:{...scientific,catnetSourceScope:{purpose:jpeg?'analysis-native-jpeg-contexts':'analysis-native-companion-contexts',analysisContext:jpeg?'native-catnet-stored-DCT-contexts-only':'native-catnet-global-q100-444-contexts-only',expectedSourceSha256:sourceSha256,sourceRegionDomain:compiled.descriptor}}};
}

/** A staged result owns its descriptor and presentation loan until the caller
 * publishes it. Failure/cancellation retires only the new, unpublished work. */
export async function analyzeCatnetScopedBlob({client,request,acquirePresentation,signal,onProgress,backend}){
 let descriptor,reader,handedOff=false,primary;
 const retire=async()=>{const failures=[];for(const action of[()=>descriptor&&client.release(descriptor.id),()=>reader?.dispose()])try{await action();}catch(error){failures.push(error);}descriptor=reader=null;if(failures.length)throw new AggregateError(failures,'CAT-Net unpublished result retirement failed');};
 try{
  checkAbort(signal);reader=await acquirePresentation(request.domain);checkAbort(signal);
  requireValue(reader.purpose==='preparation-envelope'&&reader.preparationContext==='envelope-not-scientific-membership'&&reader.origin?.length===2&&reader.origin.every((v,i)=>v===request.domain.origin[i])&&reader.sourceRegionSourceSurface?.format==='rgb8'&&reader.sourceRegionSourceSurface.width===request.domain.width&&reader.sourceRegionSourceSurface.height===request.domain.height&&reader.sourceRegionDomain?.fingerprint===request.domain.fingerprint&&reader.sha256===request.expectedSourceSha256&&reader.width===request.domain.width&&reader.height===request.domain.height,'The CAT-Net presentation owner differs from its signed native domain.');
  descriptor=await client.analyzeBlob('catnet',request.blob,request.params,{signal,onProgress,backend,expectedSourceSha256:request.expectedSourceSha256});checkAbort(signal);
  const metadata=await client.metadata(descriptor);checkAbort(signal);
  requireValue(descriptor.width===request.domain.width&&descriptor.height===request.domain.height&&metadata.metadata?.fragmented===true&&metadata.provenance?.originalSourceSha256===request.expectedSourceSha256&&metadata.provenance?.sourceRegionDomain?.fingerprint===request.domain.fingerprint&&metadata.provenance?.encodedSourceRewritten===false,'CAT-Net returned another source, grid or native-context contract.');
  if(request.params.catnetSourceScope.purpose==='analysis-native-companion-contexts')requireValue(metadata.metadata.jpeg_source==='companion_q100_444','CAT-Net returned another native companion policy.');
  const output={descriptor,metadata,presentation:reader,retire};handedOff=true;return output;
 }catch(error){primary=error;throw error;}finally{if(!handedOff)try{await retire();}catch(error){if(primary){if(Object.isExtensible(primary))primary.cleanupError=error;}else throw error;}}
}

export function catnetScopedToolResult(task,source,staged){
 const {descriptor,metadata,presentation}=staged,domain=presentation.sourceRegionDomain;
 return{id:task.id,imageId:source.id,operation:task.operation,status:'ok',data:metadata,provenance:{...metadata.provenance,sourceRegionDomain:domain,sourceRegionOrigin:[...domain.origin],originalEncodedBytesPreserved:true},metrics:metadata.metrics,sourceRegionDomain:domain,sourceRegionOrigin:[...domain.origin],sourceRegionSourceSurface:presentation.sourceRegionSourceSurface,m2Result:descriptor,views:[0,1,2].map(view=>({id:'m2-'+descriptor.id+'-'+domain.fingerprint+'-'+view,revision:1,width:descriptor.width,height:descriptor.height,format:'rgb8',m2Result:descriptor.id,view,sourceRegionDomain:domain,sourceRegionOrigin:[...domain.origin]}))};
}
