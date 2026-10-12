import {retainD2prlCheckpoint} from './checkpoint.js';
import {createParameterStore} from './parameter-store.js';
import {createWasmTensorArena} from '../../src/wasm-tensor-arena.js';
// Actual fixed D2PRL pipeline. No reference tensor or comparator is accepted.
import {requireValue, checkAbort, EngineError} from '../../src/errors.js';
import {createConvolutionCpu} from './convolution-cpu.js';
import {createConvolutionGeneralGpu} from './convolution-general-gpu.js';
import {createPreparation} from './prepare.js';
import {createFeatureMath} from './feature-math.js';
import {createNeuralMath} from './neural-math.js';
import {createDlf} from './dlf.js';
import {createDescriptors} from './descriptors.js';
import {createPatchMatch} from './patchmatch.js';
import {createEvaluatorPool} from './evaluator-pool.js';
import {createUnionHead} from './union-head.js';
import {createUnetGraph} from './unet-graph.js';
import {createHeads} from './heads.js';
import {createBoundedRoles} from './roles-bounded.js';
import {createD2prlRecovery,recoverableStage} from './recovery.js';
import {withD2prlActivity} from './resource-activity.js';

export async function readVerifiedModelAsset(url, spec, {signal,operation=(_label,work)=>work()} = {}) {
  requireValue(Number.isSafeInteger(spec.bytes) && spec.bytes > 0 && spec.bytes <= 256 * 1024 ** 2 && /^[0-9a-f]{64}$/.test(spec.sha256), 'Pinned model asset identity');
  try {
  checkAbort(signal); const bytes=await operation('asset:buffer',()=>new Uint8Array(spec.bytes),{bytes:spec.bytes});
  const response = await fetch(url, {signal});
  if (!response.ok || !response.body) throw new EngineError('MODEL_UNAVAILABLE', 'Model asset unavailable');
  const reader = response.body.getReader(); let at = 0;
  try {
    while (true) {const {done, value} = await reader.read(); checkAbort(signal); if (done) break; if (at + value.length > bytes.length) throw new EngineError('MODEL_IDENTITY', 'Model asset exceeds pinned size'); bytes.set(value, at); at += value.length;}
  } finally {await reader.cancel().catch(() => {}); reader.releaseLock();}
  const digestBytes=await operation('asset:digest',()=>crypto.subtle.digest('SHA-256',bytes),{bytes:spec.bytes});
  const digest = Array.from(new Uint8Array(digestBytes), b => b.toString(16).padStart(2, '0')).join(''); checkAbort(signal);
  if (at !== spec.bytes || digest !== spec.sha256) throw new EngineError('MODEL_IDENTITY', 'Model asset size or digest differs'); return bytes;
  } catch (error) {checkAbort(signal); throw error;}
}

