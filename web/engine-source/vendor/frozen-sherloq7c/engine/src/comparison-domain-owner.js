import {createComparisonDomainPair} from './comparison-domain-pair.js';
import {comparisonDomainBasic} from './comparison-domain-basic.js';
import {comparisonPagedHistograms} from './comparison-paged-histograms.js';
import {segmentedComparison} from './segmented-comparison.js';
import {comparisonParams,comparisonReferences} from './comparison.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
const spatial=['msssim','rase','scc','uqi','vifp','ssimul','butter','ssim'];
const histNames=['hist_0','hist_1','hist_4','hist_2','hist_3','hist_5'];

/** A paired native domain owner. Spatial measures retain independent native
 * contexts. Only additive grayscale statistics and permutation-invariant RGB
 * histograms have a global union result; final scores are never averaged. */
export async function createComparisonDomainOwner(original,reference,input,{budget,profile={},originalArithmetic=false,sourceIds=[],signal,nativeComparison=segmentedComparison}={}) {
 const pair=await createComparisonDomainPair(original,reference,input,{budget,signal}),entries=[],cachePrefix='comparison-native-domain/'+original.surface.descriptor.id+'/'+reference.surface.descriptor.id+'/'+pair.domain.fingerprint+'/',cacheLeases=[];
 let active,disposed=false,globalBasic,globalHistogram;
 const makeImage=(source,view,r,side)=>({sha256:source.sha256,session:source.session,ensureTemporarySession:source.ensureTemporarySession,surface:{descriptor:{id:cachePrefix+side+'/'+[r.x,r.y,r.width,r.height].join(','),revision:1,width:r.width,height:r.height,format:'rgb8'},readWindow:(rect,hooks)=>view.readWindow({...rect,x:rect.x+r.x,y:rect.y+r.y},hooks)}});
 try{for(const rect of pair.contexts()){
  cacheLeases.push(budget.reserve(16384));entries.push({rect:{...rect},first:makeImage(original,pair.views[0],rect,0),second:makeImage(reference,pair.views[1],rect,1),cache:null});
 }cacheLeases.push(budget.reserve(16384));}catch(error){for(const lease of cacheLeases)lease();await pair.dispose();throw error;}
 const memoryBytes=entries.length*16384+16384;
 try{for(const lease of cacheLeases)lease();budget.retain(memoryBytes);}catch(error){await pair.dispose();throw error;}
 const bounds=r=>[r.x+pair.domain.origin[0],r.y+pair.domain.origin[1],r.x+r.width+pair.domain.origin[0],r.y+r.height+pair.domain.origin[1]];
 const createStore=(bytes,extra={})=>createSegmentedBytes(bytes,{budget,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession,...extra});
 const native=async(entry,p,hooks,index)=>{const r=await nativeComparison(entry.first,p,{reference:entry.second,budget,profile,original:originalArithmetic,backend:hooks.backend,signal:hooks.signal,onProgress:hooks.onProgress,cache:entry.cache,cacheKey:cachePrefix+'context/'+index+'/',cacheDependencies:sourceIds});entry.cache=r.comparisonCache;return r;};
 const closeRecord=async record=>{await record?.surface?.dispose();};
 const ownMetadata=(surface,data)=>{const bytes=sourceRegionTransportBytes(data,{allowUndefined:true,allowAliases:true})*2+4096,admission=budget.reserve(bytes);admission();budget.retain(bytes);let closed=false;return{...surface,async dispose(){if(closed)return;closed=true;try{await surface.dispose();}finally{budget.retained-=bytes;}}};};
 return{
  pair,reference,
  matches:(a,b,d)=>pair.matches(a,b,d),
  async run(params,options={}) {
   if(disposed)throw new EngineError('DISPOSED','Paired comparison owner is closed.');if(active)throw new EngineError('BUSY','A paired comparison is already running.');
   const p=comparisonParams(params);comparisonReferences(p);requireValue(p.referenceImageId===sourceIds[1]||!sourceIds[1],'The comparison request names another reference owner.');
   const controller=new AbortController(),abort=()=>controller.abort();let finish;active={controller,done:new Promise(r=>finish=r)};options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
   const hooks={signal:controller.signal,onProgress:options.onProgress,backend:options.backend??'cpu'};let flat,packed,output,record,raw,metadataStaging,committed=false,primary,usedGpu=false;
   try{
    checkAbort(hooks.signal);const cacheHits={globalBasic:!!globalBasic,globalHistogram:!!globalHistogram};metadataStaging=budget.reserve(65536+entries.length*4096);const contexts=[];
    // One rectangle is the unmodified native comparison of both exact crops.
    if(entries.length===1){raw=await native(entries[0],p,hooks,0);checkAbort(hooks.signal);const data={...structuredClone(raw.data),pairedDomain:structuredClone(pair.certificate),sourceRegionEvaluation:'complete',contextLayout:'one-native-rectangle',contexts:[{bounds:bounds(entries[0].rect),values:structuredClone(raw.data.values),errors:structuredClone(raw.data.errors)}]};const{comparisonCache,...owned}=raw;record={...owned,surface:ownMetadata(owned.surface,data),data,semantics:'Unchanged native comparison of both crops in the same Original grid; no resampling.',metrics:{...raw.metrics,pairedDomain:true,contextCount:1}};raw=null;committed=true;return record;}
    const n=pair.certificate.observations,w=pair.domain.width,h=pair.domain.height;
    if(p.metrics){globalBasic??=await comparisonDomainBasic(pair,hooks);if(!globalHistogram){const hist=await comparisonPagedHistograms(pair.images,{budget,...hooks,resident:profile.histogramResident,cachePages:profile.histogramCachePages});globalHistogram={values:hist.values.slice(),metrics:hist.metrics};}}
    if(p.view==='normal'||p.view==='difference'){
     raw=await nativeComparison(pair.images[0],{...p,metrics:false,equalized:false,grayscale:false},{reference:pair.images[1],budget,profile,original:originalArithmetic,...hooks});flat=raw.surface;raw=null;
    }else{packed=await createStore(n*3,{signal:hooks.signal});flat=createRgbSurface(packed,{width:1,height:n,budget});}
    for(let index=0;index<entries.length;index++){
     const e=entries[index];if(!p.metrics&&['normal','difference'].includes(p.view)){contexts.push({bounds:bounds(e.rect),values:{},errors:{},metricsRequested:false});continue;}
     raw=await native(e,{...p,view:['ssim','butter'].includes(p.view)?p.view:'normal',equalized:false,grayscale:false},hooks,index);
     usedGpu||=raw.metrics?.backend==='webgpu';
     contexts.push({bounds:bounds(e.rect),values:structuredClone(raw.data.values),errors:structuredClone(raw.data.errors),metricsRequested:p.metrics});
     if(['ssim','butter'].includes(p.view))for(let y=0;y<e.rect.height;y++){
      const part=await raw.surface.readWindow({x:0,y,width:e.rect.width,height:1},hooks);try{const at=pair.offsetOf(e.rect.x,e.rect.y+y);await packed.write(part.pixels.data,at*3);}finally{await part.release();}
     }
     await closeRecord(raw);raw=null;await controlCheckpoint(hooks.signal);
    }
    if(p.equalized||p.grayscale){raw=await nativeComparison(pair.images[0],{...p,view:'normal',metrics:false},{reference:{surface:flat},budget,profile,original:originalArithmetic,...hooks});await flat.dispose();flat=raw.surface;raw=null;}
    output=await createStore(w*h*3,{signal:hooks.signal});
    // Original outside the domain is presentation only, not a metric sample.
    for(let y=0;y<h;){const rows=Math.min(h-y,Math.max(1,Math.floor(65536/w))),part=await original.surface.readWindow({x:pair.domain.origin[0],y:pair.domain.origin[1]+y,width:w,height:rows},hooks);try{await output.write(part.pixels.data,y*w*3);}finally{await part.release();}y+=rows;}
    for(const span of pair.spans)for(let offset=0;offset<span.length;offset+=65536){const length=Math.min(65536,span.length-offset),part=await flat.readWindow({x:0,y:span.offset+offset,width:1,height:length},hooks);try{await output.write(part.pixels.data,(span.y*w+span.x+offset)*3);}finally{await part.release();}}
    const values=p.metrics?{...globalBasic.values}:{};if(p.metrics)for(let i=0;i<histNames.length;i++)values[histNames[i]]=globalHistogram.values[i];
    const errors=p.metrics?{...globalBasic.errors}:{};for(const name of spatial)if(p.metrics||p.view===(name==='butter'?'butter':name))errors[name]='This spatial/perceptual measure is reported per exact native context; no single global score is defined for this nonrectangular observation domain.';
    const data={referenceImageId:p.referenceImageId,values,errors,metricsRequested:p.metrics,unavailableMetrics:Object.keys(errors).filter(k=>spatial.includes(k)),contexts,contextLayout:'independent-native-spatial-comparisons',pairedDomain:structuredClone(pair.certificate),...(p.metrics?{histogramCorrelationFullBins:globalHistogram.values[6],histogramCorrelationBinDivisor:globalHistogram.values[7],warnings:globalHistogram.values[7]===65536?{hist_0:'Historical native correlation uses 65,536 entries for a 16,777,216-bin histogram and may exceed [-1,1]. Use histogramCorrelationFullBins for ordinary correlation interpretation.'}:{}}:{})};
    const base=createRgbSurface(output,{width:w,height:h,budget});output=null;raw={surface:base};
    record={surface:ownMetadata(base,data),data,semantics:'Same native Original-grid domain applied to both image owners. Grayscale moments and color histograms use the union of admitted observations. Spatial/perceptual scores and maps retain independent native contexts, never a mean of fragment scores. Difference and final display equalization use the full admitted union.',metrics:{backend:usedGpu?'webgpu':'cpu',pairedDomain:true,contextCount:entries.length,selectedPixels:n,globalMetricsRequested:p.metrics?12:0,globalMetricsDefined:Object.keys(values).length,spatialMetrics:'per-native-context',cache:cacheHits}};raw=null;checkAbort(hooks.signal);committed=true;return record;
   }catch(error){primary=error;throw error;}finally{
    let failure;for(const action of[()=>closeRecord(raw),()=>!committed&&closeRecord(record),()=>flat?.dispose(),()=>output?.dispose(),()=>metadataStaging?.()])try{await action();}catch(error){failure??=error;}
    options.signal?.removeEventListener('abort',abort);active=null;finish();if(failure){if(committed)await record.surface.dispose();if(primary&&typeof primary==='object'&&Object.isExtensible(primary))primary.cleanupError=failure;else throw failure;}
   }
  },
  async dispose(){if(disposed)return;disposed=true;const pending=active;pending?.controller.abort();await pending?.done;try{await pair.dispose();}finally{budget.retained-=memoryBytes;budget.clearPrefix(cachePrefix);entries.length=0;globalBasic=globalHistogram=null;}},
  memoryBytes
 };
}

