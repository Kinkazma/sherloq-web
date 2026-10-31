import {createAdaptivePreview} from './adaptive-preview.js?v=0.31.0';
const adaptive=createAdaptivePreview({targetMs:50,minSide:16,initialSide:128});
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
/** One measured request, including all native contexts and transport, supplies
 * one feedback token. The engine chooses the admitted aggregate source grid.
 * This function is called inside the client's serial engine queue. */
export async function previewGhostContexts({engine,task,source,domain,signal,assertCurrent=()=>{},memoryBudgetBytes}={}){
 const current=()=>{if(signal?.aborted)fail('CANCELLED','Scoped Ghost draft cancelled.');assertCurrent();};
 current();if(!domain||typeof engine?.previewParameters!=='function')fail('PREVIEW_UNAVAILABLE','Scoped Ghost drafts need the native context preview API.');
 const memory=(await engine.capabilities()).memory??{};current();const limit=memory.budgetBytes??memoryBudgetBytes??64*1024**2,available=memory.policyAvailableBytes??Math.max(0,limit-(memory.retainedBytes??0)-(memory.cacheBytes??0)-(memory.activeReservationBytes??0)),maxWorkingBytes=Math.max(0,Math.floor(Math.min(limit/3,available))),plan=adaptive.plan({key:'jpeg.ghosts/scoped-recompression/q'+(Math.floor(((task.params?.high??90)-(task.params?.low??50))/(task.params?.step??5))+1),width:Math.max(16,domain.width),height:Math.max(16,domain.height),maxSide:2048,maxPixels:2048**2}),maxPixels=Math.max(256,plan.pixels),maxSide=Math.max(16,plan.side),lease=await engine.reserveExternalMemory({bytes:maxPixels*3+65536});let answer,primary;
 try{
  current();const started=performance.now();answer=await engine.previewParameters({...task,id:'ghost-context-preview-'+crypto.randomUUID(),imageId:source.id,sourceRegionDomain:domain},{preview:{maxSide,maxPixels,maxWorkingBytes,targetMs:50},signal});current();
  const pixels=answer?.pixels;if(!pixels||pixels.format!=='rgb8'||!(pixels.data instanceof Uint8Array)||pixels.data.length!==pixels.width*pixels.height*3||pixels.width*pixels.height>maxPixels||pixels.width>2048||pixels.height>2048)fail('INVALID_RESULT','Scoped Ghost draft exceeded its aggregate admitted display frame.');
  const milliseconds=performance.now()-started,count=answer.metrics?.samplePixels,cached=answer.metrics?.recompressions===0&&answer.metrics?.sourceReads===0,feedback=adaptive.observe(plan,{milliseconds,pixels:count,cold:false,cached});
  answer={...answer,provisional:true,metrics:{...answer.metrics,adaptivePreview:{token:plan.token,milliseconds,pixels:count,cold:false,setupMilliseconds:0,cached,feedback}}};
 }catch(error){primary=error;throw error;}finally{try{await engine.releaseExternalMemory(lease.id);}catch(error){if(primary){if(Object.isExtensible(primary))primary.previewCleanupError={code:error.code,message:error.message};}else throw error;}}
 current();return answer;
}
