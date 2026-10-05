// Single useful inference per worker: no internal pool, probes or warm-up.
self.onmessage = async ({data}) => {
  let session, outputs; const feeds = {};
  try {
    const runtime = await import(data.runtimeFactoryUrl);
    const ort = await import(data.ortUrl); ort.env.wasm.numThreads = 1; ort.env.wasm.wasmPaths = data.wasmPath;
    const response = await fetch(data.modelUrl); if (!response.ok) throw Error('Missing role model');
    const bytes = new Uint8Array(await response.arrayBuffer());
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('');
    if (bytes.byteLength !== data.modelBytes || hash !== data.modelSha256) throw Error('Role model identity');
    session = await ort.InferenceSession.create(bytes, {executionProviders: ['wasm'], graphOptimizationLevel: 'disabled', enableCpuMemArena: false, enableMemPattern: false});
    for (const [name, values] of Object.entries(data.inputs)) {
      for (const value of values) if (!Number.isFinite(value)) throw Error('Nonfinite role input');
      feeds[name] = new ort.Tensor('float32', values, [1, name === 'rgb' ? 3 : 1, 448, 448]);
    }
    self.postMessage({phase: 'inference'}); outputs = await session.run(feeds);
    const target = outputs.target.data.slice(), source = outputs.source.data.slice();
    if (target.length !== 448 ** 2 || source.length !== 448 ** 2) throw Error('Role output shape');
    self.postMessage({ok: true, target, source, ort: ort.env.versions, heapBytes: runtime.heapBytes()}, [target.buffer, source.buffer]);
  } catch (error) { self.postMessage({ok: false, error: String(error?.message ?? error)}); }
  finally { for (const t of Object.values(feeds)) t.dispose(); for (const t of Object.values(outputs ?? {})) t.dispose(); await session?.release(); }
};
