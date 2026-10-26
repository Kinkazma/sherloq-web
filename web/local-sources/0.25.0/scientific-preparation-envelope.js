// Detection consumes the original RGB envelope, while scientific membership
// belongs to a separate domain. Renaming/reviewing acquisition IDs does not
// change those detector pixels. Only a certified native-window receipt allows
// reuse across domain fingerprints; arbitrary imported provenance is not enough.
export function preparationMatchesSourceEnvelope(scope,domain,source){
 const provenance=scope?.provenance?.modernTextPreparation??scope?.provenance,decoder=provenance?.decoder,descriptor=decoder?.sourceRegionDomain;
 if((descriptor?.fingerprint??null)===(domain?.fingerprint??null))return true;
 const projection=provenance?.coordinateProjection,input=(scope?.text?.rawDetection??scope?.text)?.metadata?.preparationInput,expected={origin:domain?.origin??[0,0],width:domain?.width??source?.width,height:domain?.height??source?.height};
 if(!source||decoder?.source!=='original-native-window-channel'||decoder.preparationContext!=='envelope-not-scientific-membership'||decoder.encodedSourceRewritten!==false||decoder.originalSha256!==source.sourceSha256||provenance.originalSourceSha256!==source.sourceSha256||provenance.originalPixelsModified!==false)return false;
 if(descriptor?.snapshot?.sourceSha256!==source.sourceSha256||descriptor.snapshot.width!==source.width||descriptor.snapshot.height!==source.height||!descriptor.fingerprint||input?.sourceRegionDomainFingerprint!==descriptor.fingerprint||projection?.sourceRegionDomainFingerprint!==descriptor.fingerprint)return false;
 if(input.coordinateSpace!=='preparation-envelope-pixels'||input.encodedSourceRewritten!==false||projection.from!=='preparation-envelope-pixels'||projection.to!=='original-image-pixels'||projection.originalPixelsModified!==false)return false;
 return [descriptor,decoder,input,projection].every(value=>JSON.stringify(value.origin)===JSON.stringify(expected.origin))&&[descriptor,input,projection].every(value=>value.width===expected.width&&value.height===expected.height);
}
