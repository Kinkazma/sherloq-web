import {sourceRegionResult} from './source-region-dispatch.js';
/** Preserve the synchronous raw-grid contract and the original typed-array
 * owners. Only public identity/provenance changes; no surface is published. */
export function sourceRegionRawResult(answer,context){
 if(!context)return answer;
 const {task,original,entry,domain,localization}=context;
 return sourceRegionResult(answer,{task,original,domain,cacheIdentity:entry.id,localization});
}
