// Cheap UI signature and exact signed-domain check are separate. Display
// controls do not belong to a scientific resume identity.
export function automaticSourceContext(input){
 if(!input)return null;const {operation,imageId,sourceSha256,revision,width,height,ceilingFingerprint=null,scopeFingerprint=null,selection=null,cloneWindowMode='independent'}=input;
 if(!['independent','global'].includes(cloneWindowMode)||!['analysis.clones','analysis.complete'].includes(operation)||typeof imageId!=='string'||!/^[a-f0-9]{64}$/.test(sourceSha256??'')||![revision,width,height].every(Number.isSafeInteger)||width<=0||height<=0)return null;
 return JSON.stringify([operation,imageId,sourceSha256,revision,width,height,ceilingFingerprint,scopeFingerprint,selection,cloneWindowMode]);
}
export function captureAutomaticSourceContext(uiIdentity,task){if(typeof uiIdentity!=='string')return null;return Object.freeze({uiIdentity,domainFingerprint:task.sourceRegionDomain?.fingerprint??null});}
export function automaticSourceContextMatches(captured,uiIdentity,domain){return !!captured&&typeof uiIdentity==='string'&&captured.uiIdentity===uiIdentity&&(arguments.length<3||captured.domainFingerprint===(domain?.fingerprint??null));}
