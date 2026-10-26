import {EngineError,checkAbort,controlCheckpoint} from './unified-engine/src/errors.js';
import {validateParams} from './unified-engine/src/ela.js';
import {createSourceRegionView} from './unified-engine/src/source-region-view.js';
import {estimateElaClassicAuto,calibrateElaClassicHistogram} from './ela-auto-estimate.js';
const SAMPLE_PIXELS=320*320,WINDOW_PIXELS=8192,CACHE_BYTES=256*1024,CONTEXT_BYTES=128*1024;
const requireValue=(value,message)=>{if(!value)throw new EngineError('INVALID_INPUT',message);};
const cleanupError=error=>({code:error.code,message:error.message});

/** Restricted Auto uses the very same native JPEG fragment contexts as the
 * final Classic result. The encompassing RGB is never an evidence raster. */
export function createElaNativeContextAuto({engine,maximumContiguousBytes=32*1024**2}){
 requireValue(Number.isSafeInteger(maximumContiguousBytes)&&maximumContiguousBytes>=0,'A finite native calibration output admission is required.');
 let cached=null,closed=false,active=false,running=null;const lifetime=new AbortController();
 async function clear(){const old=cached;cached=null;await old?.release();}
 async function estimate(payload,{original,source,id,signal,onProgress,protectedSurfaceIds=[]}={}){
  requireValue(!closed,'The source-domain Auto owner is closed.');if(active)throw new EngineError('BUSY','Automatic native context estimation is already active.');
  requireValue(Number.isInteger(payload?.params?.quality),'Automatic ELA requires the current explicit quality preference.');const params=validateParams(payload.params);
  requireValue(source?.blob instanceof Blob&&source.blob.size>0&&source.imageId===payload.imageId&&source.sourceSha256===payload.sourceSha256&&original?.sha256===payload.sourceSha256&&/^[a-f0-9]{64}$/.test(payload.sourceSha256)&&original.surface?.width===original.width&&original.surface?.height===original.height,'Automatic ELA requires the verified original encoded source and native surface.');
  requireValue(payload.sourceRegionDomain,'A signed native source domain is required.');requireValue(Array.isArray(protectedSurfaceIds)&&protectedSurfaceIds.every(id=>typeof id==='string'),'Displayed surface protection must list exact surface identifiers.');const protectedIds=new Set(protectedSurfaceIds);protectedIds.add(original.surface.id);payload=structuredClone(payload);original=structuredClone(original);source={...source};signal=signal?AbortSignal.any([signal,lifetime.signal]):lifetime.signal;checkAbort(signal);active=true;let finish;running=new Promise(resolve=>{finish=resolve;});
  const leases=[],owned=new Set();let view,output,failure;
  const reserve=async bytes=>{const lease=await engine.reserveExternalMemory({bytes});let released=false;const release=async()=>{if(released)return;released=true;await engine.releaseExternalMemory(lease.id);};leases.push(release);checkAbort(signal);return release;};
  try{
   view=await createSourceRegionView({descriptor:original.surface,sha256:original.sha256,readWindow:async(rect,hooks)=>({...(await engine.readPixels({surfaceId:original.surface.id,revision:original.surface.revision,rect},hooks)),release(){}})},payload.sourceRegionDomain,{signal});
   const domain=view.domain;requireValue(domain.sourceSha256===original.sha256,'The selected domain belongs to another original source.');
   await reserve(65536+domain.width*64);const contexts=[];for(const rect of view.admittedRectangles()){await controlCheckpoint(signal);await reserve(512);contexts.push({...rect,id:'native-fragment-'+contexts.length});}
   requireValue(contexts.length>0,'No native source contexts are admitted.');
   const key=payload.imageId+'\0'+original.surface.id+'\0'+original.surface.revision+'\0'+domain.fingerprint,cacheHit=cached?.key===key;
   let estimate,headerMetrics;
   if(cacheHit){estimate=structuredClone(cached.estimate);headerMetrics=structuredClone(cached.headerMetrics);}
   else{
    const inspected=await engine.inspectHeaders({blob:source.blob,imageId:payload.imageId},{signal});checkAbort(signal);headerMetrics=inspected.metrics;
    const readRect=(context,rect,hooks)=>view.readWindow({...rect,x:context.x+rect.x,y:context.y+rect.y},hooks);
    const hooks={signal,onProgress,reserveMemory:reserve};
    if(inspected.header?.quantization)estimate=await estimateElaClassicAuto({width:domain.width,height:domain.height,sourceSha256:original.sha256,header:inspected.header},hooks);
    else{
     const estimates=[];for(const context of contexts){await controlCheckpoint(signal);await reserve(CONTEXT_BYTES);const value=await estimateElaClassicAuto({width:context.width,height:context.height,sourceSha256:original.sha256,header:inspected.header,readRect:(rect,h)=>readRect(context,rect,h)},hooks);estimates.push({id:context.id,bounds:[context.x,context.y,context.x+context.width,context.y+context.height],estimate:value});}
     const quality=estimates[0].estimate.quality,agreed=quality!==null&&estimates.every(v=>v.estimate.quality===quality);
     estimate={schema:'sherloq.ela-auto-estimate/1',sourceSha256:original.sha256,width:domain.width,height:domain.height,quality:agreed?quality:null,probability:false,forgeryVerdict:null,calibrationRequired:agreed,evidence:{kind:'independent-native-context-estimates',status:agreed?'compatible-context-references':'no-common-identified-reference',contexts:estimates,qualityMeaning:'A global recompression reference is adopted only when every admitted native context identifies the same quality; otherwise the current preference is preserved.'}};
    }
    checkAbort(signal);
    // Cache is bounded and owns a real engine reservation. It never retains a
    // source view, old signal, output surface or unbounded context collection.
    const bytes=JSON.stringify({estimate,headerMetrics}).length*2+1024;await clear();if(bytes<=CACHE_BYTES){const release=await reserve(bytes);cached={key,estimate:structuredClone(estimate),headerMetrics:structuredClone(headerMetrics),release};leases.splice(leases.indexOf(release),1);}
   }
   const reference=estimate.evidence?.kind==='current-file-tables'?estimate.evidence.referenceQuality:null,quality=estimate.quality??(Number.isInteger(reference)&&reference>=1&&reference<=100?reference:null)??params.quality;
   requireValue(Number.isInteger(quality)&&quality>=1&&quality<=100,'Automatic ELA produced an invalid native reference.');
   output=await engine.run({id:'ela-auto-calibration-'+id,imageId:payload.imageId,operation:'ela.classic',params:{quality,scale:1,contrast:0,linear:true,grayscale:false},backend:'cpu',regions:[],sourceRegionDomain:domain.descriptor},{signal,onProgress:p=>onProgress?.({...p,phase:'auto-calibration-'+p.phase})});
   let aliased=false;for(const surface of [output.surface,output.sourceRegionSourceSurface,...Object.values(output.planeSurfaces??{}),...Object.values(output.maskSurfaces??{}),...Object.values(output.rgbSurfaces??{})])if(surface?.id&&surface.id!==original.surface.id){if(protectedIds.has(surface.id))aliased=true;else owned.add(surface.id);}requireValue(!aliased&&!protectedIds.has(output.surface?.id),'Calibration returned an existing source or displayed result surface.');
   checkAbort(signal);requireValue(output.id==='ela-auto-calibration-'+id&&output.imageId===payload.imageId&&output.operation==='ela.classic'&&output.status==='ok'&&output.provenance?.originalSha256===original.sha256,'Native calibration differs from its requested source.');
   const surface=output.surface,shape=surface??output.pixels;requireValue(shape?.format==='rgb8'&&shape.width===domain.width&&shape.height===domain.height&&surface?.id!==original.surface.id,'Native calibration must own its exact admitted grid.');
   if(!surface){requireValue(output.pixels.data instanceof Uint8Array&&output.pixels.data.length===domain.width*domain.height*3,'Native calibration RGB storage is incomplete.');if(output.pixels.data.byteLength>maximumContiguousBytes)throw new EngineError('RESULT_MEMORY_BUDGET','The native calibration output exceeds its result memory admission.');await reserve(output.pixels.data.byteLength);}else requireValue(output.layout==='surface','Native calibration surface layout is invalid.');
   await reserve(256*4+WINDOW_PIXELS*3);const histogram=new Uint32Array(256),stride=Math.max(1,Math.ceil(domain.countIncluded/SAMPLE_PIXELS)),samplingContexts=[];let offset=0,samples=0,readWindows=0;
   for(const context of contexts){let contextSamples=0;for(let y=0;y<context.height;y++)for(let x=0;x<context.width;x+=WINDOW_PIXELS){await controlCheckpoint(signal);const width=Math.min(WINDOW_PIXELS,context.width-x),start=offset+y*context.width+x,first=(stride-start%stride)%stride;if(first>=width)continue;
     const rect={x:context.x+x,y:context.y+y,width,height:1};requireValue(view.includesRectangle(rect),'Calibration attempted to sample an excluded presentation pixel.');const part=surface?await engine.readPixels({surfaceId:surface.id,revision:surface.revision,rect},{signal}):{pixels:{width,height:1,format:'rgb8',data:output.pixels.data.subarray((rect.y*domain.width+rect.x)*3,(rect.y*domain.width+rect.x+width)*3)}};checkAbort(signal);const pixels=part.pixels;requireValue(pixels?.format==='rgb8'&&pixels.width===width&&pixels.height===1&&pixels.data instanceof Uint8Array&&pixels.data.length===width*3,'Native calibration returned another sample grid.');
     for(let p=first;p<width;p+=stride){histogram[pixels.data[p*3]]++;histogram[pixels.data[p*3+1]]++;histogram[pixels.data[p*3+2]]++;samples++;contextSamples++;}readWindows++;
    }offset+=context.width*context.height;samplingContexts.push({id:context.id,bounds:[context.x,context.y,context.x+context.width,context.y+context.height],samples:contextSamples});}
   requireValue(samples>0&&samples<=SAMPLE_PIXELS&&offset===domain.countIncluded,'Native Auto sampling exceeded its admitted population.');checkAbort(signal);
   const calibration=calibrateElaClassicHistogram(histogram,{...params,quality});
   return{imageId:payload.imageId,sourceSha256:original.sha256,width:original.width,height:original.height,sourceRegionDomain:domain.descriptor,analysisGrid:{width:domain.width,height:domain.height,origin:[...domain.origin]},parameters:calibration.params,estimate,calibration,calibrationMetrics:{estimateReused:cacheHit,referenceSelection:estimate.quality!==null?'identified-compatible-reference':reference===quality?'nearest-current-table-reference':'current-user-quality-preserved',header:headerMetrics,native:output.metrics,nativeCalibration:{quality,scale:1,contrast:0,linear:true,grayscale:false,width:domain.width,height:domain.height,contexts:contexts.length},sampling:{coordinates:'admitted-native-pixels',resize:false,maximumPixels:SAMPLE_PIXELS,samples,stride,readWindows,contexts:samplingContexts,excludedPixels:0},read:{nativeRead:true,excludedParticipation:'absent-before-statistics-and-calibration'}}};
  }catch(error){failure=error;throw error;}
  finally{const errors=[];for(const surfaceId of owned)try{await engine.releaseSurface(surfaceId);}catch(error){errors.push(cleanupError(error));}try{view?.dispose();}catch(error){errors.push(cleanupError(error));}for(const release of leases.reverse())try{await release();}catch(error){errors.push(cleanupError(error));}active=false;finish();running=null;if(errors.length){if(failure)failure.details={...failure.details,cleanup:errors};else throw new EngineError('CLEANUP_FAILED','Automatic native contexts could not release temporary resources.',{details:{cleanup:errors}});}}
 }
 return{estimate,async dispose(){if(closed)return;closed=true;lifetime.abort();await running;await clear();}};
}
