import{compileOriginalSourceRegions}from'./source-region-geometry.js';
import{sourceRegionTransportBytes}from'./source-region-transport.js';
import{createSourceRegionView}from'./source-region-view.js';
import{loadM2SegmentedOriginal,disposeSegmentedImage}from'./image-sources.js';
import{planCatnetStrictContexts}from'./catnet-strict-contexts.js';
import{EngineError,requireValue,checkAbort}from'./errors.js';
/** Scoped CAT-Net transports the SAME original Blob, never a cropped encoded
 * surrogate or an RGB-only CFA/TruFor channel. The decoded owner remains live
 * until its scope/view and future native result owners have been retired. */
export async function loadCatnetScopedOriginal(blob,input,{budget,signal,onProgress,imageLoader=loadM2SegmentedOriginal,imageDisposer=disposeSegmentedImage}={}){
 requireValue(blob instanceof Blob&&blob.size>0&&((input?.purpose==='analysis-native-jpeg-contexts'&&input.analysisContext==='native-catnet-stored-DCT-contexts-only')||(input?.purpose==='analysis-native-companion-contexts'&&input.analysisContext==='native-catnet-global-q100-444-contexts-only'))&&input.preparationContext===undefined,'CAT-Net requires the unchanged Original JPEG and an explicit scientific context.');
 let image,view,plan,metadataLease;let released=false,retiring;const cleanup=async()=>{const errors=[];for(const action of[()=>view?.dispose(),()=>plan?.release(),()=>image&&imageDisposer(image),()=>metadataLease?.()])try{await action();}catch(error){errors.push(error);}if(errors.length){const first=errors[0];if(first&&typeof first==='object'&&Object.isExtensible(first))first.cleanupErrors=[...(first.cleanupErrors??[]),...errors.slice(1)];throw first;}};
 try{checkAbort(signal);metadataLease=budget.reserve(sourceRegionTransportBytes(input.sourceRegionDomain,{allowAliases:true})*8+65536);const domain=await compileOriginalSourceRegions(input.sourceRegionDomain);checkAbort(signal);
  if(domain.empty)throw new EngineError('SOURCE_SCOPE_EMPTY','CAT-Net source selection has no admitted observations.');
  requireValue(input.expectedSourceSha256===domain.sourceSha256,'CAT-Net encoded source identity differs from its signed domain.');
  const magic=new Uint8Array(await blob.slice(0,2).arrayBuffer());checkAbort(signal);const jpeg=magic[0]===255&&magic[1]===216;requireValue(jpeg===(input.purpose==='analysis-native-jpeg-contexts'),'The CAT-Net JPEG/companion context differs from its unchanged Original bytes.');
  // Exactly one decode of the same encoded object. No crop, reencode or
  // substitute Blob is introduced by the scope transport.
  image=await imageLoader(blob,{budget,signal,onProgress});checkAbort(signal);const d=image?.surface?.descriptor;
  requireValue(image.segmented===true&&image.source&&image.store&&image.sha256===domain.sourceSha256&&((image.provenance?.format??'jpeg')==='jpeg')===jpeg&&d?.width===domain.sourceWidth&&d.height===domain.sourceHeight,'The decoded CAT-Net Original differs from its signed source identity/grid.');
  const geometry=Object.freeze(jpeg?{sourceWidth:d.sourceWidth,sourceHeight:d.sourceHeight,orientation:d.orientation}:{sourceWidth:d.width,sourceHeight:d.height,orientation:1});
  view=jpeg?await createSourceRegionView({...image.surface,sha256:image.sha256},domain.descriptor,{budget,maxReadPixels:262144}):null;
  plan=await planCatnetStrictContexts(domain,geometry,{budget,signal});checkAbort(signal);
  return Object.freeze({image,domain,geometry,view,plan,encodedSource:blob,provenance:Object.freeze({adapter:jpeg?'catnet-unchanged-original-jpeg-context-input':'catnet-original-global-companion-context-input',originalSourceSha256:domain.sourceSha256,encodedSourceRewritten:false,decodeCount:1,domainFingerprint:domain.fingerprint,sourceRegionOrigin:Object.freeze([...domain.origin]),DctSupport:jpeg?'complete admitted physical support of original stored Y blocks':'complete admitted physical support of native global Q100/444 companion Y blocks',RgbObservations:jpeg?'already decoded Original pixels; no claim of independent chroma bitstream reconstruction':'Original decoded RGB is retained here only as input/presentation. The neural owner creates a distinct global companion-decoded view; global codec preparation is distinct from admitted neural contexts'}),release(){if(retiring)return retiring;if(released)return Promise.resolve();released=true;retiring=cleanup();return retiring;}});
 }catch(error){try{await cleanup();}catch(extra){if(error&&typeof error==='object'&&Object.isExtensible(error))error.cleanupError=extra;}throw error;}
}