export function createD2prlModel(options) {
  return withD2prlActivity(options.budget,'d2prl:model-initialization','io',()=>createModel(options));
}
async function createModel({budget, model, assetBaseUrl, runtime, backend, maxWorkers}) {
  requireValue(model?.schema === 1 && model.side === 448 && model.iterations === 40 && model.seed === 22 && model.referenceThreads === 8 && model.checkpointSha256 === '2749c7436169ce689deaeb197ce5dae3d1a4533999833928168ec0b0d703df36', 'Pinned native D2PRL model');
  requireValue(['cpu', 'gpu'].includes(backend) && Number.isInteger(maxWorkers) && maxWorkers >= 1 && maxWorkers <= 64, 'Explicit backend and useful worker ceiling');
  const evaluatorUrl=runtime.evaluatorUrl,evaluatorDescriptorLayout=runtime.evaluatorDescriptorLayout??'CHW-uint16';
  requireValue(['CHW-uint16','HWC-uint16'].includes(evaluatorDescriptorLayout),'Native evaluator descriptor layout');
  const disposables = [], own = value => (disposables.push(value), value); let busy = false, disposed = false, disposing, recovery;
  const arena=own(createWasmTensorArena({budget}));
  const operation=(label,work,options)=>recovery?recovery(label,work,options):work();
  const guarded=(stage,label,methods,optionsIndex)=>recoverableStage(own(stage),label,operation,methods,optionsIndex);
  const parameters=own(createParameterStore({budget,assetBaseUrl,operation,spill:true}));
  const read = async (spec, {signal} = {}) => {
    requireValue(/^assets\/[0-9a-f]{64}\.bin$/.test(spec.file) && model.assets[spec.file]?.sha256 === spec.sha256 && model.assets[spec.file]?.bytes === spec.bytes, 'Manifest-listed parameter required');
    // Verify each lazy asset once while its owned bytes survive. Idle entries
    // remain evictable by the shared budget; reuse never bypasses model pins.
    return parameters.acquire(spec,{signal,retain:true});
  };
  const featureParameters = async (specs, signal) => {
    const owned=[];try{for(const spec of specs)owned.push(await read(spec,{signal}));return{values:owned.map(value=>value.data),release(){for(const value of owned)value.release();}};}catch(error){for(const value of owned)value.release();throw error;}
  };
  try {
    const convolution = guarded(backend === 'cpu' ? createConvolutionCpu({budget,arena, moduleUrl: runtime.convolutionCpuUrl, maxWorkers,operation}) : await createConvolutionGeneralGpu({budget,operation}),'convolution');
    const preparation = guarded(await createPreparation(runtime.preparationFactory, {budget,arena,operation}),'preparation',['run','runRows'],1), featureMath = guarded(await createFeatureMath(runtime.featureMathFactory, {budget,arena,operation}),'feature-math',undefined,2), math = guarded(await createNeuralMath(runtime.neuralMathFactory, {budget,arena,operation}),'neural-math',undefined,3), dlf = guarded(await createDlf(runtime.dlfFactory, {budget,arena,operation}),'dlf',undefined,1);
    const roles = guarded(createBoundedRoles({budget, model: model.roles, modelUrl: new URL(model.roles.modelFile, assetBaseUrl).href, ortUrl: runtime.ortUrl, wasmPath: runtime.ortWasmPath, runtime: runtime.rolesRuntime, runtimeFactoryUrl: runtime.rolesFactoryUrl}),'roles');
    const descriptors = own(createDescriptors({arena,convolution, math: featureMath, budget, operation,
      loadConvolution: async (name, {signal}) => {
        const row = model.features.find(r => r.name === name); requireValue(row, 'Feature layer'); const parameters = await featureParameters([row.weights, row.bias], signal);
        return {weights: parameters.values[0], bias: parameters.values[1], release: parameters.release, channels: row.inputShape[1], height: row.inputShape[2], width: row.inputShape[3], outChannels: row.weights.shape[0], kernel: row.weights.shape[2], padding: row.padding, referenceLayout: model.layouts.features.records.find(r => r.name === name)};
      },
      loadBatchNorm: async (name, {signal}) => {const row = model.batchnorm.find(r => r.name === name); requireValue(row, 'Feature BN'); const parameters = await featureParameters([row.params], signal); return {params: parameters.values[0], epsilon: row.epsilon, release: parameters.release};}
    }));
    const unionHead = createUnionHead({arena,operation,ownedParameters:true,dlf, convolution, featureMath, neuralMath: math, budget, layers: model.union, batchnorm: model.unionBatchnorm, dlfWeights: model.dlfWeights, layouts: model.layouts.union, loadParameter: (_kind, spec, options) => read(spec, options)});
    const unet = createUnetGraph({arena,operation,ownedParameters:true,graph: model.graph, convolution, math, budget, layouts: model.layouts.unet, pointLayouts: model.layouts.point, tailProbe: true, tailMode: 'block1024', loadParameter: (_name, spec, options) => read(spec, options)});
    const heads = own(createHeads({operation,unionHead, unet, math, roles, budget}));
    let checkpoint;
    const cleanup=(steps)=>{let error;for(const step of steps)try{step();}catch(cause){error??=cause;}return error;};
    const clearCheckpoint=()=>{if(!checkpoint)return;const old=checkpoint;checkpoint=null;const error=cleanup([()=>heads.releaseCheckpoint(old.key),()=>descriptors.releaseCheckpoint(old.key),()=>old.result?.release(),()=>old.pm?.release(),()=>old.pmEngine?.dispose(),()=>old.features?.release(),()=>old.prepared?.release(),()=>parameters.clearIncomplete()]);if(error)throw error;};
    return {
      modelId: model.modelId, backend,
      async run({rgb, readRows, width, height, backend: requestedBackend = backend}, {signal,onProgress,checkpointKey,verifiedInputIdentity} = {}) {
        if (busy) throw new EngineError('BUSY', 'D2PRL model busy'); requireValue(!disposed && requestedBackend === backend, 'Explicit initialized model backend'); if(signal?.aborted){clearCheckpoint();checkAbort(signal);}
        // Analysis supplies its already verified pixel-SHA/zone/model identity.
        // Internal direct callers must keep their borrowed input immutable and
        // reuse the same object; no second image hash or capacity probe occurs.
        requireValue(verifiedInputIdentity===undefined||typeof verifiedInputIdentity==='string','Verified input identity');
        if(checkpoint&&(checkpoint.key!==checkpointKey||checkpoint.width!==width||checkpoint.height!==height||checkpoint.verifiedInputIdentity!==verifiedInputIdentity||(verifiedInputIdentity===undefined&&(checkpoint.rgb?.deref()!==rgb||checkpoint.readRows?.deref()!==readRows))))clearCheckpoint();
        const state=checkpoint??{key:checkpointKey,width,height,verifiedInputIdentity,phaseTimes:{},...(verifiedInputIdentity===undefined?{rgb:rgb?new WeakRef(rgb):undefined,readRows:readRows?new WeakRef(readRows):undefined}:{})};checkpoint=state;busy=true;let rawRelease,complete=false,retain=false,failure;
        const phase=async(name,work)=>{const started=performance.now();try{return await work();}finally{state.phaseTimes[name]=(state.phaseTimes[name]??0)+performance.now()-started;}};
        recovery=createD2prlRecovery({budget,signal,onRecovery:event=>onProgress?.({phase:'resource-recovery',...event}),onReclaim:event=>onProgress?.(event),onWait:event=>onProgress?.(event)});
        const progress = event => {checkAbort(signal); onProgress?.(event); checkAbort(signal);};
        try {
          if(!state.prepared){progress({phase:'preparation',completed:0,total:1});state.prepared=await phase('preparation',()=>readRows?preparation.runRows({readRows,width,height},{signal,onProgress:progress}):preparation.run({rgb,width,height},{signal}));progress({phase:'preparation',completed:1,total:1});}
          state.descriptorStage??=0;if(!state.features&&!state.pm)state.features=await phase('descriptors',()=>descriptors.run(state.prepared.data,{signal,checkpointKey,onStage:name=>progress({phase:'descriptors',message:name,completed:++state.descriptorStage,total:45})}));convolution.releaseIdleWorkers?.();
          if(!state.pm)await phase('patchmatch',async()=>{state.pmEngine??=await createPatchMatch(null, {budget, operation, evaluatorFactory: async (_, {budget}) => state.pmEvaluator=await createEvaluatorPool(evaluatorUrl, {budget, maxWorkers,operation,descriptorLayout:evaluatorDescriptorLayout})});
          state.pm=await state.pmEngine.run({zmFeatures:state.features.zm,cnnFeatures:state.features.cnn, side: 448, iterations: 40, randomState: model.randomState, referenceThreads: 8}, {signal,checkpointKey,onProgress:event=>progress({...event,phase:'patchmatch'})});state.pmStats=structuredClone(state.pmEvaluator?.stats);state.features.release();state.features=null;state.pmEngine.dispose();state.pmEngine=null;state.pmEvaluator=null;});
          state.result??=await phase('heads',()=>heads.run({rgb:state.prepared.data,patchmatch:state.pm},{signal,checkpointKey,onRoleProgress:progress,onStage: name => progress({phase: 'heads', message: name}), onUnetNode: ({index, total}) => progress({phase: 'unet', completed: index + 1, total})}));
          const result=state.result;const raw = await phase('raw-output',()=>operation('raw-output',()=>{const release=budget.reserve(3*448**2*4);try{const raw=new Float32Array(3*448**2);raw.set(result.union);raw.set(result.target,448**2);raw.set(result.source,2*448**2);rawRelease=release;return raw;}catch(error){release();throw error;}})); checkAbort(signal); complete = true;
          return {raw, decision: {...result.decision}, execution: {convolution: backend === 'gpu' ? 'webgpu' : 'wasm-simd-workers', patchmatch: 'wasm-workers', patchmatchPool:state.pmStats, evaluator:{url:evaluatorUrl,descriptorLayout:evaluatorDescriptorLayout}, phaseTimes:{...state.phaseTimes},timingSemantics:'Phase elapsed wall milliseconds include waits, retries and phase callbacks; failed attempts accumulate across checkpoint resumes. Pool service times overlap and are not additive CPU time.',roles: 'onnxruntime-wasm', workerCeiling: maxWorkers, referenceThreads: 8, roleRuntime: result.roleRuntime, allocationRecovery: recovery.snapshot(), tensorArena:arena.snapshot(),parameterStore:parameters.snapshot()}, modelId: model.modelId, backend, release: rawRelease};
        }catch(error){failure=error;retain=retainD2prlCheckpoint(error,signal,checkpointKey);throw error;}finally{let error=cleanup([()=>{if(!retain)clearCheckpoint();},()=>convolution.releaseIdleWorkers?.()]);if(!complete||error){const released=cleanup([()=>rawRelease?.()]);error??=released;}recovery=null;busy=false;if(error&&!failure)throw error;}
      },
      releaseCheckpoint(key){requireValue(!busy,'D2PRL model busy');if(key===undefined||checkpoint?.key===key)clearCheckpoint();},
      checkpointSnapshot(){return checkpoint?{key:checkpoint.key,phaseTimes:{...checkpoint.phaseTimes},prepared:!!checkpoint.prepared,descriptors:!!checkpoint.features,descriptorProgress:descriptors.checkpointSnapshot(),patchmatchProgress:checkpoint.pmEngine?.checkpointSnapshot(),patchmatch:!!checkpoint.pm,heads:heads.snapshot()}:null;},
      dispose() {requireValue(!busy, 'D2PRL model busy'); if (disposed) return disposing; disposed = true;const pending=[];let error=cleanup([clearCheckpoint]);for(const value of disposables.reverse())try{const closed=value.dispose();if(closed?.then)pending.push(closed);}catch(cause){error??=cause;}if(pending.length)return disposing=Promise.allSettled(pending).then(results=>{error??=results.find(result=>result.status==='rejected')?.reason;if(error)throw error;});if(error)throw error;}
    };
  } catch (error) {await Promise.allSettled(disposables.reverse().map(value=>Promise.resolve().then(()=>value.dispose())));throw error;}
}
