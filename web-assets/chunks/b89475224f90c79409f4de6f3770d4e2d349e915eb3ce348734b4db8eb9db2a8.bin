import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,checkAbort} from './errors.js';
import {createAutomaticAnalyzer} from './automatic-analyzer.js';
import {automaticSelection} from './automatic-analysis-plan.js';
import {detectPanels} from './auto-zones.js';
import {detectSegmentedPanels} from './auto-zones-stream.js';
import {DenseCopyEngine} from './dense-copy.js';
import {SparseCopyEngine} from './sparse-copy.js';
import {pairedBiomes} from './copy-biomes.js';
import {biomeSides,verifyCopyGeometry,createGeometryKernel} from './copy-geometry.js';
import {copyPalette} from './copy-subbiomes.js';
import {createForgeryscopeAnalyzer} from './forgeryscope-analyzer.js';
import {createCloneCorroboration} from './clone-corroboration.js';
import {CLONE_SOURCES} from './clone-relations.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createTemporarySession} from './temporary-storage.js';
import {createNumericSurface} from './numeric-surface.js';
import {payloadBytes} from './pixel-operations.js';

const geometry={pairedBiomes,biomeSides,verifyCopyGeometry,createGeometryKernel,copyPalette};
const actions=new Set(['selectTab','setPresentation','setRelation','setOpacity','setEla','setElaFamilies','setForgeryscopeBranch','setEnabledSources','setHidden','focus','setD2prlMinimum']);
// One live automatic analysis shares D2PRL's raw-grid identity. Starting a new
// scope invalidates its prior handle; completed exports and surfaces stay owned.
export function createAutomaticRuntime({budget,profile,version,getD2prl,getLanguage,publishResult,exports,onTemporarySession}){
 let current,forge,modelRelease;
 const find=id=>{if(!current||current.id!==id)throw new EngineError('NOT_FOUND','Automatic analysis no longer exists.');return current;};
 async function clear(){const old=current;current=null;if(!old)return;try{await old.analyzer?.dispose();}finally{try{const settled=await Promise.allSettled([Promise.resolve().then(()=>old.dense?.dispose()),Promise.resolve().then(()=>old.sparse?.dispose())]);forge?.clearCache();const failed=settled.find(r=>r.status==='rejected');if(failed)throw failed.reason;}finally{try{await old.sparseSession?.dispose();}finally{old.rgbLease?.release();old.controlRelease?.();}}}}
 async function frame(record,{filters,view=[]}={},hooks={}){
  requireValue(Array.isArray(view)&&view.every(a=>a&&actions.has(a.method)),'Explicit automatic view actions required.');
  for(const action of view)record.analyzer.view[action.method](action.value);
  let lease;try{lease=await record.analyzer.prepare(filters,hooks);const shown=record.analyzer.visible(lease),state=record.analyzer.snapshot(),bytes=payloadBytes(lease.entries)+payloadBytes(state)+8192,free=budget.reserve(bytes);
   try{return {id:record.taskId,imageId:record.imageId,operation:record.operation,status:Object.values(state.states).includes('failed')?'partial':'ok',analysisId:record.id,selection:structuredClone(record.selection),data:{entries:structuredClone(shown),allEntryCount:lease.entries.length,state,filters:structuredClone(lease.filters),view:record.analyzer.view.getState()},layers:shown.map(e=>({id:e.id,kind:e.pixel_mask?'mask':'polygons',source:e.source,origin:e.origin??[0,0],field:'data.entries',entryId:e.id})),provenance:{engine:version,operation:record.operation,originalSha256:record.image.sha256,decode:structuredClone(record.image.provenance),coordinates:'original-pixel-centres',numericalQualification:'Per-engine proofs; M2 Forgeryscope polygon/score differences remain measured, not hidden.'},metrics:{preflightExecutions:0,cache:{analysis:record.reused},memory:budget.snapshot()}};}finally{free();}
  }finally{await lease?.release();}
 }
 return {
  configured(){return {forgeryscope:!!forge,ocr:!!getLanguage(),d2prl:!!getD2prl()?.configured()};},
  async load(input,{signal}={}){
   requireValue(input&&Object.keys(input).every(k=>k==='forgeryscope'),'Use loadM3Models for OCR and loadD2prlModel for D2PRL.');
   await clear();let candidate,release;
   try{if(input.forgeryscope){const c=input.forgeryscope;requireValue(c.assets&&c.runtimes&&typeof c.preparationFactoryUrl==='string'&&typeof c.siftFactoryUrl==='string','Explicit Forgeryscope assets, runtimes and preparation/SIFT factory URLs required.');release=budget.reserve(payloadBytes(c)*2);const config=structuredClone(c),preparationFactory=(await import(config.preparationFactoryUrl)).default,siftFactory=(await import(config.siftFactoryUrl)).default;checkAbort(signal);candidate=createForgeryscopeAnalyzer({...config,preparationFactory,siftFactory,budget,computeProfile:profile.id,resourceHints:profile.hints});}
    forge?.dispose();modelRelease?.();forge=candidate;modelRelease=release;candidate=null;release=null;return this.configured();
   }finally{candidate?.dispose();release?.();}
  },
  async run(task,image,hooks={}){
   const p=task.params??{};requireValue(Object.keys(p).every(k=>['selection','d2Minimum','ela','maxConcurrent'].includes(k)),'Unknown automatic analysis parameter.');requireValue(!task.regions?.length,'Automatic polygons belong in params.selection.');requireValue(['auto','cpu',undefined].includes(task.backend),'Automatic analysis supports auto or reference CPU.');
   const key=JSON.stringify([task.imageId,task.operation,p,task.backend??'auto']);
   if(current?.key===key){current.taskId=task.id;current.reused=true;return frame(current,{},hooks);}
   await clear();const r={id:crypto.randomUUID(),key,image,imageId:task.imageId,operation:task.operation,taskId:task.id,reused:false};current=r;
   let rgbPending;
   async function rgb(signal){
    if(image.pixels)return image.pixels;if(r.rgbLease)return r.rgbLease.pixels;
    if(!rgbPending){const d=image.surface.descriptor;rgbPending=image.surface.readWindow({x:0,y:0,width:d.width,height:d.height},{signal}).then(lease=>{r.rgbLease=lease;return lease.pixels;}).finally(()=>{rgbPending=null;});}return rgbPending;
   }
   try{
    const shape=image.surface?.descriptor??image.pixels;let selection=p.selection;
    if(selection===undefined){let polygons;
     if(image.segmented){const detected=await detectSegmentedPanels(image,{budget,signal:hooks.signal,onProgress:hooks.onProgress});try{polygons=structuredClone(detected.polygons);}finally{detected.dispose();}}
     else{const releases=[];try{polygons=await detectPanels(image.pixels,{signal:hooks.signal,account:n=>releases.push(budget.reserve(n)),onProgress:fraction=>hooks.onProgress?.({phase:'automatic-panels',fraction})});}finally{releases.forEach(f=>f());}}
     selection=automaticSelection(shape.width,shape.height,polygons);
    }
    r.controlRelease=budget.reserve(payloadBytes(selection)*3+8192);r.selection=structuredClone(selection);
    const dense={async analyze(params,options){r.dense??=new DenseCopyEngine(image.segmented?image:await rgb(options.signal),budget,{geometry,profile});return r.dense.analyze(params,options);}};
    // The admitted RGB lease does not carry its source's temporary storage.
    // Paged SIFT must keep that context, including reflected extraction passes.
    const sparseStorage={get temporarySession(){return image.session??r.sparseSession;},async getTemporarySession(options={}){
     if(image.ensureTemporarySession)return image.ensureTemporarySession(options);
     checkAbort(options.signal);if(r.sparseSession)return r.sparseSession;
     r.sparseSessionPending??=createTemporarySession({budget,signal:options.signal}).then(session=>{r.sparseSession=session;onTemporarySession?.({id:session.id,backend:session.backend});return session;}).finally(()=>{r.sparseSessionPending=null;});
     return r.sparseSessionPending;
    }};
    const sparse={async analyze(params,options){const language=getLanguage();if(!language)throw new EngineError('MODEL_UNAVAILABLE','Load verified English OCR weights through loadM3Models({models:{},language}) for SIFT Panels + Text.');r.sparse??=new SparseCopyEngine(await rgb(options.signal),budget,profile);return r.sparse.analyze(params,{...options,language,storageContext:sparseStorage});}};
    const d2prl={async runOwned(request,source,options){const adapter=getD2prl();if(!adapter?.configured())throw new EngineError('MODEL_UNAVAILABLE','Load the pinned D2PRL manifest through loadD2prlModel.');return adapter.runOwned(request,image.segmented?image:{...image,pixels:await rgb(options.signal)},options);},readRawOwned(request){return getD2prl().readRawOwned(request);}};
    const forgeryscope={analyze(...args){if(!forge)throw new EngineError('MODEL_UNAVAILABLE','Load Forgeryscope assets and runtime URLs through loadAutomaticModels.');return forge.analyze(...args);}};
    r.analyzer=await createAutomaticAnalyzer({image,imageId:task.imageId,selection:r.selection,budget,engines:{dense,sparse,geometry,d2prl,forgeryscope},complete:task.operation==='analysis.complete',cpu:task.backend==='cpu',d2Minimum:p.d2Minimum,maxConcurrent:p.maxConcurrent,ela:{...p.ela,maxWorkers:Math.min(32,profile.maxWorkers),onTemporarySession}});
    await r.analyzer.run({...hooks,onState:state=>hooks.onProgress?.({phase:'automatic-state',state})});checkAbort(hooks.signal);return await frame(r,{},hooks);
   }catch(error){await clear();throw error;}
  },
  async update(request,hooks){return frame(find(request.analysisId),request,hooks);},
  async render(request,{signal,onProgress}={}){
   const r=find(request.analysisId),a=r.analyzer,{width,height}=a.plan;
   requireValue(request.layer===undefined||['corroboration','ela-preview','energy-low','energy-high'].includes(request.layer),'Unknown automatic layer.');
   if(request.layer&&request.layer!=='corroboration'){
    const raw=a.acquireResults();let surface,published=false;
    try{const ela=raw.values.ela;if(!ela)throw new EngineError('RESULT_UNAVAILABLE','ELA group has no completed result.');
     if(request.layer==='ela-preview'){const original=ela.preview.surface,id=crypto.randomUUID();let closed=false;surface={descriptor:{...original.descriptor,id},async readWindow(rect,hooks){if(closed)throw new EngineError('DISPOSED','Automatic layer disposed.');const value=await original.readWindow(rect,hooks);return {...value,surfaceId:id};},async dispose(){if(closed)return;closed=true;await raw.release();}};}
     else{const store=ela.energy?.[request.layer==='energy-low'?'energy_low_score':'energy_high_score'];if(!store)throw new EngineError('RESULT_UNAVAILABLE','Enable the ELA background energy calculation for this layer.');surface=createNumericSurface(store,{width,height,format:'float32',budget,semantics:'Native JPEG residual energy score; not a probability.',dispose:()=>raw.release()});}
     const bundle=publishResult(r.imageId,{surface});published=true;return {...bundle,analysisId:r.id,view:a.view.getState(),layers:[{id:request.layer,kind:request.layer==='ela-preview'?'rgb':'scalar',surfaceId:bundle.surface.id,origin:[0,0]}]};
    }finally{if(!published){if(surface)await surface.dispose();else await raw.release();}}
   }
   let lease,engine,store,session,surface,published=false;
   try{lease=await a.prepare({}, {signal,onProgress});const entries=a.visible(lease).filter(e=>CLONE_SOURCES.includes(e.source));engine=createCloneCorroboration({budget});
    const headroom=budget.reserve(64*1024**2);try{store=await createSegmentedBytes(width*height*4,{budget,signal,storage:'auto',getTemporarySession:async()=>{if(!session){session=await createTemporarySession({budget,signal});onTemporarySession?.({id:session.id,backend:session.backend});}return session;}});}finally{headroom();}
    await engine.stripes({width,height,entries,excluded:a.plan.excluded,byContext:true},strip=>store.write(new Uint8Array(strip.values.buffer,strip.values.byteOffset,strip.values.byteLength),strip.top*width*4),{signal,onProgress:fraction=>onProgress?.({phase:'automatic-corroboration',fraction})});await store.flush();checkAbort(signal);
    surface=createNumericSurface(store,{width,height,format:'int32',budget,semantics:'Count of distinct detector × search-context votes; D2PRL at most one; ELA never votes.',dispose:async()=>{try{await store.dispose();}finally{await session?.dispose();}}});
    const bundle=publishResult(r.imageId,{surface});published=true;return {...bundle,analysisId:r.id,view:a.view.getState(),layers:[{id:'corroboration',kind:'count',surfaceId:bundle.surface.id,origin:[0,0]}]};
   }finally{engine?.dispose();await lease?.release();if(!published){if(surface)await surface.dispose();else try{await store?.dispose();}finally{await session?.dispose();}}}
  },
  async export(request,hooks){const r=find(request.analysisId);let archive;try{archive=await r.analyzer.export(request.options??{},request,{...hooks,onTemporarySession});const descriptor=exports.adopt(archive,{imageId:r.imageId,analysisId:r.id,operation:r.operation,originalSha256:r.image.sha256,width:r.analyzer.plan.width,height:r.analyzer.plan.height});archive=null;return descriptor;}finally{await archive?.dispose();}},
  clear,
  async clearImage(id){if(current?.imageId===id)await clear();},
  async dispose(){try{await clear();}finally{forge?.dispose();forge=null;modelRelease?.();modelRelease=null;}},
  get active(){return !!current;}
 };
}
