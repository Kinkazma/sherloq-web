import "../../runtime-context.js?v=0.33.2";
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {elabitrateParams,elabitrateNormalize,ELABITRATE_SEMANTICS} from './elabitrate.js';
import {elabitrateSourceHistogram,createElabitrateRenderer,segmentedElabitrate} from './segmented-elabitrate.js';
import {sourceRegionElabitrate} from './source-region-elabitrate.js';
import {createSourceRegionView} from './source-region-view.js';
import {parameterRegionGrid,parameterRegionMembership} from './source-region-preview-grid.js';
import {sampleSurface} from './display-sampling.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {DISPLAY_PREVIEW_MAX_SIDE,DISPLAY_PREVIEW_MAX_PIXELS} from './preview-limits.js';

const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(n=>n.toString(16).padStart(2,'0')).join('');
const cancelled=()=>new EngineError('CANCELLED','ELAB preview was replaced or cancelled.');
/** One captured canonical RGB8 Original and, optionally, its immutable scope.
 * Returned pixels have an explicit releasePixels ACK; takeExact transfers only
 * the complete record, after that temporary outbound frame has been released. */
export function createElabitratePreviewOwner(image,{budget,imageId,original=image,view,domain,isCurrent=()=>true,version}={}){
 const source=original.surface,d=source.descriptor,scope=domain?.fingerprint??null,width=domain?.width??d.width,height=domain?.height??d.height,origin=domain?.origin??[0,0],frames=new Set(),debts=new Set();let scopedView=view,ownsView=false,current,disposed=false,generation=0,controller,queue=Promise.resolve(),running=false,pending=0;
 requireValue(d.format==='rgb8'&&typeof imageId==='string','ELAB preview requires the canonical RGB8 owner.');
 const alive=()=>{if(disposed)throw new EngineError('DISPOSED','ELAB preview owner is disposed.');if(!isCurrent()||original.surface!==source||source.descriptor.id!==d.id||source.descriptor.revision!==d.revision)throw new EngineError('SOURCE_CHANGED','ELAB preview lost its captured RGB8 Original.');};
 const keyOf=(params,backend)=>JSON.stringify([elabitrateParams(params),backend??'auto',d.id,d.revision,original.sha256,scope]);
 const retireRecord=record=>retireCompositeOwners([()=>record?.surface?.dispose()]);
 function retainDebt(error){const child=error?.cleanupOwner;if(child?.dispose&&child!==owner)debts.add(child);return error;}
 async function retireDebts(){for(const owner of[...debts]){await owner.dispose();debts.delete(owner);}}
 async function receipt(step,w,h,included,sourceReads){if(!domain)return null;return{schema:'parameter-preview-region-grid/1',parentFingerprint:domain.fingerprint,derivedFingerprint:step===1?domain.fingerprint:await digest([domain.fingerprint,d.id,d.revision,step,w,h,included]),derivedFingerprintMeaning:'sampled-Original-lattice-and-membership',origin:[...origin],step,width:w,height:h,includedSamples:included,missingSamples:w*h-included,sourceReads,nativeSurfaceId:d.id,nativeRevision:d.revision,sourceSha256:original.sha256,inputDepth:8,sourceFormat:'rgb8'};}
 async function pixelsFor(entry,signal){
  const frame=await entry.record.surface.readWindow({x:0,y:0,width:entry.width,height:entry.height},{signal});let done=false,flight;const held={release(){if(done)return;if(flight)return flight;const work=Promise.resolve().then(()=>frame.release()).then(()=>{done=true;frames.delete(held);});flight=work;void work.catch(()=>{if(flight===work)flight=null;});return work;}};frames.add(held);
  return{pixels:{...frame.pixels,logicalWidth:width,logicalHeight:height},releasePixels:()=>held.release()};
 }
 async function sampled(params,step,{signal,backend,onProgress,maxWorkingBytes}){
  const w=Math.ceil(width/step),h=Math.ceil(height/step),bytes=w*h*3,cooperate=createCooperator(signal),plan=domain?parameterRegionGrid(domain,step):null;let histogram,sample,renderer,rendered,output,surface,staging,failed=false,primary;
  if(bytes*(backend==='webgpu'?12:5)+1024**2+(plan?.metadataBytes??0)+(plan?w*h:0)>maxWorkingBytes)throw new EngineError('MEMORY_LIMIT','ELAB sampled grid exceeds its admitted preview workspace.');
  try{
   staging=budget.reserve(bytes*2+8192+(plan?.metadataBytes??0)+(plan?w*h:0));histogram=await elabitrateSourceHistogram(original,{budget,signal,imageId,view:scopedView,domain,onProgress});const normalized=elabitrateNormalize(histogram.histogram,params),histogramCached=histogram.cached,histogramReads=histogram.sourceReads;histogram.release();histogram=null;
   sample=await sampleSurface(source,{x:origin[0],y:origin[1],w:width,h:height,step},{budget,signal});checkAbort(signal);const data=new Uint8Array(sample.pixels.data),membership=plan?parameterRegionMembership(domain,plan):null,included=membership?.included??w*h;
   renderer=createElabitrateRenderer(budget,backend);
   if(membership){const packed=new Uint8Array(included*3);let at=0;for(let row=0;row<h;row++){await cooperate();for(let x=0;x<w;x++){const index=row*w+x;if(membership.mask[index]){packed.set(data.subarray(index*3,index*3+3),at);at+=3;}}}rendered=await renderer.render({width:included,height:1,format:'rgb8',data:packed},normalized.lut,{signal});at=0;for(let row=0;row<h;row++){await cooperate();for(let x=0;x<w;x++){const index=row*w+x;if(membership.mask[index]){data.set(rendered.data.subarray(at,at+3),index*3);at+=3;}}}}
   else{rendered=await renderer.render(sample.pixels,normalized.lut,{signal});data.set(rendered.data);}
   output=await createSegmentedBytes(bytes,{budget,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession,signal,owner:'ela.bitrate',label:'exact-native-sampled-preview'});await output.write(data,0);await output.flush();checkAbort(signal);surface=createRgbSurface(output,{width:w,height:h,budget});const sourceRegionSampling=await receipt(step,w,h,included,histogramReads+1),metrics={...renderer.metrics(),histogramCached,histogramSourceReads:histogramReads,sourceReads:histogramReads+1,exactNativeGrid:false,exactNativeSamples:true,nativeInputDepth:8,...(sourceRegionSampling?{sourceRegionSampling}:{})};
   return{record:{surface,data:normalized.data,semantics:ELABITRATE_SEMANTICS,metrics},width:w,height:h,step,sourceRegionSampling};
  }catch(error){failed=true;primary=error;throw error;}
  finally{try{await retireCompositeOwners([()=>rendered?.release(),()=>renderer?.dispose(),()=>sample?.release(),()=>histogram?.release(),()=>staging?.(),...(failed?[()=>surface?surface.dispose():output?.dispose()]:[])],failed?{primary}:{});}catch(error){if(!failed)await retireCompositeOwners([()=>surface?surface.dispose():output?.dispose()],{primary:error});throw error;}}
 }
 const owner={
  get fingerprint(){return scope;},get hasPendingRetirements(){return debts.size>0;},
  preview(params,{step=1,maxSide=DISPLAY_PREVIEW_MAX_SIDE,maxPixels=DISPLAY_PREVIEW_MAX_PIXELS,maxWorkingBytes=128*1024**2,signal,backend='auto',onProgress}={}){
   const ticket=++generation;controller?.abort();controller=new AbortController();const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal,parameters=elabitrateParams(params);
   pending++;const work=queue.then(async()=>{running=true;let next;try{await retireDebts();alive();checkAbort(combined);if(ticket!==generation)throw cancelled();if(domain&&!scopedView){scopedView=await createSourceRegionView({...source,sha256:original.sha256},domain.descriptor,{budget});ownsView=true;alive();checkAbort(combined);}requireValue(Number.isSafeInteger(step)&&step>0&&Number.isSafeInteger(maxSide)&&maxSide>0&&maxSide<=DISPLAY_PREVIEW_MAX_SIDE&&Number.isSafeInteger(maxPixels)&&maxPixels>0&&maxPixels<=DISPLAY_PREVIEW_MAX_PIXELS&&Number.isSafeInteger(maxWorkingBytes)&&maxWorkingBytes>0,'ELAB preview requires bounded native sampling.');const w=Math.ceil(width/step),h=Math.ceil(height/step);requireValue(w<=maxSide&&h<=maxSide&&w*h<=maxPixels,'The ELAB preview frame exceeds its admitted display grid.');const key=keyOf(parameters,backend),cached=current?.key===key&&current.step===step;
     if(!cached){if(step===1){let record;if(domain){await sourceRegionElabitrate({task:{id:'elab-preview-'+ticket,imageId,operation:'ela.bitrate',params:parameters,backend},original,view:scopedView,domain,budget,signal:combined,onProgress,version,allowPreviewPromotion:false,publishResult:(_id,value)=>{record=value;return{surface:value.surface.descriptor};}});}else record=await segmentedElabitrate(image,parameters,{budget,imageId,signal:combined,onProgress,backend});const sourceRegionSampling=await receipt(step,w,h,domain?.countIncluded??w*h,(record.metrics.histogramSourceReads??0)+(record.metrics.blocks??0));next={record,width:w,height:h,step,sourceRegionSampling};}
      else next=await sampled(parameters,step,{signal:combined,backend,onProgress,maxWorkingBytes});
      alive();checkAbort(combined);if(ticket!==generation)throw cancelled();const previous=current;current={...next,key};next=null;await retireRecord(previous?.record);
     }
     alive();checkAbort(combined);const frame=await pixelsFor(current,combined);try{alive();checkAbort(combined);return{...current,...frame,exact:step===1,cached:!!cached,setupMilliseconds:0,metrics:{...current.record.metrics,cache:{result:!!cached},sourceReads:cached?0:current.record.metrics.sourceReads??((current.record.metrics.histogramSourceReads??0)+(current.record.metrics.blocks??0)),exactNativeGrid:step===1,nativeInputDepth:8,...(current.sourceRegionSampling?{sourceRegionSampling:current.sourceRegionSampling}:{})}};}catch(error){await retireCompositeOwners([()=>frame.releasePixels()],{primary:error});throw error;}
    }catch(error){if(next)await retireCompositeOwners([()=>retireRecord(next.record)],{primary:error});throw retainDebt(error);}finally{running=false;pending--;}});queue=work.catch(()=>{});return work;
  },
  takeExact(params,intent='auto'){alive();if(pending||running||frames.size)throw new EngineError('BUSY','Release the ELAB preview frame before final promotion.');if(debts.size)throw new EngineError('BUSY','ELAB preview retirement is pending.');const backend=typeof intent==='string'?intent:intent?.backend??'auto';if(current?.step!==1||current.key!==keyOf(params,backend))return null;const record=current.record;current=null;return record;},
  async dispose(){disposed=true;generation++;controller?.abort();await queue;try{await retireDebts();await retireCompositeOwners([...frames].map(frame=>()=>frame.release()));if(current){const previous=current;current=null;try{await retireRecord(previous.record);}catch(error){const debt=error.cleanupOwner??{dispose:()=>retireRecord(previous.record)};debts.add(debt);throw withRetirementOwner(error,owner,error);}}if(ownsView&&scopedView){await scopedView.dispose();scopedView=null;}}catch(error){throw retainDebt(error);}}
 };return owner;
}
