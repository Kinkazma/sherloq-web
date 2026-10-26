import "../../runtime-context.js?v=0.25.0";
import {EngineError,checkAbort,requireValue} from './errors.js';
import {createNoisesnifferProxySource} from './noisesniffer-proxy-source.js';
import {sourceRegionNoisesnifferStatistics} from './source-region-noisesniffer-statistics.js';
import {segmentedNoisesniffer} from './segmented-noisesniffer.js';
import {noisesnifferParams} from './noisesniffer.js';
import {noisesnifferStreamHeapBytes} from './noisesniffer-stream-math.js';
import {cachedPreviewGeometry} from './cached-parameter-preview.js';
import {noisesnifferOwnerRetirement} from './noisesniffer-owner-retirement.js';
import {retireCompositeOwners} from './composite-owner-release.js';

// A separate approximate owner: no result registry, native final or Original
// scientific cache is ever written here. All user values reach the native
// proxy kernels unchanged; their spatial/statistical meanings are provisional.
export function createStrictColdNoisesnifferPreview({budget,maxEntries=2}={}){
 requireValue(budget&&Number.isSafeInteger(maxEntries)&&maxEntries>0&&maxEntries<=4,'A finite provisional cache admission is required.');
 const entries=new Map();let active,closed=false,retiring,activeController;
 async function retire(entry){await entry.dispose();if(entries.get(entry.key)===entry)entries.delete(entry.key);}
 return{
  async preview({original,domain,params,preview,signal:externalSignal,onProgress,accountedHeapBytes=0}={}){
   checkAbort(externalSignal);if(closed)throw new EngineError('DISPOSED','Provisional Noisesniffer owner closed.');if(active)throw new EngineError('BUSY','A provisional Noisesniffer calculation is active.');
   const p=noisesnifferParams(params),d=original?.surface?.descriptor;
   requireValue(d?.format==='rgb8'&&typeof d.id==='string'&&Number.isSafeInteger(d.revision)&&original.sha256===domain.sourceSha256&&d.width===domain.sourceWidth&&d.height===domain.sourceHeight,'Provisional source identity differs.');
   requireValue(Number.isSafeInteger(accountedHeapBytes)&&accountedHeapBytes>=0&&accountedHeapBytes<=noisesnifferStreamHeapBytes(),'Invalid already-accounted provisional native heap.');
   const g=cachedPreviewGeometry(domain.width,domain.height,preview,budget,{bytesPerPixel:768,fixedBytes:80*1024**2}),key=JSON.stringify([d.id,d.revision,original.sha256,domain.fingerprint,g.step,p.blockSize]);
   if(g.width<p.blockSize||g.height<p.blockSize)throw new EngineError('PREVIEW_UNAVAILABLE','The provisional lattice is smaller than the requested native block.');
   const controller=new AbortController(),abort=()=>controller.abort();if(externalSignal?.aborted)controller.abort();externalSignal?.addEventListener('abort',abort,{once:true});const signal=controller.signal;
   let done;active=new Promise(resolve=>done=resolve);activeController=controller;let entry,record,frame,background,primary,failed=false,heap,presentation,setupMilliseconds=0;
   try{
    // Hold the real singleton throughout all proxy stages, including gaps
    // between statistics, selection and presentation. It is not a cache credit.
    heap=budget.reserve(Math.max(0,Math.max(12*1024**2,noisesnifferStreamHeapBytes())-accountedHeapBytes));
    entry=entries.get(key);if(entry&&(entry.failed||entry.original!==original||entry.nativeSurface!==original.surface)){await retire(entry);entry=null;}
    if(!entry){while(entries.size>=maxEntries)await retire(entries.values().next().value);const sourceStarted=performance.now(),source=await createNoisesnifferProxySource(original,domain,g.step,{budget,signal});setupMilliseconds+=performance.now()-sourceStarted;entry={key,source,original,nativeSurface:original.surface,cache:null,failed:false};entry.dispose=noisesnifferOwnerRetirement([()=>entry.cache?.dispose(),()=>source.dispose()]);entries.set(key,entry);}
    else{entries.delete(key);entries.set(key,entry);}
    const cachedStats=entry.cache?.stats?.blockSize===p.blockSize,source=entry.source;
    // Only new lattice/statistics construction is setup. Selection, bin/NFA
    // processing and presentation remain in the measured variable frame cost.
    if(!cachedStats){const statisticsStarted=performance.now(),stats=await sourceRegionNoisesnifferStatistics({session:original.session,ensureTemporarySession:original.ensureTemporarySession},source.view,source.domain,p.blockSize,{budget,signal,onProgress,onRetirementOwner:owner=>{entry.cache={stats:owner,async dispose(){await this.stats?.dispose();this.stats=null;}};}});
     entry.cache={stats,async dispose(){await this.stats?.dispose();this.stats=null;}};setupMilliseconds+=performance.now()-statisticsStarted;}
    if(!entry.cache.stats.metrics.supportedBlocks)throw new EngineError('PREVIEW_UNAVAILABLE','No complete native block remains on the conservative provisional lattice.');
    record=await segmentedNoisesniffer(source.image,p,{budget,signal,onProgress,cache:entry.cache,accountedHeapBytes:noisesnifferStreamHeapBytes()});entry.cache=record.noisesnifferCache;checkAbort(signal);
    const nativeMetrics=record.metrics;presentation=budget.reserve(g.pixels*4+65536);frame=await record.surface.readWindow({x:0,y:0,width:g.width,height:g.height},{signal});
    // Coverage is consulted AFTER kernels. Original display reads do not
    // participate in extrema, DCT, FFT, patch selection or global region growth.
    const coverage=new Uint8Array(g.pixels);await entry.cache.stats.coverage.readInto(coverage);background=await source.image.surface.readWindow({x:0,y:0,width:g.width,height:g.height},{signal});
    for(let i=0;i<g.pixels;i++)if(!coverage[i])frame.pixels.data.set(background.pixels.data.subarray(i*3,i*3+3),i*3);
    const pixels={...frame.pixels,data:frame.pixels.data.slice(),logicalWidth:domain.width,logicalHeight:domain.height};
    await background.release();background=null;await frame.release();frame=null;await record.surface.dispose();record=null;checkAbort(signal);
    const metadata={...source.metadata,strictSourceRegions:true,sourceRegionFingerprint:domain.fingerprint,nativeParamsUnchanged:true,cacheSeparateFromNativeFinal:true,statisticalMeaning:'approximate-global-population-and-NFA-on-conservative-provisional-lattice',spatialMeaning:'native numeric block/cell sizes applied to proxy cells',nativeStatistics:entry.cache.stats.metrics.mean8Policy,inconclusive:entry.cache.analysis.data.metadata.inconclusive===true,nativeValidBlocks:entry.cache.stats.validCount,nativeSelectedBlocks:entry.cache.analysis.selection.selectedCount};
    onProgress?.({phase:'noisesniffer-strict-cold-proxy',completed:1,total:1});checkAbort(signal);
    return{pixels,analysisScope:{width:g.width,height:g.height,format:'mask8',data:coverage},exact:false,provisional:true,exportable:false,preview:{provisional:true,...metadata},metrics:{...metadata,cold:!cachedStats,setupMilliseconds:cachedStats?0:setupMilliseconds,proxyStatisticsCached:cachedStats,proxySelectionBasisCached:nativeMetrics.selectionBasisCached,proxyAnalysisCached:nativeMetrics.analysisCached,inferenceCalls:0,scientificFinalChanged:false,sampleDimensions:[g.width,g.height],sampledAnalysedPixels:coverage.reduce((sum,v)=>sum+!!v,0),proxyNativeAnalysisCalls:nativeMetrics.analysisCached?0:1,proxyStatistics:structuredClone(entry.cache.stats.metrics)}};
   }catch(error){failed=true;primary=error;if(entry)entry.failed=true;throw error;}
   finally{try{await retireCompositeOwners([()=>background?.release(),()=>frame?.release(),()=>record?.surface.dispose(),...(failed&&entry?[()=>retire(entry)]:[])],failed?{primary}:{});}finally{presentation?.();heap?.();externalSignal?.removeEventListener('abort',abort);activeController=null;active=null;done();}}
  },
  dispose(){if(retiring)return retiring;closed=true;activeController?.abort();return retiring=(async()=>{await active;await retireCompositeOwners([...entries.values()].map(entry=>()=>retire(entry)));})().finally(()=>{retiring=null;});},
  get cacheEntries(){return entries.size;}
 };
}
