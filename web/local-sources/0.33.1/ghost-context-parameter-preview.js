import {createAdaptivePreview,ADAPTIVE_PREVIEW_MAX_SIDE,ADAPTIVE_PREVIEW_MAX_PIXELS} from './adaptive-preview.js?v=0.33.1';
import {recompressionSizingIdentity} from './recompression-controls.js?v=0.33.1';
const adaptive=createAdaptivePreview(),measuredFamilies=new Set();
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
/** One measured request, including all native contexts and transport, supplies
 * one feedback token. The engine chooses the admitted aggregate source grid.
 * This function is called inside the client's serial engine queue. */
export async function previewGhostContexts({engine,task,source,domain,signal,assertCurrent=()=>{},memoryBudgetBytes}={}){
 const current=()=>{if(signal?.aborted)fail('CANCELLED','Scoped Ghost draft cancelled.');assertCurrent();};
 current();if(!domain||typeof engine?.previewParameters!=='function')fail('PREVIEW_UNAVAILABLE','Scoped Ghost drafts need the native context preview API.');
 const memory=(await engine.capabilities()).memory??{};current();const limit=memory.budgetBytes??memoryBudgetBytes??64*1024**2,available=memory.policyAvailableBytes??Math.max(0,limit-(memory.retainedBytes??0)-(memory.cacheBytes??0)-(memory.activeReservationBytes??0)),maxWorkingBytes=Math.max(0,Math.floor(Math.min(limit/3,available))),family='jpeg.ghosts/scoped-recompression/'+recompressionSizingIdentity(task.params)+'/qualities='+Math.floor(Math.log2(1+Math.floor(((task.params?.high??90)-(task.params?.low??50))/(task.params?.step??5)))),plan=adaptive.plan({key:family,sourceIdentity:JSON.stringify([source.sha256??domain.sourceSha256,domain.fingerprint]),width:Math.max(16,domain.width),height:Math.max(16,domain.height),maxSide:ADAPTIVE_PREVIEW_MAX_SIDE,maxPixels:ADAPTIVE_PREVIEW_MAX_PIXELS}),maxPixels=Math.max(256,plan.pixels),maxSide=Math.max(16,plan.side),lease=await engine.reserveExternalMemory({bytes:maxPixels*3+65536});let answer,primary;
 try{
  current();const started=performance.now();answer=await engine.previewParameters({...task,id:'ghost-context-preview-'+crypto.randomUUID(),imageId:source.id,sourceRegionDomain:domain},{preview:{maxSide,maxPixels,maxWorkingBytes,targetMs:plan.token.targetMs},signal});current();
  const pixels=answer?.pixels;if(!pixels||pixels.format!=='rgb8'||!(pixels.data instanceof Uint8Array)||pixels.data.length!==pixels.width*pixels.height*3||pixels.width*pixels.height>maxPixels||pixels.width>ADAPTIVE_PREVIEW_MAX_SIDE||pixels.height>ADAPTIVE_PREVIEW_MAX_SIDE)fail('INVALID_RESULT','Scoped Ghost draft exceeded its aggregate admitted display frame.');
  const milliseconds=performance.now()-started,count=answer.metrics?.samplePixels,cached=answer.metrics?.recompressions===0&&answer.metrics?.sourceReads===0,cold=answer.metrics?.cold===true,setupMilliseconds=answer.metrics?.setupMilliseconds??0,initializationUnknown=answer.metrics?.initializationUnknown===true||!measuredFamilies.has(family)&&!cached&&setupMilliseconds===0,feedback=adaptive.observe(plan,{milliseconds,pixels:count,cold,setupMilliseconds,initializationUnknown,cached});if(!cached)measuredFamilies.add(family);
  answer={...answer,provisional:true,metrics:{...answer.metrics,adaptivePreview:{token:plan.token,milliseconds,pixels:count,cold,setupMilliseconds,initializationUnknown,cached,feedback}}};
 }catch(error){primary=error;throw error;}finally{try{await engine.releaseExternalMemory(lease.id);}catch(error){if(primary){if(Object.isExtensible(primary))primary.previewCleanupError={code:error.code,message:error.message};}else throw error;}}
 current();return answer;
}
