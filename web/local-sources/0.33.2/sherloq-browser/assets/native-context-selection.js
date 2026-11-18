/** Presentation preferences contain no result handles, readers or signals. */
export function normalizeNativeContextSelection(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const bounds=value.originalBounds;if(!Array.isArray(bounds)||bounds.length!==4||!bounds.every(v=>Number.isSafeInteger(v)&&v>=0)||bounds[2]<=bounds[0]||bounds[3]<=bounds[1])return null;
 const sourceSha256=typeof value.sourceSha256==='string'&&/^[a-f0-9]{64}$/i.test(value.sourceSha256)?value.sourceSha256.toLowerCase():null,domainFingerprint=typeof value.domainFingerprint==='string'&&value.domainFingerprint.length>0&&value.domainFingerprint.length<=256&&!/[\u0000-\u001f]/.test(value.domainFingerprint)?value.domainFingerprint:null;
 return sourceSha256||domainFingerprint?{sourceSha256,domainFingerprint,originalBounds:[...bounds]}:null;
}
export function nativeContextSelectionFor(output,fragment){const domain=output.sourceRegionDomain??output.provenance?.sourceRegionDomain;return normalizeNativeContextSelection({sourceSha256:domain?.sourceSha256??output.provenance?.originalSha256,domainFingerprint:domain?.fingerprint,originalBounds:fragment.originalBounds});}
function matches(output,fragment,selection){const current=nativeContextSelectionFor(output,fragment);if(!current||!selection||!current.originalBounds.every((v,i)=>v===selection.originalBounds[i]))return false;if(current.sourceSha256&&selection.sourceSha256)return current.sourceSha256===selection.sourceSha256;return!!current.domainFingerprint&&current.domainFingerprint===selection.domainFingerprint;}
/** Returns only an exact retained context. The caller chooses its fallback. */
export function findNativeContextSelection(output,fragments,selection){const preference=normalizeNativeContextSelection(selection);return preference&&Array.isArray(fragments)?fragments.findIndex(fragment=>matches(output,fragment,preference)):-1;}
