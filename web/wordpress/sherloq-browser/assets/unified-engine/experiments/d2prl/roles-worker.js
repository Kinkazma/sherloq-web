import {loadRoleModel} from './role-model.js';
// Single useful inference per worker: no internal pool, probes or warm-up.
self.onmessage = async ({data}) => {
  let session,outputs,model; const feeds = {};
  try {
    const ort = await import(data.ortUrl); ort.env.wasm.numThreads = 1; ort.env.wasm.wasmPaths = data.wasmPath;
    model=await loadRoleModel({modelUrl:data.modelUrl,modelBytes:data.modelBytes,modelSha256:data.modelSha256});
    session=await ort.InferenceSession.create(model.data,{executionProviders:['wasm'],graphOptimizationLevel:'disabled',enableCpuMemArena:false,enableMemPattern:false});
    for (const [name, values] of Object.entries(data.inputs)) {
      for (const value of values) if (!Number.isFinite(value)) throw Error('Nonfinite role input');
      feeds[name] = new ort.Tensor('float32', values, [1, name === 'rgb' ? 3 : 1, 448, 448]);
    }
    self.postMessage({phase: 'inference'}); outputs = await session.run(feeds);
    const target = outputs.target.data.slice(), source = outputs.source.data.slice();
    if (target.length !== 448 ** 2 || source.length !== 448 ** 2) throw Error('Role output shape');
    self.postMessage({ok: true, target, source, ort: ort.env.versions}, [target.buffer, source.buffer]);
  } catch (error) { self.postMessage({ok: false, error: String(error?.message ?? error)}); }
  finally { for (const t of Object.values(feeds)) t.dispose(); for (const t of Object.values(outputs ?? {})) t.dispose(); try{await session?.release();}finally{model?.release();} }
};
