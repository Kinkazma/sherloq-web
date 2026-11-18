import {nativePreviewAnswerOwned,acceptNativePreviewAnswer,presentNativePreviewAnswer} from './native-preview-answer.js?v=0.33.2';
import {NATIVE_PREVIEW_PRESENTATIONS} from './unified-engine/src/native-preview-peer-finance.js';
import {withRetirementOwner} from './unified-engine/src/owner-retirement-error.js';

export {nativePreviewAnswerOwned};

// This is invoked only after a native capability has been observed. The
// ordinary eight-bit callback retains its original return path unchanged.
export function acceptNativePreviewForUI(answer,isCurrent){return acceptNativePreviewAnswer(answer,isCurrent);}

/** The explicit adopted callback marks the actual result=surface assignment.
 * Creating a view and subsequently declining to publish must close that view;
 * dropping its RGB DTO alone cannot retire an already adopted canvas. */
export async function showNativePreviewForUI(answer,{isCurrent,options,show}){
 if(isCurrent?.()!==true)return;
 const surface=await presentNativePreviewAnswer(answer,options);let adopted=false,primary,failed=false;
 try{if(isCurrent?.()!==true)return;return await show(surface,()=>{adopted=true;});}
 catch(error){failed=true;primary=error;throw error;}
 finally{if(!adopted)try{const value=await surface.close();if(value===false||value===0)throw value;}catch(cleanup){
  if(failed)throw withRetirementOwner(primary,{dispose:()=>surface.close()},cleanup);throw withRetirementOwner(cleanup,{dispose:()=>surface.close()},cleanup);
 }}
}

/** Captured UI session before captured client. reset preserves the reusable
 * session for a later tool/source; the panel's final disposal may dispose it. */
export async function retireNativePreviewClient(client,session){
 if(client?.hasNativeParameterPresentations!==true)return;
 session?.reset('native-client-retire',{restoreResult:false});
 await session?.settled();await session?.retireNativeAnswers?.();
 await client[NATIVE_PREVIEW_PRESENTATIONS]();
}
