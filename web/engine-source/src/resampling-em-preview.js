import {checkAbort,requireValue} from './errors.js';
import {resamplingAnalysisParams,resamplingAnalysisRegions} from './resampling-analysis.js';
import {cachedPreviewGeometry,reservePreview,previewUnavailable} from './cached-parameter-preview.js';
const pending=new WeakMap(),prepaidBudget={reserve:()=>()=>{}};
export async function retireResamplingEmPreview(cache){
 const records=pending.get(cache);if(!records)return;
 let primary,hasFailure=false;for(const record of [...records])try{await record.retire();}catch(error){if(!hasFailure){hasFailure=true;primary=error;}}
 if(hasFailure)throw primary;
}
function sampleOwner(cache,release){
 let records=pending.get(cache);if(!records){records=new Set();pending.set(cache,records);}
 let finish;const ready=new Promise(resolve=>finish=resolve),record={frame:null,lease:null,closing:null,complete:false,finish,
  retire(){if(record.complete)return Promise.resolve();if(record.closing)return record.closing;const task=(async()=>{await ready;if(record.frame){await record.frame.release?.();record.frame=null;}if(record.lease){await record.lease.dispose();record.lease=null;}release();record.complete=true;records.delete(record);if(!records.size)pending.delete(cache);})();record.closing=task;void task.finally(()=>{if(record.closing===task)record.closing=null;}).catch(()=>{});return task;}
 };records.add(record);return record;
}
export async function previewCachedResampling(image,cache,input,preview={}, {budget,signal,onProgress,sourceRegion}={}){
 checkAbort(signal);const p=resamplingAnalysisParams(input),descriptor=image.surface?.descriptor??image.pixels,width=descriptor?.width,height=descriptor?.height;
 if(p.stage!=='probability'||!cache||cache.disposed)previewUnavailable('The requested native EM probability raster is not retained.');
 let master,sourceSha256,domainFingerprint=null;
 if(cache.sourceRegionIdentity){
  const {domain,original} = sourceRegion??{};
  if(!domain||!original||original.sha256!==domain.sourceSha256||domain.width!==width||domain.height!==height||cache.sourceRegionIdentity!==JSON.stringify([domain.sourceSha256,domain.fingerprint,p.size,p.regions]))previewUnavailable('The retained EM raster belongs to another Original, domain, neighborhood or selection.');
  master=cache.composite?.rgb;sourceSha256=domain.sourceSha256;domainFingerprint=domain.fingerprint;
 }else{
  const expected=JSON.stringify([p.size,resamplingAnalysisRegions(p,width,height)]),identity=cache.previewIdentity,domain=sourceRegion?.domain;
  if(!identity||identity.sourceSha256!==image.sha256||identity.width!==width||identity.height!==height||cache.analysis?.key!==expected)previewUnavailable('The retained EM raster belongs to another source, neighborhood or selection.');
  if(domain){
   const whole=domain.origin[0]===0&&domain.origin[1]===0&&domain.width===domain.sourceWidth&&domain.height===domain.sourceHeight&&domain.countIncluded===domain.sourceWidth*domain.sourceHeight;
   if(domain.sourceSha256!==identity.sourceSha256||domain.width!==width||domain.height!==height||identity.domainFingerprint!==null&&identity.domainFingerprint!==domain.fingerprint||identity.domainFingerprint===null&&!whole||identity.origin.some((v,i)=>v!==domain.origin[i]))previewUnavailable('The retained EM raster belongs to another source domain.');
   domainFingerprint=domain.fingerprint;
  }else if(identity.domainFingerprint!==null)previewUnavailable('The retained EM raster requires its original source domain.');
  master=cache.analysis?.rgb;sourceSha256=identity.sourceSha256;
 }
 if(!master?.lease||master.descriptor.width!==width||master.descriptor.height!==height||master.descriptor.format!=='rgb8')previewUnavailable('The retained EM RGB raster is unavailable.');
 await retireResamplingEmPreview(cache);checkAbort(signal);
 const g=cachedPreviewGeometry(width,height,{...preview,maxSide:preview.maxSide??640},budget,{bytesPerPixel:64,fixedBytes:Math.max(width*12,1024**2)}),release=reservePreview(budget,g.reservedBytes),record=sampleOwner(cache,release);let primary,hasPrimary=false,pixels;
 try{
  record.lease=master.lease();record.frame=await record.lease.readSampledWindow(g,{signal,budget:prepaidBudget});checkAbort(signal);
  const frame=record.frame.pixels;requireValue(frame.width===g.width&&frame.height===g.height&&frame.format==='rgb8'&&frame.data instanceof Uint8Array&&frame.data.length===g.pixels*3,'Invalid cached EM preview frame.');
  pixels={...frame,data:frame.data.slice(),logicalWidth:width,logicalHeight:height};onProgress?.({phase:'em-cached-preview',completed:1,total:1});checkAbort(signal);
 }catch(error){hasPrimary=true;primary=error;throw error;}finally{
  record.finish();try{await record.retire();}catch(cleanup){if(hasPrimary){if(primary!==null&&(typeof primary==='object'||typeof primary==='function')&&Object.isExtensible(primary))primary.cleanupErrors=[...(primary.cleanupErrors??[]),cleanup];}else throw cleanup;}
 }
 return{pixels,exact:false,metrics:{cacheOnly:true,exactNativeSamples:true,nativeAnalysisCalls:0,inferenceCalls:0,emFitCalls:0,scientificFinalChanged:false,admittedPreviewBytes:g.bytes,sampleDimensions:[g.width,g.height],sampleStep:g.step,sourceSha256,...(domainFingerprint?{strictSourceRegions:true,sourceRegionFingerprint:domainFingerprint}:{})},preview:{provisional:true,stage:'probability',size:p.size,regions:p.regions?.map(r=>r.slice())??null,coordinateSpace:'source',sampleStep:g.step,logicalDimensions:[width,height],sourceSha256,...(domainFingerprint?{sourceRegionFingerprint:domainFingerprint}:{})}};
}
