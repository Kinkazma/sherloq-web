// Real current-engine API qualification. No model arithmetic or product code.
export async function d2prlLargeQualification(options) {
  const {variant, size, reference, backend, budgetBytes, computeProfile, apiBase, modelUrl, exportNpz} = options;
  const assert = (condition, message) => {if (!condition) throw Error(message);};
  const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', value)), byte => byte.toString(16).padStart(2, '0')).join('');
  const emit = value => console.log('D2LARGE ' + JSON.stringify({variant, size, ...value}));
  const {createWorkerEngine} = await import(apiBase + 'src/worker-client.js');
  const {D2PRL_MODEL_IDENTITY} = await import(apiBase + 'src/d2prl-model-identity.js');
  const runtime = await (await import(apiBase + 'src/d2prl-runtime.js')).d2prlRuntime();
  const expectedEvaluator = variant === 'candidate' ? 'table-simd4-exact-subnormal.js' : 'pixel-major-combined.js';
  const roleCap = (variant === 'candidate' ? 256 : 512) * 1024 ** 2;
  assert(runtime.evaluatorUrl.endsWith('/' + expectedEvaluator) && runtime.evaluatorDescriptorLayout === 'HWC-uint16', 'Actual runtime evaluator selection differs');
  assert(runtime.rolesRuntime.memoryMaximumBytes === roleCap, 'Actual runtime role ceiling differs');
  assert(runtime.rolesFactoryUrl.endsWith(variant === 'candidate' ? '/factory-roles256.mjs' : '/factory.mjs'), 'Actual role factory selection differs');
  if (variant === 'candidate') {
    const factory = await import(runtime.rolesFactoryUrl);
    assert(factory.runtimeId === 'ort130-wasm-256mib-d2prl' && factory.memoryMaximumBytes === roleCap, 'Loaded role factory metadata differs');
  }
  const engine = createWorkerEngine({memoryBudgetBytes: budgetBytes, computeProfile});
  const records = [], checks = {}, rawChecks = [], times = {}, capabilities = [];
  let first, second, exported, complete = false;
  const capture = async label => {const value = await engine.capabilities(); capabilities.push({label, value}); return value;};
  const rejected = async (work, code) => {try {await work();} catch (error) {assert(error.code === code, 'Expected ' + code + ', got ' + error.code); return true;} throw Error('Expected ' + code);};
  const releaseResult = async result => {
    const ids = new Set([result.surface?.id, ...Object.values(result.planeSurfaces ?? {}).map(value => value.id), ...Object.values(result.maskSurfaces ?? {}).map(value => value.id)].filter(Boolean));
    for (const id of ids) await engine.releaseSurface(id);
  };
  const read = async (result, key, rect) => {
    const numeric = ['map', 'target', 'source'].includes(key), surface = (numeric ? result.planeSurfaces : result.maskSurfaces)[key];
    return (await engine[numeric ? 'readPlane' : 'readMask']({surfaceId: surface.id, revision: surface.revision, rect}))[numeric ? 'plane' : 'mask'];
  };
  const checkExecutions = result => {
    const executions = result.data.metadata.zones.map(zone => ({id: zone.id, bounds: zone.bounds, decision: zone.decision, execution: zone.execution}));
    for (const {execution} of executions) {
      assert(execution.evaluator.url.endsWith('/' + expectedEvaluator) && execution.evaluator.descriptorLayout === 'HWC-uint16', 'Measured evaluator differs');
      assert(execution.referenceThreads === 8 && execution.patchmatch === 'wasm-workers', 'Native reference/thread contract differs');
      assert(execution.patchmatchPool.descriptorTransport === 'windowed' && execution.patchmatchPool.descriptorLayout === 'HWC-uint16', 'Measured descriptor transport differs');
      assert(execution.patchmatchPool.heapLimitBytes === 64 * 1024 ** 2, 'Measured native heap ceiling differs');
      assert(Number.isSafeInteger(execution.roleRuntime.heapCapacityBytes) && execution.roleRuntime.heapCapacityBytes > 0 && execution.roleRuntime.heapCapacityBytes <= roleCap, 'Measured role heap exceeds selected ceiling');
    }
    return executions;
  };
  const scanPlanes = async (result, expected, label) => {
    assert(result.layout === 'surface' && result.surface.width === reference.width && result.surface.height === reference.height, 'Full source-coordinate surface dimensions differ');
    assert(result.data.metadata.pixelSha256 === reference.pixelSha256, 'Decoded oriented RGB identity differs');
    const {createSHA256} = await import(apiBase + 'vendor/hash-wasm/hashes.js'), outputs = {};
    for (const key of ['map', 'mask', 'analyzed', 'candidates', 'target', 'source']) {
      const numeric = ['map', 'target', 'source'].includes(key), bpp = numeric ? 4 : 1, rows = Math.max(1, Math.floor(1024 ** 2 / (reference.width * bpp))), digest = await createSHA256();
      let nonzero = 0, finite = true, binary = true, at = performance.now();
      for (let y = 0; y < reference.height; y += rows) {
        const height = Math.min(rows, reference.height - y), view = (await read(result, key, {x: 0, y, width: reference.width, height})).data;
        assert(view.length === height * reference.width && (numeric ? view instanceof Float32Array : view instanceof Uint8Array), 'Owned bounded plane window differs');
        digest.update(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
        for (const value of view) {nonzero += value !== 0; finite &&= Number.isFinite(value); if (key !== 'map') binary &&= value === 0 || value === 1;}
        if (performance.now() - at >= 30000) {emit({phase: 'full-plane-check', label, key, completed: y + height, total: reference.height}); at = performance.now();}
      }
      const sha256 = digest.digest('hex');
      assert(finite && (key === 'map' || binary), 'Nonfinite/nonbinary scientific plane');
      if (expected) assert(sha256 === expected[key].sha256, 'Complete native plane hash differs: ' + label + '/' + key);
      outputs[key] = {sha256, dtype: numeric ? 'float32' : 'uint8', shape: [reference.height, reference.width], bytes: reference.width * reference.height * bpp, nonzero, finite, binary: key === 'map' ? null : binary, nativeHashChecked: Boolean(expected)};
      emit({phase: 'full-plane-checked', label, key, nonzero, sha256});
    }
    return outputs;
  };
  try {
    const initial = await capture('initialized');
    assert(initial.memory.budgetBytes === budgetBytes, 'Requested shared budget differs');
    emit({phase: 'source-fetch'});
    const blob = await (await fetch('/source.jpg')).blob();
    assert(blob.size === reference.original.bytes && await hash(await blob.arrayBuffer()) === reference.original.sha256, 'Original JPEG identity differs');
    let stamp = performance.now();
    const loaded = await engine.loadBlob({id: 'image', blob, layout: 'segmented'});
    times.loadMs = performance.now() - stamp;
    assert(loaded.width === reference.width && loaded.height === reference.height && loaded.provenance.layout === 'segmented-scanlines', 'Real segmented JPEG source dimensions/layout differ');
    await capture('source-loaded'); emit({phase: 'source-loaded', loadMs: times.loadMs, width: loaded.width, height: loaded.height});
    stamp = performance.now(); await engine.loadD2prlModel({...D2PRL_MODEL_IDENTITY, url: modelUrl}); times.modelManifestMs = performance.now() - stamp;
    const task = {id: 'detect', imageId: 'image', operation: 'ai.clones.d2prl', backend, params: {minimum: 500, exclusions: reference.exclusions}, regions: reference.zones};
    let progressAt = -Infinity;
    stamp = performance.now();
    first = await engine.run(task, {onProgress: event => {
      const now = performance.now();
      if (now - progressAt >= 30000 || ['inference', 'zone-complete', 'zone-projection', 'resource-recovery'].includes(event.phase)) {progressAt = now; emit({phase: 'analysis-progress', event});}
    }});
    times.analysisMs = performance.now() - stamp;
    assert(first.metrics.inferences === reference.zones.length && first.data.metadata.inferences === reference.zones.length && first.data.metadata.cache_hits === 0, 'The first analysis must recompute every requested zone');
    const executions = checkExecutions(first);
    await capture('analysis-completed'); emit({phase: 'analysis-completed', analysisMs: times.analysisMs, inferences: first.metrics.inferences});
    records.push({name: 'detect', rpcMs: times.analysisMs, inferences: first.metrics.inferences, executions, outputs: await scanPlanes(first, size === 96 ? reference.records[0].outputs : null, 'detect'), metrics: first.metrics});
    const raw = await engine.readD2prlRaw({imageId: 'image', resultId: first.data.metadata.resultId});
    assert(raw.data.rawGrids.length === reference.zones.length, 'All native raw zone grids required');
    for (let index = 0; index < raw.data.rawGrids.length; index++) {
      const grid = raw.data.rawGrids[index], values = grid.raw;
      assert(values instanceof Float32Array && values.length === 3 * 448 ** 2 && values.every(Number.isFinite), 'Finite native three-plane grid required');
      const planeSha256 = await Promise.all([0, 1, 2].map(plane => hash(new Uint8Array(values.buffer, values.byteOffset + plane * 448 ** 2 * 4, 448 ** 2 * 4))));
      const row = {zone: grid.id, bounds: grid.bounds, shape: [3, 448, 448], sha256: await hash(values), planeSha256, decision: executions[index].decision};
      if (size === 96) {
        const spec = reference.raw[index], native = new Float32Array(await (await fetch('/native-raw/' + index)).arrayBuffer());
        assert(native.length === values.length && native.byteLength === spec.bytes && await hash(native) === spec.sha256, 'Existing native raw identity differs');
        let maxAbs = 0, differentBits = 0, signDifferences = 0;
        const a = new Uint32Array(values.buffer, values.byteOffset, values.length), b = new Uint32Array(native.buffer, native.byteOffset, native.length);
        for (let i = 0; i < values.length; i++) {maxAbs = Math.max(maxAbs, Math.abs(values[i] - native[i])); differentBits += a[i] !== b[i]; signDifferences += (values[i] > 0) !== (native[i] > 0);}
        assert(Number.isFinite(maxAbs) && maxAbs <= 1e-4, 'Native Torch raw residual diagnostic exceeds existing tolerance');
        row.nativeDiagnostic = {maxAbs, differentBits, signDifferences, tolerance: 1e-4, meaning: 'Torch raw residual diagnostic; exact current-engine A/B is a separate check.'};
      }
      rawChecks.push(row);
    }
    checks.raw = true;
    const rect = {x: 3, y: 5, width: 11, height: 7}, borrowed = (await read(first, 'map', rect)).data, owned = borrowed.slice(); borrowed.fill(-99);
    checks.windowOwnership = (await read(first, 'map', rect)).data.every((value, i) => value === owned[i]);
    stamp = performance.now();
    second = await engine.run({id: 'cached-view', imageId: 'image', operation: 'ai.clones.d2prl', backend, params: {refilterOf: first.data.metadata.analysisId, minimum: 17}});
    times.cacheViewMs = performance.now() - stamp;
    assert(second.metrics.inferences === 0 && second.data.metadata.inferences === 0 && second.data.metadata.cache_hits === reference.zones.length, 'Cached refilter performed inference or lost raw grids');
    checks.priorOwnedResult = (await read(first, 'map', rect)).data.every((value, i) => value === owned[i]);
    records.push({name: 'refilter', rpcMs: times.cacheViewMs, inferences: second.metrics.inferences, executions: checkExecutions(second), outputs: await scanPlanes(second, size === 96 ? reference.records[1].outputs : null, 'refilter'), metrics: second.metrics});
    await capture('refilter-completed');
    let exportPages = 0;
    if (exportNpz) {
      stamp = performance.now(); exported = await engine.exportSurface({surfaceId: second.surface.id, revision: second.surface.revision, format: 'npz', storage: 'temporary'}); times.exportPreparationMs = performance.now() - stamp;
      assert(exported.metrics.storage === 'temporary', 'Paged owned export required');
      await capture('export-prepared');
    }
    await releaseResult(first); await releaseResult(second);
    checks.releasedSurface = await rejected(() => engine.readPlane({surfaceId: first.surface.id, revision: first.surface.revision, rect}), 'NOT_FOUND');
    await engine.unload('image'); await engine.unloadD2prlModel();
    if (exported) {
      const {createSHA256} = await import(apiBase + 'vendor/hash-wasm/hashes.js'), digest = await createSHA256(); let offset = 0, at = performance.now(); stamp = performance.now();
      while (offset < exported.byteLength) {
        const part = await engine.readExport({exportId: exported.id, revision: exported.revision, offset, length: Math.min(1024 ** 2, exported.byteLength - offset)});
        assert(part.nextOffset > offset && part.nextOffset <= exported.byteLength, 'Export page progression differs');
        digest.update(part.bytes);
        assert((await fetch('/archive/' + variant + '?offset=' + offset, {method: 'POST', body: part.bytes})).ok, 'Bounded export page persistence failed');
        offset = part.nextOffset; exportPages++;
        if (performance.now() - at >= 30000) {emit({phase: 'export-readback', completed: offset, total: exported.byteLength}); at = performance.now();}
      }
      times.exportReadbackMs = performance.now() - stamp;
      assert(digest.digest('hex') === exported.sha256, 'Full owned archive hash differs');
      checks.exportAfterSourceModelRelease = true;
      await engine.releaseExport(exported.id);
      checks.releasedExport = await rejected(() => engine.readExport({exportId: exported.id, revision: exported.revision, offset: 0, length: 1}), 'NOT_FOUND');
    }
    const final = await capture('fully-released');
    for (const key of ['activeReservationBytes', 'retainedBytes', 'cacheBytes', 'activeRecoveries']) if (final.memory[key] !== undefined) assert(final.memory[key] === 0, 'Final memory ownership remains: ' + key);
    assert(final.execution.active.cpu === 0 && final.execution.active.gpu === 0, 'Final compute leases remain');
    for (const key of ['running', 'queued']) if (final.execution[key] !== undefined) assert(final.execution[key] === 0, 'Final scheduler work remains');
    for (const [name, domain] of Object.entries(final.resources?.domains ?? {})) for (const key of ['backings', 'materializedBytes']) if (domain[key] !== undefined) assert(domain[key] === 0, 'Final resource backing remains: ' + name + '/' + key);
    for (const key of ['operations', 'pressures']) if (final.resources?.[key] !== undefined) assert(final.resources[key].length === 0, 'Final resource activity remains');
    assert(Object.values(checks).every(Boolean), 'Owned lifecycle check failed');
    const peakAccountedBytes = Math.max(...capabilities.map(row => row.value.memory.peakAccountedBytes), ...records.map(row => row.metrics.memory.peakAccountedBytes));
    assert(peakAccountedBytes <= budgetBytes, 'Accounted peak exceeds requested shared budget');
    complete = true;
    return {schema: 1, status: 'passed', variant, size, backend, computeProfile, dimensions: [reference.width, reference.height], sourceSha256: reference.original.sha256, pixelSha256: reference.pixelSha256, model: D2PRL_MODEL_IDENTITY, selection: {evaluator: expectedEvaluator, descriptorLayout: runtime.evaluatorDescriptorLayout, roles: runtime.rolesRuntime, rolesFactory: new URL(runtime.rolesFactoryUrl).pathname}, records, raw: rawChecks, checks, times, loadMetrics: loaded.metrics, exported: exported ? {byteLength: exported.byteLength, sha256: exported.sha256, metrics: exported.metrics} : null, exportPages, capabilities, finalCapabilities: final, memory: {budgetBytes, peakAccountedBytes}, scope: 'Current public worker API from complete segmented JPEG to native448 D2PRL and full source-coordinate six-plane results, retained cache view, owned export and release. Raw Torch residuals are diagnostic; all source-plane oracle hashes and current-engine A/B hashes are exact.'};
  } finally {emit({phase: 'engine-dispose', complete}); await engine.dispose();}
}
