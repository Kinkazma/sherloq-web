import "../../runtime-context.js?v=0.25.0";
import {sourceRegionResult} from './source-region-dispatch.js';
/** Preserve the ordinary synchronous contract, await strict spilled banks, and keep typed-array
 * owners. Only public identity/provenance changes; no surface is published. */
export function sourceRegionRawResult(answer,context){
 if(answer&&typeof answer.then==='function')return Promise.resolve(answer).then(value=>sourceRegionRawResult(value,context));
 if(!context)return answer;
 const {task,original,entry,domain,localization}=context;
 return sourceRegionResult(answer,{task,original,domain,cacheIdentity:entry.id,localization});
}
