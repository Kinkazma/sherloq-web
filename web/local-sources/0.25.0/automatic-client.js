import {compileOriginalSourceRegions} from './unified-engine/src/source-region-geometry.js';
import {sourceRegionDomainShape,assertSourceRegionOperation} from './unified-engine/src/source-region-capabilities.js';
import {localFeaturePolicy} from './feature-policy.js?v=0.25.0';
import {createWorkerEngine} from './unified-engine/src/worker-client.js';
import {readExtensionMemoryHints} from './unified-engine/src/browser-memory.js';
import {D2PRL_MODEL_IDENTITY} from './unified-engine/src/d2prl-model-identity.js';
import {COUNT_COLORS} from './unified-engine/src/clone-corroboration.js';
import {createAdaptivePreview} from './adaptive-preview.js?v=0.25.0';

const cancelled = () => Object.assign(new Error('Analysis cancelled.'), {code: 'CANCELLED'});
export async function createAutomaticClient({computeProfile = 'maximum', extensionId, onProgress = () => {}, engineFactory = createWorkerEngine, fetcher = fetch, config, retainMasks = false, memoryBudgetBytes} = {}) {
  const configurationURL = new URL('./integrated-config.json?v=0.25.0', import.meta.url);
  async function json(url, signal) { const response = await fetcher(url, {signal}); if (!response.ok) throw new Error('Resource unavailable: ' + response.status + ' ' + url); return response.json(); }
  const deployment = config ?? await json(configurationURL);
  const base = new URL(deployment.assetBase, configurationURL), url = name => new URL(name, base).href;
  extensionId ??= deployment.memoryExtensionId;
  let hints;
  if (extensionId) try { hints = await readExtensionMemoryHints(extensionId); } catch { /* Optional bridge. */ }
  const engine = engineFactory({computeProfile, resourceHints: hints ?? undefined, ...(memoryBudgetBytes ? {memoryBudgetBytes} : {}), ...(extensionId ? {memoryExtensionId: extensionId} : {})});
  let analysisPolicy,queue = Promise.resolve(), disposed = false, models = new Set(), abort, analysis, retained, source, rendered, renderingLayer, disposePromise,regionPresentation;
  const pendingOriginals = new Set(),pendingArchives = new Set(),pendingD2Previews=new Set(),d2Adaptive=createAdaptivePreview();let previewAbort;
  const unavailable=message=>Object.assign(new Error(message),{code:'PREVIEW_UNAVAILABLE'});
  const acknowledged=value=>{if(value===false||value===0)throw unavailable('Temporary preview retirement was not acknowledged.');};
  function retireD2Preview(record){
    if(record.pending)return record.pending;
    const pending=(async()=>{const failures=[];for(const[id,release]of [...record.surfaces].map(id=>[id,()=>engine.releaseSurface(id)]))try{acknowledged(await release());record.surfaces.delete(id);}catch(error){failures.push(error);}for(const id of [...record.credits])try{acknowledged(await engine.releaseExternalMemory(id));record.credits.delete(id);}catch(error){failures.push(error);}if(!record.surfaces.size&&!record.credits.size)pendingD2Previews.delete(record);if(failures.length)throw failures[0];})();record.pending=pending;void pending.finally(()=>{if(record.pending===pending)record.pending=null;}).catch(()=>{});return pending;
  }
  async function drainD2Previews(){for(const record of [...pendingD2Previews])await retireD2Preview(record);}
  function enqueue(fn) { const task = queue.then(async() => { if (disposed) throw cancelled();await drainD2Previews();return fn(); }); queue = task.catch(() => {}); return task; }
  function hooks() { return {signal: abort?.signal, onProgress}; }
  function checkCurrentAbort(){if(abort?.signal.aborted)throw cancelled();}
  async function configure(excludedFeatures=[],{needsOCR=true}={}) {
    const excluded=new Set(excludedFeatures),signal = abort?.signal;
    if (!excluded.has('m2.forgeryscope')&&!models.has('forgeryscope')) {
    const manifest = await json(url('forgeryscope/manifest.json'), signal), segments = await json(url('aliked-segments/manifest.json'), signal), runtime = await json(url('neural-runtime/manifest.json'), signal);
    const resolve = (assets, folder) => Object.fromEntries(Object.entries(assets).map(([key, asset]) => [key, {...asset, url: url(folder + asset.file)}]));
    const runtimes = Object.fromEntries(Object.entries(runtime.providers).map(([provider, value]) => [provider, {
      factoryUrl: url('neural-runtime/' + value.factory), ortUrl: url('ort/ort.' + (provider === 'wasm' ? 'wasm' : 'webgpu') + '.min.mjs'), wasmUrl: url('ort/' + value.wasm)
    }]));
    await engine.loadAutomaticModels({forgeryscope: {assets: resolve(manifest.assets, 'forgeryscope/'), alikedSegments: {...segments, assets: resolve(segments.assets, 'aliked-segments/')}, runtimes,
      preparationFactoryUrl: new URL('./unified-engine/.build/forgeryscope/prepare.mjs', import.meta.url).href,
      siftFactoryUrl: new URL('./unified-engine/.build/forgeryscope/sift.mjs', import.meta.url).href, siftIdentity: 'native-sift'}}, hooks());
    models.add('forgeryscope');
    }
    if(!excluded.has('ai.clones.d2prl')&&!models.has('d2prl')){await engine.loadD2prlModel({...D2PRL_MODEL_IDENTITY, url: url('d2prl/model.json')}, hooks());models.add('d2prl');}
    if(needsOCR&&!models.has('ocr')){
    const response = await fetcher(url('ocr/eng.traineddata'), {signal}); if (!response.ok) throw new Error('English OCR resource unavailable.');
    const data = new Uint8Array(await response.arrayBuffer());
    await engine.loadM3Models({models: {}, language: {data, sha256: deployment.englishSha256}}, hooks());
    models.add('ocr');
    }
  }
  async function releaseRendering() { if (rendered) { const previous = rendered; await engine.releaseSurface(previous.id); if(rendered===previous){rendered = null; renderingLayer = null;} } }
  function checkpoint() { return retained ?? (analysis?.data?.state?.resumable?.length ? {analysisId: analysis.analysisId, state: analysis.data.state, completed: analysis.data.state.completed} : null); }
  async function releaseRegionPresentation(){if(!regionPresentation)return;const old=regionPresentation;await engine.releaseSurface(old.surface.id);if(regionPresentation===old)regionPresentation=null;}
  async function normalizeRegionPresentation(value){const surface=value?.sourceRegionSourceSurface;if(!surface||surface.id===source?.surface.id)return value;const fingerprint=value.sourceRegionDomain?.fingerprint;if(regionPresentation?.fingerprint===fingerprint){if(surface.id!==regionPresentation.surface.id)await engine.releaseSurface(surface.id);return{...value,sourceRegionSourceSurface:regionPresentation.surface};}await releaseRegionPresentation();regionPresentation={surface,fingerprint};return value;}
  async function releaseAnalysis() {
    const id = analysis?.analysisId ?? retained?.analysisId;
    if (id) await engine.releaseAutomatic();
    analysis = retained = null;await releaseRegionPresentation();
  }
  // Pixels stay owned by the worker. Presentation and NPZ read those originals;
  // the UI only needs descriptors and polygons, never a second retained mask.
  function compactResult(value) {
    if (!retainMasks && value?.data?.entries) value.data.entries = value.data.entries.map(({pixel_mask, ...entry}) => ({...entry, ...(pixel_mask ? {pixel_mask: {width: pixel_mask.width, height: pixel_mask.height}} : {})}));
    return value;
  }
  async function execute(fn) {
    abort = new AbortController();
    try { analysis = compactResult(await normalizeRegionPresentation(await fn())); retained = null; return analysis; }
    catch (error) { retained = error.details?.retainedAnalysis ?? retained; if (error.imagesCleared) { source = null; models = new Set(); retained = null; analysis = null; } throw error; }
    finally { abort = null; }
  }
  async function pixels(display, rect) {
    const request = {surfaceId: display.id, revision: display.revision, rect};
    if (display.format === 'rgb8') return (await engine.readPixels(request)).pixels;
    const answer = await engine.readPlane(request), plane = answer.plane ?? answer.pixels, values = plane.data;
    const data = display.overlay && source ? (await engine.readPixels({surfaceId: (regionPresentation?.surface??source.surface).id, revision: (regionPresentation?.surface??source.surface).revision, rect})).pixels.data : new Uint8Array(rect.width * rect.height * 3);
    for (let i = 0; i < values.length; i++) {
      const color = display.layer === 'corroboration' ? COUNT_COLORS[Math.max(0, Math.min(COUNT_COLORS.length - 1, values[i]))] : [Math.max(0, Math.min(255, Math.round(values[i] * 255))), 0, 0];
      if (!display.overlay || values[i] > 0) for (let c = 0; c < 3; c++) data[i * 3 + c] = display.overlay ? Math.round(data[i * 3 + c] * (1 - display.opacity) + color[c] * display.opacity) : color[c];
    }
    return {width: rect.width, height: rect.height, format: 'rgb8', data};
  }
  function previewD2Minimum({minimum,layer='corroboration',overlay=true,opacity=.7}={}, {signal,isCurrent=()=>true}={}){
    return enqueue(async()=>{
      if(!Number.isInteger(minimum)||minimum<0||minimum>5000||layer!=='corroboration'||!analysis)return null;
      if(typeof engine.previewAutomaticD2!=='function')throw unavailable('Temporary automatic D2 rendering is unavailable.');
      const currentSource=source,currentAnalysis=analysis,currentRetained=retained,currentRendered=rendered,currentRenderingLayer=renderingLayer,currentRegion=regionPresentation,view=JSON.stringify(analysis.data?.view),analysisId=analysis.analysisId,sourceSha=source?.sha256,policy=analysisPolicy,local=new AbortController(),abortPreview=()=>local.abort(signal?.reason),started=performance.now();
      previewAbort=local;signal?.addEventListener('abort',abortPreview,{once:true});if(signal?.aborted)abortPreview();
      const current=()=>!disposed&&!local.signal.aborted&&isCurrent()&&source===currentSource&&!!source&&analysis===currentAnalysis&&analysis.analysisId===analysisId&&source.sha256===sourceSha&&retained===currentRetained&&rendered===currentRendered&&renderingLayer===currentRenderingLayer&&regionPresentation===currentRegion&&analysisPolicy===policy&&JSON.stringify(analysis.data?.view)===view;
      const check=()=>{if(!current())throw cancelled();};let record,failed=false,primary;
      try{
        check();const answer=await engine.previewAutomaticD2({analysisId:analysis.analysisId,minimum,layer,expectedView:structuredClone(analysis.data?.view)},{signal:local.signal,onProgress});
        // A published handle remains ours even when cancellation won locally.
        const protectedIds=new Set([currentRendered?.id,currentSource?.surface?.id,currentRegion?.surface?.id,currentAnalysis?.surface?.id].filter(Boolean));
        record={surfaces:new Set([answer?.surface,answer?.sourceRegionSourceSurface].filter(v=>v?.id&&!protectedIds.has(v.id)).map(v=>v.id)),credits:new Set(),pending:null};pendingD2Previews.add(record);check();
        if(answer?.analysisId!==currentAnalysis.analysisId||answer.calculatedMinimum!==minimum||answer.metrics?.inferences!==0||answer.originalSha256!==currentSource.sha256||(answer.sourceRegionDomain?.fingerprint??null)!==(currentAnalysis.sourceRegionDomain?.fingerprint??null)||JSON.stringify(answer.sourceRegionOrigin??null)!==JSON.stringify(currentAnalysis.sourceRegionOrigin??null))throw unavailable('The temporary automatic D2 result differs from its committed analysis or requested minimum.');
        const calculatedView={...answer.calculatedView},committedView={...currentAnalysis.data?.view};delete calculatedView.d2prlMinimum;delete committedView.d2prlMinimum;
        if(answer.calculatedView?.d2prlMinimum!==minimum||JSON.stringify(calculatedView)!==JSON.stringify(committedView))throw unavailable('The temporary automatic D2 view changed another committed filter.');
        const display=answer.surface,baseSource=currentRegion?.surface??currentSource.surface;if(!display||protectedIds.has(display.id)||![display.width,display.height].every(v=>Number.isSafeInteger(v)&&v>0)||display.width!==baseSource.width||display.height!==baseSource.height||answer.sourceRegionSourceSurface)throw unavailable('The temporary automatic D2 surface is not an independent owned result on the committed source grid.');
        const memory=(await engine.capabilities()).memory??{};check();const available=Math.max(0,(memory.budgetBytes??memoryBudgetBytes??64*1024**2)-(memory.retainedBytes??0)-(memory.cacheBytes??0)-(memory.activeReservationBytes??0)-(memory.knownHeapCapacityBytes??0)-65536),maxPixels=Math.min(2048**2,Math.floor(available/40));
        if(maxPixels<16**2)throw unavailable('No bounded RGB workspace is available for the temporary automatic D2 view.');
        const plan=d2Adaptive.plan({key:'automatic/d2-minimum/corroboration',width:display.width,height:display.height,maxSide:2048,maxPixels}),lease=await engine.reserveExternalMemory({bytes:plan.width*plan.height*40+65536});record.credits.add(lease.id);check();
        const render={range:[0,1],palette:COUNT_COLORS,...(overlay?{overlaySurfaceId:(currentRegion?.surface??currentSource.surface).id,opacity}: {})},pixels=(await engine.readDisplay({surfaceId:display.id,revision:display.revision,tile:{x:0,y:0,w:display.width,h:display.height,step:plan.step},render})).pixels;check();
        if(pixels?.format!=='rgb8'||pixels.width!==plan.width||pixels.height!==plan.height||!(pixels.data instanceof Uint8Array)||pixels.data.length!==plan.width*plan.height*3)throw unavailable('The temporary automatic RGB differs from its admitted display grid.');
        const milliseconds=performance.now()-started;
        return{operation:currentAnalysis.operation??'analysis.complete',analysisId:currentAnalysis.analysisId,pixels:{...pixels,data:pixels.data.slice(),logicalWidth:display.width,logicalHeight:display.height,previewCoordinates:'source'},params:{minimum:answer.calculatedMinimum},calculatedView:structuredClone(answer.calculatedView),sourceRegionDomain:answer.sourceRegionDomain,sourceRegionOrigin:answer.sourceRegionOrigin,exact:false,approximate:true,provisional:true,exportable:false,metrics:{...answer.metrics,automaticD2Preview:true,calculatedMinimum:answer.calculatedMinimum,displayLayer:layer,displayStep:plan.step,totalMs:milliseconds,adaptivePreview:{token:plan.token,milliseconds,setupMilliseconds:0,cold:false,pixels:plan.width*plan.height}}};
      }catch(error){failed=true;primary=error;throw error;}
      finally{try{if(record)await retireD2Preview(record);}catch(cleanup){if(!failed)throw cleanup;try{if(primary&&typeof primary==='object'&&Object.isExtensible(primary))primary.cleanupErrors=[...(primary.cleanupErrors??[]),cleanup];}catch{}}finally{signal?.removeEventListener('abort',abortPreview);if(previewAbort===local)previewAbort=null;}}
    });
  }
  function previewOpacity({layer='corroboration',overlay=true,opacity=.7}={}, {signal,isCurrent=()=>true}={}){
    return enqueue(async()=>{
      if(!analysis||!source||!rendered||renderingLayer!==layer||!Number.isFinite(opacity)||opacity<0||opacity>1)return null;
      const currentSource=source,currentAnalysis=analysis,currentRendered=rendered,currentRetained=retained,currentRegion=regionPresentation,view=JSON.stringify(analysis.data?.view),policy=analysisPolicy,started=performance.now();
      const check=()=>{if(disposed||signal?.aborted||isCurrent()!==true||source!==currentSource||analysis!==currentAnalysis||rendered!==currentRendered||renderingLayer!==layer||retained!==currentRetained||regionPresentation!==currentRegion||JSON.stringify(analysis.data?.view)!==view||analysisPolicy!==policy)throw cancelled();};
      let record,failed=false,primary;
      try{check();const display=currentRendered,memory=(await engine.capabilities()).memory??{};check();const available=Math.max(0,(memory.budgetBytes??memoryBudgetBytes??64*1024**2)-(memory.retainedBytes??0)-(memory.cacheBytes??0)-(memory.activeReservationBytes??0)-(memory.knownHeapCapacityBytes??0)-65536),maxPixels=Math.min(2048**2,Math.floor(available/40));if(maxPixels<16**2)throw unavailable('No bounded RGB workspace is available for the cached automatic view.');
       const plan=d2Adaptive.plan({key:'automatic/opacity/'+layer,width:display.width,height:display.height,maxSide:2048,maxPixels}),lease=await engine.reserveExternalMemory({bytes:plan.width*plan.height*40+65536});record={surfaces:new Set(),credits:new Set([lease.id]),pending:null};pendingD2Previews.add(record);check();
       const render=display.format==='rgb8'?undefined:{range:[0,1],...(layer==='corroboration'?{palette:COUNT_COLORS}:{red:true}),...(overlay?{overlaySurfaceId:(currentRegion?.surface??currentSource.surface).id,opacity}:{})},pixels=(await engine.readDisplay({surfaceId:display.id,revision:display.revision,tile:{x:0,y:0,w:display.width,h:display.height,step:plan.step},render})).pixels;check();
       if(pixels?.format!=='rgb8'||pixels.width!==plan.width||pixels.height!==plan.height||!(pixels.data instanceof Uint8Array)||pixels.data.length!==plan.width*plan.height*3)throw unavailable('Cached automatic RGB differs from its admitted grid.');
       return{pixels:{...pixels,data:pixels.data.slice(),logicalWidth:display.width,logicalHeight:display.height,preview:true},presentation:{layer,overlay,opacity},provisional:true,approximate:true,exportable:false,metrics:{cachedAutomaticPresentation:true,adaptivePreview:{token:plan.token,milliseconds:performance.now()-started,setupMilliseconds:0,cold:false,pixels:plan.width*plan.height}}};
      }catch(error){failed=true;primary=error;throw error;}finally{try{if(record)await retireD2Preview(record);}catch(cleanup){if(!failed)throw cleanup;try{if(primary&&typeof primary==='object'&&Object.isExtensible(primary))primary.cleanupErrors=[...(primary.cleanupErrors??[]),cleanup];}catch{}}}
    });
  }
  return {
    deployment,
    previewD2Minimum,previewOpacity,
    get result() { return analysis; }, get checkpoint() { return checkpoint(); }, get source() { return source; },
    capabilities: () => engine.capabilities(),
    reserveExport:async bytes=>{const lease=await enqueue(()=>engine.reserveExternalMemory({bytes}));return()=>engine.releaseExternalMemory(lease.id);},
    pause() { abort?.abort(); return queue; },
    load(input) { return enqueue(() => execute(async () => { await releaseRendering(); await releaseAnalysis(); const previous = source; source = null; if (previous) pendingOriginals.add(previous.id); for(const id of pendingOriginals){await engine.unload(id);pendingOriginals.delete(id);} source = await engine.loadBlob({...input, layout: 'segmented'}, hooks()); return null; })).then(() => source); },
    run(task) { return enqueue(() => execute(async () => { localFeaturePolicy.assertTaskAvailable(task);if(task.sourceRegionDomain){const domain=await compileOriginalSourceRegions(task.sourceRegionDomain);checkCurrentAbort();if(domain.sourceSha256!==source.sha256||domain.sourceWidth!==source.width||domain.sourceHeight!==source.height)throw Object.assign(Error('Original-source automatic domain belongs to another source.'),{code:'SOURCE_REGIONS_INVALID'});const regionCapabilities=(await engine.capabilities()).sourceRegions;checkCurrentAbort();assertSourceRegionOperation(task.operation,{shape:sourceRegionDomainShape(domain),params:task.params,task,capabilities:regionCapabilities});task={...task,sourceRegionDomain:domain.descriptor};}analysisPolicy=JSON.stringify(localFeaturePolicy.snapshot());const excludedFeatures=localFeaturePolicy.automaticExcludedFeatures();task={...task,params:{...task.params,...(excludedFeatures.length?{excludedFeatures}:{})}};await releaseRendering();checkCurrentAbort();const scope=task.params?.scientificScope,nativeAcquisitionsOnly=scope?.version==='original-source-regions-batch-1'&&(scope.text?.skipped===true||scope.text?.disabled===true);await configure(excludedFeatures,{needsOCR:!(task.operation==='analysis.clones'&&scope?.text?.status==='complete'&&!nativeAcquisitionsOnly)});checkCurrentAbort();await releaseAnalysis();checkCurrentAbort();return engine.run(task,hooks()); })); },
    resume() { return enqueue(() => execute(async () => { if(analysisPolicy!==JSON.stringify(localFeaturePolicy.snapshot()))throw Object.assign(Error('Les fonctions locales ont changé ; relancez l’analyse avec les méthodes disponibles.'),{code:'FEATURE_POLICY_CHANGED'});const point = checkpoint(); if (!point) throw new Error('No retained analysis to resume.'); return engine.resumeAutomatic({analysisId: point.analysisId}, hooks()); })); },
    update(view = [], filters) { return enqueue(() => execute(async () => { if (!analysis) throw new Error('No analysis result.'); await releaseRendering(); return engine.updateAutomatic({analysisId: analysis.analysisId, view, ...(filters ? {filters} : {})}, hooks()); })); },
    display(layer = 'corroboration', {overlay = false, opacity = .7} = {}) { return enqueue(async () => { if (rendered && renderingLayer === layer) return {...rendered, layer, overlay, opacity}; await releaseRendering(); const answer = await normalizeRegionPresentation(await engine.renderAutomatic({analysisId: analysis.analysisId, layer}, {onProgress})); rendered = answer.surface; renderingLayer = layer; return {...rendered, layer, overlay, opacity}; }); },
    readWindow(display, rect) { return enqueue(() => pixels(display, rect)); },
    readTile(display,tile){return enqueue(async()=>{
      const render=display.format==='rgb8'?undefined:{range:[0,1],...(display.layer==='corroboration'?{palette:COUNT_COLORS}:{red:true}),...(display.overlay&&source?{overlaySurfaceId:(regionPresentation?.surface??source.surface).id,opacity:display.opacity}: {})};
      return (await engine.readDisplay({surfaceId:display.id,revision:display.revision,tile,render})).pixels;
    });},
    exportTo(sink) { return enqueue(async () => {
      abort = new AbortController();
      let archive,failed=false,primary;
      try {
        for(const id of pendingArchives){await engine.releaseExport(id);pendingArchives.delete(id);}
        const id = analysis?.analysisId ?? retained?.analysisId; if (!id) throw new Error('No retained analysis.');
        archive = await engine.exportAutomatic({analysisId: id, storage: 'temporary'}, hooks());pendingArchives.add(archive.id);
        for (let offset = 0; offset < archive.byteLength; offset += 1024 * 1024) {
          if (abort.signal.aborted) throw cancelled();
          const {bytes} = await engine.readExport({exportId: archive.id, revision: archive.revision, offset, length: Math.min(1024 * 1024, archive.byteLength - offset)}, hooks());
          await sink.write(bytes); onProgress({phase: 'export-download', completed: offset + bytes.length, total: archive.byteLength});
        }
        return analysis;
      } catch(error){failed=true;primary=error;throw error;} finally {try{if(archive)try{await engine.releaseExport(archive.id);pendingArchives.delete(archive.id);}catch(error){if(failed){if(primary&&typeof primary==='object'&&Object.isExtensible(primary))try{primary.cleanupError??=error;}catch{}}else throw error;}}finally{abort=null;}}
    }); },
    dispose() { if (disposePromise) return disposePromise; disposed = true; abort?.abort();previewAbort?.abort(); disposePromise = queue.then(async () => {await drainD2Previews();await engine.dispose(); source = analysis = retained = rendered = regionPresentation = null; pendingOriginals.clear();pendingArchives.clear(); }).catch(error=>{disposePromise=null;throw error;}); return disposePromise; }
  };
}
