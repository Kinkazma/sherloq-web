// One bounded ORT CPU session per worker, initialized only by a requested job.
let session, ort, runtime;
self.onmessage = async ({data}) => {
  let input, outputs;
  try {
    const started = performance.now(); let modelLoadMs = 0;
    if (!session) {
      self.postMessage({phase: 'model-load'});
      const response = await fetch(data.modelUrl);
      if (!response.ok || !response.body) throw Error('Model response unavailable');
      const bytes = new Uint8Array(data.model.bytes), reader = response.body.getReader(); let at = 0;
      try {
        while (true) {const {value, done} = await reader.read(); if (done) break; if (at + value.byteLength > bytes.length) throw Error('Model exceeds pinned size'); bytes.set(value, at); at += value.byteLength;}
      } finally {await reader.cancel(); reader.releaseLock();}
      const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('');
      if (at !== data.model.bytes || sha !== data.model.sha256) throw Error('Model identity mismatch');
      runtime = await import(data.runtimeFactoryUrl); ort = await import(data.ortUrl);
      ort.env.wasm.numThreads = 1; ort.env.wasm.wasmPaths = data.wasmPaths;
      session = await ort.InferenceSession.create(bytes, {executionProviders: ['wasm'], graphOptimizationLevel: 'disabled', enableCpuMemArena: false, enableMemPattern: false});
    }
    if (performance.now() - started > 0) modelLoadMs = performance.now() - started;
    const featureInput = ['tnt','vig'].includes(data.model.family);
    input = new ort.Tensor('float32', data.input, featureInput ? [1, 640, 16, 16] : [1, 3, data.model.side, data.model.side]);
    self.postMessage({phase: 'inference'}); const inferStarted = performance.now(); outputs = await session.run({[featureInput ? 'features' : 'rgb']: input}); const inferenceMs = performance.now() - inferStarted, copyStarted = performance.now();
    const raw = outputs.probability.data.slice(), expected = (data.model.kind === 'softmax' ? 3 : 1) * data.model.side ** 2;
    if (raw.length !== expected || !raw.every(v => Number.isFinite(v) && v >= 0 && v <= 1)) throw Error('Invalid model probability output');
    self.postMessage({ok: true, raw, heapBytes: runtime.heapBytes(), ort: ort.env.versions, timings: {modelLoadMs, inferenceMs, outputCopyMs: performance.now() - copyStarted}}, [raw.buffer]);
  } catch (error) {self.postMessage({ok: false, error: String(error?.message ?? error)});}
  finally {input?.dispose(); for (const output of Object.values(outputs ?? {})) output.dispose();}
};
