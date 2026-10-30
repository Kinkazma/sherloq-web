import {pdfPagePaintCapabilities} from './batch-import.js?v=0.30.0';

// PDF.js gives getOperatorList() a distinct OPLIST intent. Its numeric offsets
// and object IDs need not match the display list. Keep this version adapter
// isolated; never guess an offset or identify a bitmap by a transient object ID.
const plans=new WeakMap(),validatedLists=new WeakMap();
const failure=message=>Object.assign(Error(message),{code:'PDF_RENDER_OPERATORS_UNSUPPORTED'});
const signature=(list,index,OPS)=>{
 const kind=list.fnArray[index]===OPS.paintImageXObject?'paintImageXObject':'paintInlineImageXObject',args=list.argsArray[index],width=kind==='paintImageXObject'?args?.[1]:args?.[0]?.width,height=kind==='paintImageXObject'?args?.[2]:args?.[0]?.height;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1)throw failure('The PDF image operator has no valid native dimensions.');
 return{kind,width,height};
};
const same=(a,b)=>a.kind===b.kind&&a.width===b.width&&a.height===b.height;
function validateCapabilities(capabilities){
 if(capabilities?.schema!=='pdf-simple-image-paint/1'||capabilities.simpleImagePainting!==true||!Array.isArray(capabilities.imageOperators)||!capabilities.imageOperators.length||capabilities.imageOperators.some((n,i,a)=>!Number.isSafeInteger(n)||n<0||i>0&&n<=a[i-1]))throw failure('Certified ordered PDF image occurrences are required.');
}
function sameIndices(a,b){return a.length===b.length&&a.every((value,i)=>value===b[i]);}
async function pagePlan(page,capabilities){
 let promise=plans.get(capabilities);
 if(!promise){promise=(async()=>{const {OPS,version}=await import('./pdf-native-library.js?v=0.30.0');if(version!=='5.6.205')throw failure('This PDF.js version has no qualified display operator adapter.');const list=await page.getOperatorList(),actual=pdfPagePaintCapabilities(list,OPS);if(!actual.simpleImagePainting||!sameIndices(actual.imageOperators,capabilities.imageOperators))throw failure('The logical PDF image occurrences do not match their extraction list.');return{page,OPS,logical:[...actual.imageOperators],signatures:actual.imageOperators.map(index=>signature(list,index,OPS))};})();plans.set(capabilities,promise);promise.catch(()=>plans.delete(capabilities));}
 const plan=await promise;if(plan.page!==page||!sameIndices(plan.logical,capabilities.imageOperators))throw failure('The logical PDF image certificate belongs to a different source.');return plan;
}

/** Seed this while the extraction list is live. PDF.js cleanup can later
 * rebuild that OPLIST intent with different offsets; its logical occurrences
 * must continue to refer to the original extracted image records. */
export function preparePdfRenderOperators(page,capabilities,{signal}={}){
 signal?.throwIfAborted();validateCapabilities(capabilities);return abortable(pagePlan(page,capabilities),signal);
}

function abortable(promise,signal){
 if(!signal)return promise;signal.throwIfAborted();
 return new Promise((resolve,reject)=>{let settled=false;const finish=(callback,value)=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);callback(value);},abort=()=>finish(reject,signal.reason??new DOMException('PDF operator validation cancelled.','AbortError'));signal.addEventListener('abort',abort,{once:true});promise.then(value=>finish(resolve,value),error=>finish(reject,error));});
}

/** Map only certified image paints back to their extraction occurrences. The
 * display list is already retained by PDF.js: no new raster, bitmap or PDF pass
 * is created, and its complete context is checked before the first paint. */
export async function createPdfRenderOperatorBridge(page,capabilities,{signal}={}){
 const plan=await preparePdfRenderOperators(page,capabilities,{signal}),logical=plan.logical;
 let task,timer=null,closed=false,checked=false,rejectReady,resolveReady;
 const mapping=new Map(),ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});ready.catch(()=>{});
 const clear=()=>{if(timer!==null)clearTimeout(timer);timer=null;};
 const reject=error=>{if(closed)return;closed=true;clear();rejectReady(error);task?.cancel();};
 function inspect(){
  const list=task?._internalRenderTask?.operatorList;
  if(!list||!Array.isArray(list.fnArray)||!Array.isArray(list.argsArray)||typeof list.lastChunk!=='boolean')throw failure('The qualified PDF.js display operator list is unavailable.');
  if(!list.lastChunk)return false;
  let validated=validatedLists.get(list);
  if(!validated||validated.plan!==plan||validated.length!==list.fnArray.length||validated.fnArray!==list.fnArray||validated.argsArray!==list.argsArray){
   const actual=pdfPagePaintCapabilities(list,plan.OPS);
   if(!actual.simpleImagePainting||actual.imageOperators.length!==logical.length)throw failure('The rendered PDF image context differs from its certified occurrences.');
   for(let i=0;i<logical.length;i++)if(!same(signature(list,actual.imageOperators[i],plan.OPS),plan.signatures[i]))throw failure('The rendered PDF image type or native dimensions changed.');
   // This pinned PDF.js list is immutable after lastChunk; a new list is
   // validated once, while subsequent retained windows reuse its image map.
   validated={plan,length:list.fnArray.length,fnArray:list.fnArray,argsArray:list.argsArray,indices:actual.imageOperators};validatedLists.set(list,validated);
  }
  for(let i=0;i<logical.length;i++)mapping.set(validated.indices[i],logical[i]);
  checked=true;resolveReady();return true;
 }
 return{
  ready,
  bind(value){if(task||closed)throw failure('The PDF operator bridge was already attached.');task=value;const resume=continuation=>{if(closed)return;if(checked){continuation();return;}const wait=()=>{timer=null;if(closed)return;try{if(inspect())continuation();else timer=setTimeout(wait,5);}catch(error){reject(error);}};wait();};task.onContinue=resume;task.promise.then(()=>{if(!checked)reject(failure('The PDF display ended before operator validation.'));},error=>{if(!closed){closed=true;clear();rejectReady(error);}});},
  logicalImage(index){if(!checked)throw failure('PDF image display started before operator validation.');return mapping.get(index);},
  dispose(){const pending=!closed&&!checked;closed=true;clear();if(task)task.onContinue=null;mapping.clear();if(pending)rejectReady(failure('PDF operator validation was cancelled.'));}
 };
}
