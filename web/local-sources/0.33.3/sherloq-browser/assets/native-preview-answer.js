import {nativePreviewAnswerRecord as rowFor,registerNativePreviewAnswer} from './unified-engine/src/native-preview-peer-finance.js';
import {EngineError,requireValue} from './unified-engine/src/errors.js';
import {withRetirementOwner} from './unified-engine/src/owner-retirement-error.js';
import {createPreviewSurface} from './remote-surface.js?v=0.33.3';

// Local capabilities, keyed by the already-transferred backing. Ordinary
// answer/held-preview spreads retain this binding without adding wire fields.
// Cloned/session-restored buffers are not capabilities issued by this owner.
const ack=async fn=>{const value=await fn();if(value===false||value===0)throw value;return value;};

export function nativePreviewAnswerOwned(answer){return !!rowFor(answer);}

/** The frame capacity is claimed BEFORE the existing preview RPC starts.
 * No release function or test observer is sent through that RPC. */
export async function produceNativePreviewAnswer(owner,{width,height,epoch,signal},produce){
 const frame=await owner.begin({width,height,epoch,signal});
 try{
  const answer=await frame.produce(()=>produce(frame)),data=answer?.pixels?.data;
  registerNativePreviewAnswer(answer,{frame,retired:false,retiring:null,presentation:null,constructionOwner:null});
  return answer;
 }catch(primary){try{await frame.drop();}catch(cleanup){throw withRetirementOwner(primary,frame,cleanup);}throw primary;}
}

/** Native-only branch. The ordinary eight-bit surface constructor is never
 * called through this helper and has no new owner, copy, await or RPC. */
export async function presentNativePreviewAnswer(answer,options={}){
 const row=rowFor(answer);
 requireValue(row&&!row.retired&&!row.presentation&&!row.constructionOwner,'A live native answer is required for presentation.');
 await row.frame.render({document:options.document});
 const backing=row.frame.adoptPresentation();row.presentation=backing;
 try{
  const pixels={...answer.pixels,preview:true,logicalWidth:answer.pixels.logicalWidth??answer.logicalWidth??answer.pixels.width,logicalHeight:answer.pixels.logicalHeight??answer.logicalHeight??answer.pixels.height};
  return createPreviewSurface(pixels,{...options,nativeBacking:backing});
 }
 catch(primary){
  // background.fork() can fail before the surface constructor's own try.
  // Its child owner does not imply retirement of our already adopted backing.
  const child=primary?.cleanupOwner;let childClosed=!child,backingClosed=false;
  row.constructionOwner={async dispose(){
   if(!childClosed){requireValue(typeof child.dispose==='function','The partial presentation child is not retirable.');await ack(()=>child.dispose());childClosed=true;}
   if(!backingClosed){await ack(()=>backing.close());backingClosed=true;}
  }};
  throw withRetirementOwner(primary,{dispose:()=>retireNativePreviewAnswer(answer)},primary?.cleanupError);
 }
}

/** Always called by the result/session finally, including after adoption.
 * After this local ACK the consumer may not use the RGB DTO again. A displayed
 * canvas has a separate owner/refcount and remains financed until last close.
 * Ending JS ownership does not assert physical garbage collection. */
export function retireNativePreviewAnswer(answer){
 const row=rowFor(answer);if(!row||row.retired)return Promise.resolve();if(row.retiring)return row.retiring;
 const task=(async()=>{
  if(row.constructionOwner){await ack(()=>row.constructionOwner.dispose());row.constructionOwner=null;row.presentation=null;}
  await row.frame.drop();row.retired=true;row.frame=null;
 })();row.retiring=task;void task.finally(()=>{if(row.retiring===task)row.retiring=null;}).catch(()=>{});return task;
}

/** A preview callback can decide that a completed answer is obsolete before
 * handing it to the session. Preserve its primary failure and retirement owner. */
export async function acceptNativePreviewAnswer(answer,isCurrent){
 if(!nativePreviewAnswerOwned(answer))return typeof isCurrent!=='function'||isCurrent()?answer:null;
 let primary,failed=false,current=false;
 try{current=typeof isCurrent==='function'&&isCurrent()===true;if(current)return answer;}
 catch(error){failed=true;primary=error;}
 try{await retireNativePreviewAnswer(answer);}catch(cleanup){
  const owner={dispose:()=>retireNativePreviewAnswer(answer)};
  throw withRetirementOwner(failed?primary:new EngineError('CANCELLED','Native preview was not accepted.'),owner,cleanup);
 }
 if(failed)throw primary;return null;
}
