import {createWorkerEngine} from './unified-engine/src/worker-client.js';
import {readExtensionMemoryHints} from './unified-engine/src/browser-memory.js';
import {D2PRL_MODEL_IDENTITY} from './unified-engine/src/d2prl-model-identity.js';
import {COUNT_COLORS} from './unified-engine/src/clone-corroboration.js';

const cancelled = () => Object.assign(new Error('Analysis cancelled.'), {code: 'CANCELLED'});
export async function createAutomaticClient({computeProfile = 'maximum', extensionId, onProgress = () => {}, engineFactory = createWorkerEngine, fetcher = fetch, config} = {}) {
  const configurationURL = new URL('./integrated-config.json', import.meta.url);
  async function json(url, signal) { const response = await fetcher(url, {signal}); if (!response.ok) throw new Error('Resource unavailable: ' + response.status + ' ' + url); return response.json(); }
  const deployment = config ?? await json(configurationURL);
  const base = new URL(deployment.assetBase, configurationURL), url = name => new URL(name, base).href;
  extensionId ??= deployment.memoryExtensionId;
  let hints;
  if (extensionId) try { hints = await readExtensionMemoryHints(extensionId); } catch { /* Optional bridge. */ }
  const engine = engineFactory({computeProfile, resourceHints: hints ?? undefined, ...(extensionId ? {memoryExtensionId: extensionId} : {})});
  let queue = Promise.resolve(), disposed = false, models = false, abort, analysis, retained, source, rendered, renderingLayer, disposePromise;
  function enqueue(fn) { const task = queue.then(() => { if (disposed) throw cancelled(); return fn(); }); queue = task.catch(() => {}); return task; }
  function hooks() { return {signal: abort?.signal, onProgress}; }
  async function configure() {
    if (models) return;
    const signal = abort?.signal, manifest = await json(url('forgeryscope/manifest.json'), signal), segments = await json(url('aliked-segments/manifest.json'), signal), runtime = await json(url('neural-runtime/manifest.json'), signal);
    const resolve = (assets, folder) => Object.fromEntries(Object.entries(assets).map(([key, asset]) => [key, {...asset, url: url(folder + asset.file)}]));
    const runtimes = Object.fromEntries(Object.entries(runtime.providers).map(([provider, value]) => [provider, {
      factoryUrl: url('neural-runtime/' + value.factory), ortUrl: url('ort/ort.' + (provider === 'wasm' ? 'wasm' : 'webgpu') + '.min.mjs'), wasmUrl: url('ort/' + value.wasm)
    }]));
    await engine.loadAutomaticModels({forgeryscope: {assets: resolve(manifest.assets, 'forgeryscope/'), alikedSegments: {...segments, assets: resolve(segments.assets, 'aliked-segments/')}, runtimes,
      preparationFactoryUrl: new URL('./unified-engine/.build/forgeryscope/prepare.mjs', import.meta.url).href,
      siftFactoryUrl: new URL('./unified-engine/.build/forgeryscope/sift.mjs', import.meta.url).href, siftIdentity: 'native-sift'}}, hooks());
    await engine.loadD2prlModel({...D2PRL_MODEL_IDENTITY, url: url('d2prl/model.json')}, hooks());
    const response = await fetcher(url('ocr/eng.traineddata'), {signal}); if (!response.ok) throw new Error('English OCR resource unavailable.');
    const data = new Uint8Array(await response.arrayBuffer());
    await engine.loadM3Models({models: {}, language: {data, sha256: deployment.englishSha256}}, hooks());
    models = true;
  }
  async function releaseRendering() { if (rendered) { const previous = rendered; rendered = null; renderingLayer = null; await engine.releaseSurface(previous.id); } }
  function checkpoint() { return retained ?? (analysis?.data?.state?.resumable?.length ? {analysisId: analysis.analysisId, state: analysis.data.state, completed: analysis.data.state.completed} : null); }
  async function releaseAnalysis() {
    const id = analysis?.analysisId ?? retained?.analysisId;
    if (id) await engine.releaseAutomatic();
    analysis = retained = null;
  }
  // Pixels stay owned by the worker. Presentation and NPZ read those originals;
  // the UI only needs descriptors and polygons, never a second retained mask.
  function compactResult(value) {
    if (value?.data?.entries) value.data.entries = value.data.entries.map(({pixel_mask, ...entry}) => ({...entry, ...(pixel_mask ? {pixel_mask: {width: pixel_mask.width, height: pixel_mask.height}} : {})}));
    return value;
  }
  async function execute(fn) {
    abort = new AbortController();
    try { analysis = compactResult(await fn()); retained = null; return analysis; }
    catch (error) { retained = error.details?.retainedAnalysis ?? retained; if (error.imagesCleared) { source = null; models = false; retained = null; analysis = null; } throw error; }
    finally { abort = null; }
  }
  async function pixels(display, rect) {
    const request = {surfaceId: display.id, revision: display.revision, rect};
    if (display.format === 'rgb8') return (await engine.readPixels(request)).pixels;
    const answer = await engine.readPlane(request), plane = answer.plane ?? answer.pixels, values = plane.data;
    const data = display.overlay && source ? (await engine.readPixels({surfaceId: source.surface.id, revision: source.surface.revision, rect})).pixels.data : new Uint8Array(rect.width * rect.height * 3);
    for (let i = 0; i < values.length; i++) {
      const color = display.layer === 'corroboration' ? COUNT_COLORS[Math.max(0, Math.min(COUNT_COLORS.length - 1, values[i]))] : [Math.max(0, Math.min(255, Math.round(values[i] * 255))), 0, 0];
      if (!display.overlay || values[i] > 0) for (let c = 0; c < 3; c++) data[i * 3 + c] = display.overlay ? Math.round(data[i * 3 + c] * (1 - display.opacity) + color[c] * display.opacity) : color[c];
    }
    return {width: rect.width, height: rect.height, format: 'rgb8', data};
  }
  return {
    deployment,
    get result() { return analysis; }, get checkpoint() { return checkpoint(); }, get source() { return source; },
    capabilities: () => engine.capabilities(),
    reserveExport:async bytes=>{const lease=await enqueue(()=>engine.reserveExternalMemory({bytes}));return()=>engine.releaseExternalMemory(lease.id);},
    pause() { abort?.abort(); return queue; },
    load(input) { return enqueue(() => execute(async () => { await releaseRendering(); await releaseAnalysis(); source = await engine.loadBlob({...input, layout: 'segmented'}, hooks()); return null; })).then(() => source); },
    run(task) { return enqueue(() => execute(async () => { await releaseRendering(); await configure(); await releaseAnalysis(); return engine.run(task, hooks()); })); },
    resume() { return enqueue(() => execute(async () => { const point = checkpoint(); if (!point) throw new Error('No retained analysis to resume.'); return engine.resumeAutomatic({analysisId: point.analysisId}, hooks()); })); },
    update(view = [], filters) { return enqueue(() => execute(async () => { if (!analysis) throw new Error('No analysis result.'); await releaseRendering(); return engine.updateAutomatic({analysisId: analysis.analysisId, view, ...(filters ? {filters} : {})}, hooks()); })); },
    display(layer = 'corroboration', {overlay = false, opacity = .7} = {}) { return enqueue(async () => { if (rendered && renderingLayer === layer) return {...rendered, layer, overlay, opacity}; await releaseRendering(); const answer = await engine.renderAutomatic({analysisId: analysis.analysisId, layer}, {onProgress}); rendered = answer.surface; renderingLayer = layer; return {...rendered, layer, overlay, opacity}; }); },
    readWindow(display, rect) { return enqueue(() => pixels(display, rect)); },
    readTile(display,tile){return enqueue(async()=>{
      const render=display.format==='rgb8'?undefined:{range:[0,1],...(display.layer==='corroboration'?{palette:COUNT_COLORS}:{red:true}),...(display.overlay&&source?{overlaySurfaceId:source.surface.id,opacity:display.opacity}: {})};
      return (await engine.readDisplay({surfaceId:display.id,revision:display.revision,tile,render})).pixels;
    });},
    exportTo(sink) { return enqueue(async () => {
      abort = new AbortController();
      let archive;
      try {
        const id = analysis?.analysisId ?? retained?.analysisId; if (!id) throw new Error('No retained analysis.');
        archive = await engine.exportAutomatic({analysisId: id, storage: 'temporary'}, hooks());
        for (let offset = 0; offset < archive.byteLength; offset += 1024 * 1024) {
          if (abort.signal.aborted) throw cancelled();
          const {bytes} = await engine.readExport({exportId: archive.id, revision: archive.revision, offset, length: Math.min(1024 * 1024, archive.byteLength - offset)}, hooks());
          await sink.write(bytes); onProgress({phase: 'export-download', completed: offset + bytes.length, total: archive.byteLength});
        }
        return analysis;
      } finally { try { if (archive) await engine.releaseExport(archive.id); } finally { abort = null; } }
    }); },
    dispose() { if (disposePromise) return disposePromise; disposed = true; abort?.abort(); disposePromise = queue.then(async () => { await engine.dispose(); source = analysis = retained = rendered = null; }); return disposePromise; }
  };
}
