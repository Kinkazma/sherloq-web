import "../../runtime-context.js?v=0.33.3";
import {checkAbort,createCooperator,normalizeResourceError} from './errors.js';
import {elabitrateParams,elabitrateNormalize,ELABITRATE_SEMANTICS} from './elabitrate.js';
import {createElabitrateRenderer,elabitrateSourceHistogram} from './segmented-elabitrate.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {retireCompositeOwners} from './composite-owner-release.js';

// Both passes visit the same admitted native rectangles. Gaps and explicit
// exclusions never contribute to the shared min/max; their original RGB is
// copied separately as presentation background only.
export async function sourceRegionElabitrate({task,original,view,domain,budget,signal,onProgress,publishResult,version,allowPreviewPromotion=true}){
 const params=elabitrateParams(task.params),width=domain.width,height=domain.height,cooperate=createCooperator(signal),windowPixels=65536;
 const provenance=backend=>({engine:version,params,backend,originalSha256:original.sha256,precision:{requestedWorkingDepth:8,effectiveWorkingDepth:8,numericalInputDepth:8,inputFormat:'rgb8',conversion:'declared-sdr-rgb8-presentation'},sourceRegionDomain:domain.descriptor,excludedParticipation:'omitted-before-global-histogram',presentationOutsideDomain:'original-unanalysed',originalEncodedBytesPreserved:true});
 const preview=original.elabitratePreviewOwner;
 if(allowPreviewPromotion&&preview?.fingerprint===domain.fingerprint){
  checkAbort(signal);const record=preview.takeExact(params,task.backend??'auto');
  if(record){let published=false;try{const metrics={...record.metrics,originalCalculation:{...record.metrics},promotedPreview:true,nativeComputations:0,sourceReads:0,gpuJobs:0,workerJobs:0,renderBackend:'retained-proxy',cache:{result:true,promoted:true}},bundle=publishResult(task.imageId,record);published=true;return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,display:bundle.surface,data:record.data,metrics,semantics:record.semantics,provenance:provenance(metrics.backend)};}catch(error){if(!published)await retireCompositeOwners([()=>record.surface.dispose()],{primary:error});throw error;}}
 }
 let output,surface,metadata,planning,renderer,histogramOwner,published=false,failed=false,primary;
 try{
  metadata=budget.reserve(8192);planning=budget.reserve(Math.max(width*3,windowPixels*3)*2+1024**2+(task.backend==='webgpu'?12*1024**2:0));
  output=await createSegmentedBytes(width*height*3,{budget,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession,signal,owner:'ela.bitrate',label:'admitted-normalized-RGB8'});planning();planning=null;
  histogramOwner=await elabitrateSourceHistogram(original,{budget,signal,imageId:task.imageId,view,domain,onProgress:f=>onProgress?.({...f,total:f.total*2})});const cached=histogramOwner.cached,sourceReads=histogramOwner.sourceReads,normalized=elabitrateNormalize(histogramOwner.histogram,params);histogramOwner.release();histogramOwner=null;renderer=createElabitrateRenderer(budget,task.backend??'auto');
  const rows=Math.max(1,Math.min(64,Math.floor(windowPixels/width)));
  for(let y=0;y<height;y+=rows){await cooperate();const h=Math.min(rows,height-y),window=await original.surface.readWindow({x:domain.origin[0],y:domain.origin[1]+y,width,height:h},{signal});try{await output.write(window.pixels.data,y*width*3);}finally{await window.release();}}
  let blocks=0;
  await view.visitIncluded(async(pixels,{completed,rect})=>{await cooperate();let rendered,bandFailed=false,bandPrimary;try{rendered=await renderer.render(pixels,normalized.lut,{signal});for(let row=0;row<rect.height;row++)await output.write(rendered.data.subarray(row*rect.width*3,(row+1)*rect.width*3),((rect.y+row)*width+rect.x)*3);checkAbort(signal);blocks++;}catch(error){bandFailed=true;bandPrimary=error;throw error;}finally{await retireCompositeOwners([()=>rendered?.release()],bandFailed?{primary:bandPrimary}:{});}onProgress?.({phase:'elabitrate-admitted-lookup',completed:domain.countIncluded+completed+rect.width*rect.height,total:domain.countIncluded*2});},{signal,windowPixels});
  await output.flush();checkAbort(signal);surface=createRgbSurface(output,{width,height,budget});const metrics={...renderer.metrics(),blocks,histogramCached:cached,histogramSourceReads:sourceReads,includedPixels:domain.countIncluded,excludedPixels:width*height-domain.countIncluded,sourceRegionPolicy:'global-admitted-RGB8-histogram',retainedResultBytes:width*height*3},semantics=ELABITRATE_SEMANTICS+' Excluded pixels retain the original for display only.';await renderer.dispose();renderer=null;
  const bundle=publishResult(task.imageId,{surface,data:normalized.data,metrics,semantics});published=true;
  return{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',...bundle,display:bundle.surface,data:normalized.data,metrics,semantics,provenance:provenance(metrics.backend)};
 }catch(error){failed=true;primary=normalizeResourceError(error);throw primary;}
 finally{await retireCompositeOwners([()=>renderer?.dispose(),...(!published?[()=>surface?surface.dispose():output?.dispose()]:[]),()=>histogramOwner?.release(),()=>planning?.(),()=>metadata?.()],failed?{primary}:{});}
}
