import {COMPOSITE_STATISTICS_POLICY,COMPOSITE_STATISTICS_REVISION,compositePolicyMetadata} from './composite-policy.js';
import {createTemporarySession} from './temporary-storage.js';
import {compositeSourceGray,noiseprintSurface} from './composite-source-noise.js';
import {compositeNoiseDisplay,compositeRasterBanks} from './composite-segmented-display.js';
import {compositeBankedStatistics} from './composite-banked-statistics.js';
import {requireValue,EngineError,checkAbort} from './errors.js';
const readonly=t=>Object.freeze({width:t.width,height:t.height,length:t.length,byteLength:t.byteLength,storage:t.storage,elementType:t.elementType??'Float32Array',BYTES_PER_ELEMENT:t.BYTES_PER_ELEMENT??4,readInto:t.readInto.bind(t),readBytes:t.readBytes.bind(t)});
export function createCompositeSegmentedAnalyzer({assets,pool,statistics,profile,budget,storage='auto'}){
 let active,disposed=false,cached;
 async function unpin(item){if(--item.refs===0){try{for(const bank of item.banks)await bank.dispose();item.mapped?.release();item.lease();}finally{await item.session()?.dispose();}}}
 async function clearCache(){const old=cached;cached=null;if(old)await unpin(old);}
 function acquire(item,stage,hit,mapError){
  const d={...item.data,...(stage==='map'?item.mapped?.data:{})},bytes=Object.values(d).reduce((n,v)=>n+(ArrayBuffer.isView(v)?v.byteLength:0),8192),lease=budget.reserve(bytes);let released=false;
  try{for(const [key,v]of Object.entries(d))if(ArrayBuffer.isView(v))d[key]=v.slice();d.metadata=structuredClone(d.metadata);if(d.statisticsShapes)d.statisticsShapes=structuredClone(d.statisticsShapes);item.refs++;
   return {data:d,provenance:structuredClone(item.provenance),...(mapError?{mapError}:{}),metrics:{cache:{result:hit},memory:budget.snapshot(),preflightExecutions:0,execution:{...structuredClone(item.execution),storage:item.session()?{backend:item.session().backend,...item.session().snapshot()}:null}},async release(){if(!released){released=true;lease();await unpin(item);}}};
  }catch(e){lease();throw e;}
 }
 return {
  async analyze(image,{quality=0,stage='map',memoryBounded}={},options={}){
   if(disposed)throw new EngineError('DISPOSED','Segmented Composite disposed.');if(active)throw new EngineError('BUSY','Segmented Composite already running.');requireValue(image.surface&&Number.isInteger(quality)&&(quality===0||quality>=51&&quality<=101)&&['noise','map'].includes(stage)&&memoryBounded!==false,'Invalid segmented Composite parameters.');
   const controller=new AbortController(),abort=()=>controller.abort();active=controller;options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();const signal=controller.signal,{width,height,id,revision}=image.surface.descriptor,key=JSON.stringify([image.sha256,id,revision,quality,options.backend??'auto']),mapRevision=COMPOSITE_STATISTICS_REVISION+'/'+statistics.runtime.sourceSha256;let item,session,sessionPending,gray,residual,display,lease;
   const getTemporarySession=async({signal:jobSignal=signal}={})=>{if(session)return session;if(!sessionPending)sessionPending=createTemporarySession({budget,signal:jobSignal}).then(s=>session=s);return sessionPending;};
   try{
    checkAbort(signal);const hit=cached?.key===key&&(stage==='noise'||cached.mapped?.revision===mapRevision);
    if(cached?.key===key){item=cached;item.refs++;}
    else{
     await clearCache();const hints={budget,statistics,pool,profile,getTemporarySession,signal,onProgress:options.onProgress,backend:options.backend??'auto',storage};
     const prepared=await compositeSourceGray(image.surface,{...hints,quality});gray=prepared.gray;const model=prepared.model;if(!assets[String(model)])throw new EngineError('MODEL_UNAVAILABLE',`Estimated quality ${model} has no installed Noiseprint model. Choose 51–100 or 101.`);statistics.clear();
     residual=await noiseprintSurface(gray,model,hints);pool.clear();display=await compositeNoiseDisplay(residual.noise,hints);statistics.clear();lease=budget.reserve(16384);
     item={key,refs:1,lease,banks:[gray,residual.noise,display],session:()=>session,getTemporarySession,data:{width,height,segmented:true,gray:readonly(gray),noise:readonly(residual.noise),noise_rgb:readonly(display),model,...(prepared.curve?{curve:prepared.curve}:{}),metadata:{method:'noiseprint',quality:model,automatic:quality===0,coordinateSpace:'source-pixels',nativeOverlap:34,memorySubdivisions:residual.subdivisions,segmented:true}},provenance:{originalSourceSha256:image.sha256??null,sourceSurfaceIdentity:id+'/'+revision,modelSha256:assets[String(model)].sha256,checkpointSha256:assets[String(model)].checkpointSha256,statisticsSourceSha256:statistics.runtime.sourceSha256,qualification:'native segmented statistics; dimension-specific proofs required'},execution:{noiseprint:residual.executions,noiseprintWorkers:residual.workers,noiseprintStep:residual.step}};
     gray=null;residual=null;display=null;lease=null;cached=item;item.refs++;
    }
    let mapError;
    if(stage==='map'&&!item.mapped){
     let mapped,rasters;try{
      const hints={budget,statistics,profile,getTemporarySession:item.getTemporarySession,signal,onProgress:options.onProgress,storage};mapped=await compositeBankedStatistics(item.banks[0],item.banks[1],width,height,hints);rasters=await compositeRasterBanks(mapped.grid,mapped.result.range0.data,mapped.result.range1.data,width,height,hints);
      const fields=Object.fromEntries(Object.entries(mapped.result).map(([k,v])=>[k,v.data])),condition=fields.model_conditioning,modelConditioning={minimumEigenvalue:condition[0],maximumEigenvalue:condition[1],conditionNumber:Number.isFinite(condition[2])?condition[2]:null,numericalRank:condition[3],dimensions:condition[4],rankTolerance:condition[5],status:condition[3]<condition[4]?'ill-conditioned':'full-numerical-rank',regularization:COMPOSITE_STATISTICS_POLICY};
      item.banks.push(rasters.raster,rasters.map_rgb);item.mapped={revision:mapRevision,release:mapped.release,data:{...fields,raster:readonly(rasters.raster),map_rgb:readonly(rasters.map_rgb),mapShape:mapped.result.map.dims,statisticsShapes:Object.fromEntries(Object.entries(mapped.result).map(([k,v])=>[k,v.dims])),metadata:{...item.data.metadata,method:'composite_splicing',...compositePolicyMetadata(fields),model_conditioning:modelConditioning,memory_bounded:true,bounded_execution:mapped.execution,seed:0,features:32,replicates:10,maxIterations:100,outliersNlogl:42}}};item.provenance.statisticsPolicy=COMPOSITE_STATISTICS_POLICY;item.provenance.statisticsSourceSha256=statistics.runtime.sourceSha256;item.execution.statistics=mapped.execution;mapped=null;rasters=null;
     }catch(e){checkAbort(signal);if(!['STATISTICS_EXECUTION','MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(e.code))throw e;mapError={code:e.code,message:e.message};}finally{mapped?.release();await rasters?.raster.dispose();await rasters?.map_rgb.dispose();statistics.clear();}
    }
    checkAbort(signal);return acquire(item,stage,hit,mapError);
   }finally{
    try{await gray?.dispose();await residual?.noise.dispose();await display?.dispose();lease?.();if(item)await unpin(item);else await session?.dispose();}finally{active=null;options.signal?.removeEventListener('abort',abort);}
   }
  },clearCache,async dispose(){if(disposed)return;disposed=true;active?.abort();await clearCache();}
 };
}
