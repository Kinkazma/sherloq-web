import "../../runtime-context.js?v=0.31.0";
import {DISPLAY_PREVIEW_MAX_SIDE,DISPLAY_PREVIEW_MAX_PIXELS} from './preview-limits.js';
import {usesAlternateRecompression,resolveRecompressionPlan} from './recompression-plan.js';
import {recompressPixels} from './recompression-surface.js';
import {renderElaPreviewPair,composeElaPreviewJpeg,nativeJpegPreviewCodec} from './ela-preview-render.js';
import {acquireSourceRegionRecompression,hasSourceRegionRecompression} from './source-region-recompression.js';
import {validateParams} from './ela.js';
import {toneTable} from './ela-lut.js';
import {acquireSourceRegionJpeg} from './source-region-ela.js';
import {requireValue,checkAbort,EngineError} from './errors.js';
const MAX_SIDE=DISPLAY_PREVIEW_MAX_SIDE,MAX_CONTEXTS=8192,MiB=1024**2;
/** Reduced JPEG streams remain separate per exact admitted native context. */
export async function previewSourceRegionClassic({imageId,params,side,original,derived,view,domain,budget,codec,signal,backend='auto',gpuService}){
 const p=validateParams(params),alternate=usesAlternateRecompression(p),codecPlan=alternate?await resolveRecompressionPlan(p,original,{signal}):null;requireValue(Number.isSafeInteger(side)&&side>=1&&side<=MAX_SIDE,'Invalid scoped Classic preview side.');
 const step=Math.max(1,Math.ceil(Math.max(domain.width,domain.height)/side)),width=Math.ceil(domain.width/step),height=Math.ceil(domain.height/step),n=width*height,rects=[];
 for(const r of view.admittedRectangles()){if(rects.length===MAX_CONTEXTS)throw new EngineError('SOURCE_SCOPE_PREVIEW_UNSUPPORTED','The provisional JPEG context count exceeds its admitted metadata bound.');rects.push({...r});}
 const prefix=imageId+'\0ela-context-preview/',identity=JSON.stringify([original.sha256,domain.fingerprint,domain.origin,domain.width,domain.height,step,rects,alternate?codecPlan.identity:codec.id]),pairKey=prefix+'jpeg-pairs',sourceKey=prefix+'presentation';
 const native=alternate?hasSourceRegionRecompression(derived,domain,codecPlan):derived.rgbRecompression?.entries?.has(p.quality)===true;
 const pairIdentity=identity+'/'+(alternate?codecPlan.identity:p.quality)+'/'+(native?'retained-native-recompression':'reduced-context-recompression');
 let entry=budget.get(pairKey);if(entry?.identity!==pairIdentity){budget.remove(pairKey);entry=null;}
 let base=budget.get(sourceKey);if(base?.identity!==identity){budget.remove(sourceKey);base=null;}
 // Pin cache arrays before any await/allocation can evict them.
 if(entry)budget.take(pairKey);if(base)budget.take(sourceKey);
 let resident,sample,borrowed,failed=false,recompressions=0,scientificReads=0;const cacheHit=!!entry;
 try{
  if(!entry&&native)borrowed=alternate?await acquireSourceRegionRecompression({params:p,original,derived,view,domain,budget,signal}):await acquireSourceRegionJpeg({quality:p.quality,original,derived,view,domain,budget,signal});
  resident=budget.reserve(40*MiB+18*n+rects.length*512);
  if(!base){sample=await original.surface.readSampledWindow({x:domain.origin[0],y:domain.origin[1],w:domain.width,h:domain.height,step},{signal});checkAbort(signal);requireValue(sample.pixels?.width===width&&sample.pixels.height===height&&sample.pixels.format==='rgb8','The scoped presentation changed its sample grid.');base={identity,data:sample.pixels.data.slice(),byteLength:3*n};await sample.release();sample=null;}
  const tableStarted=performance.now(),table=await toneTable(p,{signal}),tableMilliseconds=performance.now()-tableStarted,composedFrames=new Map();
  const renderMetrics={backend:'cpu',gpuRenderCalls:0,gpuComposeCalls:0,gpuRecompressionCalls:0,gpuRenderMs:0,gpuKernelMilliseconds:0,gpuPipelineCompileMilliseconds:0,gpuInitializationMilliseconds:0,setupMilliseconds:0,codecSetupMilliseconds:0,codecMilliseconds:0,cold:false,renderMilliseconds:0,tableMilliseconds};
  function observeRender(metrics){for(const name of ['gpuRenderCalls','gpuComposeCalls','gpuRecompressionCalls','gpuRenderMs','gpuKernelMilliseconds','gpuPipelineCompileMilliseconds','gpuInitializationMilliseconds','setupMilliseconds','renderMilliseconds'])renderMetrics[name]+=metrics[name]??0;if(metrics.backend==='webgpu')renderMetrics.backend='webgpu';renderMetrics.cold||=metrics.cold;}
  if(!entry){
   const contexts=[];let pairBytes=0,codecProvenance=borrowed?.provenance;
   for(const r of rects){checkAbort(signal);const gx=Math.ceil(r.x/step),gy=Math.ceil(r.y/step),sw=Math.ceil((r.x+r.width)/step)-gx,sh=Math.ceil((r.y+r.height)/step)-gy;
    if(!sw||!sh){contexts.push({bounds:[r.x,r.y,r.x+r.width,r.y+r.height],status:'no-sampled-centre'});continue;}
    const data=new Uint8Array(sw*sh*3),qdata=new Uint8Array(data.length),phase=[gx*step-r.x,gy*step-r.y];
    for(let y=0;y<sh;y++){
     const x=gx*step,sy=(gy+y)*step,span=(sw-1)*step+1,loan=await view.readWindow({x,y:sy,width:span,height:1},{signal});
     try{for(let col=0;col<sw;col++)data.set(loan.pixels.data.subarray(col*step*3,col*step*3+3),(y*sw+col)*3);}finally{await loan.release();}scientificReads++;
     if(borrowed){const row=new Uint8Array(span*3);await borrowed.store.readInto(row,(sy*domain.width+x)*3);for(let col=0;col<sw;col++)qdata.set(row.subarray(col*step*3,col*step*3+3),(y*sw+col)*3);}
    }
    let composed;
    if(!borrowed){let trip;try{const sampled={width:sw,height:sh,format:'rgb8',data};
     composed=(alternate?codecPlan.stage.codec==='jpeg':nativeJpegPreviewCodec(codec))?await composeElaPreviewJpeg(data,sw,sh,p,table,{budget,signal,backend,gpuService,copyRecompressed:true}):null;
     if(composed){qdata.set(composed.recompressed);observeRender(composed.metrics);codecProvenance??=composed.codecProvenance;}
     else{const decoded=alternate?(trip=await recompressPixels(sampled,codecPlan,{budget,signal})).pixels:await codec.recompress(sampled,p.quality,{signal});checkAbort(signal);requireValue(decoded?.width===sw&&decoded.height===sh&&decoded.format==='rgb8'&&decoded.data?.length===data.length,'The scoped preview codec changed its dimensions.');qdata.set(decoded.data);codecProvenance??=trip?.provenance;renderMetrics.codecMilliseconds+=trip?.metrics?.totalMs??0;renderMetrics.codecSetupMilliseconds+=trip?.metrics?.setupMilliseconds??0;renderMetrics.setupMilliseconds+=trip?.metrics?.setupMilliseconds??0;renderMetrics.cold||=trip?.metrics?.cold===true;}recompressions++;
    }finally{await trip?.release();}}
    const context={bounds:[r.x,r.y,r.x+r.width,r.y+r.height],gx,gy,width:sw,height:sh,phase,original:data,recompressed:qdata,status:'preview'};contexts.push(context);if(composed)composedFrames.set(context,composed.data);pairBytes+=data.length+qdata.length;
   }
   entry={identity:pairIdentity,contexts,byteLength:pairBytes+rects.length*512,nativePixelSamples:!!borrowed,...(alternate?{codecProvenance}: {})};
  }
  const data=base.data.slice();
  for(const c of entry.contexts){if(c.status!=='preview')continue;
   let renderedData=composedFrames.get(c);if(!renderedData){const rendered=await renderElaPreviewPair(c.original,c.recompressed,c.width,c.height,p,table,{budget,signal,backend,gpuService});renderedData=rendered.data;observeRender(rendered.metrics);}
   for(let y=0;y<c.height;y++){checkAbort(signal);data.set(renderedData.subarray(y*c.width*3,(y+1)*c.width*3),((y+c.gy)*width+c.gx)*3);}
  }
  checkAbort(signal);return{pixels:{width,height,format:'rgb8',data,preview:true,logicalWidth:domain.width,logicalHeight:domain.height},logicalWidth:domain.width,logicalHeight:domain.height,nativePixelSamples:entry.nativePixelSamples,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:[...domain.origin],presentation:{preview:true,exact:false,view:'classic-preview',nativeResolution:step===1,nativePixelSamples:entry.nativePixelSamples,method:alternate?(entry.nativePixelSamples?'independent-native-codec-pixel-samples':'independent-preview-size-codec-contexts'):(entry.nativePixelSamples?'independent-native-jpeg-pixel-samples':'independent-preview-size-jpeg-contexts'),...(alternate?{codec:entry.codecProvenance,recompressionPlan:codecPlan}:{}),sampling:{step,phase:'Original domain lattice; per-context first admitted centre'},params:p},metrics:{...renderMetrics,preview:true,cacheHit,recompressions,scientificReads,...(alternate?{nativeRecompressionReuse:entry.nativePixelSamples}:{nativeJpegReuse:entry.nativePixelSamples}),contexts:entry.contexts.map(({original,recompressed,...v})=>v),admittedPixels:domain.countIncluded,workingBound:40*MiB+18*n+rects.length*512}};
 }catch(error){failed=true;throw error;}finally{
  let cleanupFailed=false,cleanupError;for(const close of[()=>sample?.release(),()=>borrowed?.release()])try{await close();}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupError=error;}}
  // Pinned arrays return to the native cache, with the same original owner/dependency.
  resident?.();if(base)budget.put(sourceKey,base,[imageId]);if(entry)budget.put(pairKey,entry,[imageId]);if(cleanupFailed&&!failed)throw cleanupError;
 }
}
