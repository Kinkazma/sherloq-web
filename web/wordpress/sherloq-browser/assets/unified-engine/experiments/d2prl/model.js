import {selectStrictRoleRuntime} from './role-runtime.js';
import {createPagedDescriptorSessions} from './paged-descriptor-sessions.js';
import{declareResidentRandomFactory}from'./resident-random-factory.js';
import {createPairedPatchMatch as createIterationPatchMatch} from './paired-patchmatch.js';
import {createResidentEvaluator} from './resident-evaluator.js';
import {preserveConvolutionPrimary} from './convolution-retirement.js';
import {createGpuRetirementRegistry} from './gpu-retirement.js';
import {noisesnifferOwnerRetirement as createD2prlRetirement} from '../../src/noisesniffer-owner-retirement.js';
import {createCandidateGpu} from './candidates-gpu.js';
import {createNativeMpsRandomGpu} from './random-mps-gpu.js';
import {NativeMpsRandom,MPS_RANDOM_ALGORITHM} from './random-mps.js';
import {d2prlSpatialConfig} from './input-side.js';
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
import {createDlfGpu} from './dlf-gpu.js';
import {createDescriptors} from './descriptors.js';
import {createPatchMatch} from './patchmatch.js';
import {createEvaluatorPool} from './evaluator-pool.js';
import {createD2prlGpuEvaluator} from './evaluator-gpu.js';
import {createStrictFragmentGpuEvaluator} from './strict-fragment-evaluator-gpu.js';
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
async function createModel({budget, model, assetBaseUrl, runtime, backend, maxWorkers,inputSide=448,arithmetic=runtime?.featureArithmetic??'cpu'}) {
  requireValue(model?.schema === 1 && model.side === 448 && model.iterations === 40 && model.seed === 22 && model.referenceThreads === 8 && model.checkpointSha256 === '2749c7436169ce689deaeb197ce5dae3d1a4533999833928168ec0b0d703df36', 'Pinned native D2PRL model');
  const spatial=d2prlSpatialConfig(inputSide),side=spatial.inputSide;requireValue(['cpu','mps'].includes(arithmetic),'Explicit D2PRL arithmetic required');requireValue(runtime?.featureArithmetic===undefined||runtime.featureArithmetic===arithmetic,'D2PRL feature runtime and model arithmetic differ');
  requireValue(['cpu', 'gpu'].includes(backend) && Number.isInteger(maxWorkers) && maxWorkers >= 1 && maxWorkers <= 64, 'Explicit backend and useful worker ceiling');
  if(side!==448&&backend!=='gpu')throw new EngineError('UNSUPPORTED_BACKEND','Experimental D2PRL grids above448 require WebGPU.');
  const evaluatorUrl=runtime.evaluatorUrl,evaluatorDescriptorLayout=runtime.evaluatorDescriptorLayout??'CHW-uint16';
  requireValue(['CHW-uint16','HWC-uint16'].includes(evaluatorDescriptorLayout),'Native evaluator descriptor layout');
  const disposables = [], own = value => (disposables.push(value), value); let busy = false, disposed = false, disposing, modelRetirement, recovery;
  // GPU evaluators can be closed by a synchronous checkpoint cleanup. Track
  // their asynchronous queue retirement until its actual memory is released.
  const gpuRetirements=createGpuRetirementRegistry(),ownGpu=promise=>gpuRetirements.own(promise),closeGpu=()=>gpuRetirements.close();
  const gpuFactories=backend==='gpu'?{normal:options=>side===448&&arithmetic==='mps'&&options.side===448&&options.scientificMask===null?gpuRetirements.create(onRetirementOwner=>createResidentEvaluator({...options,arithmetic,onRetirementOwner,ownPlan:factory=>gpuRetirements.create(factory)})):ownGpu(createD2prlGpuEvaluator({...options,arithmetic})),strict:options=>ownGpu(createStrictFragmentGpuEvaluator({...options,arithmetic}))}:undefined;
  const arena=own(createWasmTensorArena({budget,maximumTensorBytes:side===1792?2**32:2**31}));
  const operation=(label,work,options)=>recovery?recovery(label,work,options):work();
  const candidateFactory=backend==='gpu'?options=>gpuRetirements.create(onRetirementOwner=>createCandidateGpu({...options,operation,onRetirementOwner})):undefined;
  const randomFactory=arithmetic==='mps'?async()=>{if(backend!=='gpu')return new NativeMpsRandom({seed:model.seed});const fill=await ownGpu(createNativeMpsRandomGpu({budget,operation}));try{return new NativeMpsRandom({seed:model.seed,fill});}catch(error){await fill.dispose();throw error;}}:undefined;
  if(gpuFactories&&side===448&&arithmetic==='mps')declareResidentRandomFactory(randomFactory,()=>new NativeMpsRandom({seed:model.seed}));
  if(gpuFactories&&side===448&&arithmetic==='mps')gpuFactories.iteration=Object.assign(options=>gpuRetirements.create(onRetirementOwner=>createIterationPatchMatch(null,{...options,budget,arithmetic,operation,initialSourceMode:'recipe',randomFactory,candidateFactory,onRetirementOwner,retireOutput:owner=>gpuRetirements.retire(owner),evaluatorFactory:async(_,owned)=>gpuFactories.normal({...options,...owned})})),{progressMode:'iteration-pair-atomic',adoptWrapper:owner=>gpuRetirements.own(owner)});
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
    const convolution = guarded(backend === 'cpu' ? createConvolutionCpu({budget,arena, moduleUrl: runtime.convolutionCpuUrl, maxWorkers,operation}) : await createConvolutionGeneralGpu({budget,arena,operation,inputSide:side,arithmetic,retirementPolicy:'ack'}),'convolution');
    const preparation = guarded(await createPreparation(runtime.preparationFactory, {budget,arena,operation,inputSide:side}),'preparation',['run','runRows'],1), featureMath = guarded(await createFeatureMath(runtime.featureMathFactory, {budget,arena,operation,inputSide:side,arithmetic}),'feature-math',undefined,2), math = guarded(await createNeuralMath(runtime.neuralMathFactory, {budget,arena,operation,inputSide:side,arithmetic}),'neural-math',undefined,3), dlf = guarded(backend==='gpu'?await ownGpu(createDlfGpu({budget,operation,inputSide:side})):await createDlf(runtime.dlfFactory, {budget,arena,operation,inputSide:side}),'dlf',undefined,1);
    const roles = guarded(createBoundedRoles({budget, model: model.roles, modelUrl: new URL(model.roles.modelFile, assetBaseUrl).href, ortUrl: runtime.ortUrl, wasmPath: runtime.ortWasmPath, runtime: runtime.rolesRuntime, runtimeFactoryUrl: runtime.rolesFactoryUrl,inputSide:side}),'roles');
    const descriptorOptions={arena,inputSide:side,convolution,math:featureMath,budget,operation,
      loadConvolution: async (name, {signal}) => {
        const row = model.features.find(r => r.name === name); requireValue(row, 'Feature layer'); const parameters = await featureParameters([row.weights, row.bias], signal); const baseSide=Number(name.split('-')[0]),scaleIndex=[597,448,298].indexOf(baseSide),delta=scaleIndex>=0?spatial.featureSides[scaleIndex]-baseSide:0;
        return {weights: parameters.values[0], bias: parameters.values[1], release: parameters.release, channels: row.inputShape[1], height: row.inputShape[2]+delta, width: row.inputShape[3]+delta, outChannels: row.weights.shape[0], kernel: row.weights.shape[2], padding: row.padding, referenceLayout: model.layouts.features.records.find(r => r.name === name)};
      },
      loadBatchNorm: async (name, {signal}) => {const row = model.batchnorm.find(r => r.name === name); requireValue(row, 'Feature BN'); const parameters = await featureParameters([row.params], signal); return {params: parameters.values[0], epsilon: row.epsilon, release: parameters.release};}
    };
    const descriptors=own(createDescriptors(descriptorOptions));
    const unionOptions={arena,operation,inputSide:side,ownedParameters:true,dlf,convolution,featureMath,neuralMath:math,budget,layers:model.union,batchnorm:model.unionBatchnorm,dlfWeights:model.dlfWeights,layouts:model.layouts.union,loadParameter:(_kind,spec,options)=>read(spec,options)};
    // One source manager is adopted regardless of the current policy limit.
    // Its source context stays lazy; each run chooses useful transport from
    // the live limit, including a high-budget model later used under pressure.
    const pagedDescriptors=backend==='gpu'&&side!==448?createPagedDescriptorSessions({budget,featureMath,descriptorOptions,onOwner:own,...([1344,1792].includes(side)?{unionOptions}:{})}):null;
    const unionHead=createUnionHead(unionOptions);
    const unet = createUnetGraph({arena,operation,inputSide:side,ownedParameters:true,graph: model.graph, convolution, math, budget, layouts: model.layouts.unet, pointLayouts: model.layouts.point, tailProbe: true, tailMode: 'block1024', loadParameter: (_name, spec, options) => read(spec, options)});
    const heads = own(createHeads({operation,inputSide:side,unionHead, unet, math, roles, budget}));
    let checkpoint,strictCheckpointKey,strictCheckpointActive=false;
    const cleanup=(steps)=>{let failed=false,error;for(const step of steps)try{step();}catch(cause){if(!failed){failed=true;error=cause;}}return{failed,error};};
    const clearCheckpoint=()=>{if(!checkpoint)return;const old=checkpoint;checkpoint=null;const error=cleanup([()=>heads.releaseCheckpoint(old.key),()=>descriptors.releaseCheckpoint(old.key),()=>old.result?.release(),()=>old.pm?.release(),()=>old.pmEngine?.dispose(),()=>old.features?.release(),()=>old.prepared?.release(),()=>old.scopeOwnership?.(),()=>parameters.clearIncomplete()]);if(error.failed)throw error.error;};
    const clearStrictCheckpoint=()=>{if(!strictCheckpointActive)return;strictCheckpointActive=false;strictCheckpointKey=undefined;const error=cleanup([()=>descriptors.releaseCheckpoint?.(),()=>unionHead.releaseCheckpoint?.(),()=>unet.releaseCheckpoint?.(),()=>{if(pagedDescriptors)gpuRetirements.retire({dispose:()=>pagedDescriptors.releaseAll()});}]);if(error.failed)throw error.error;};
    return {
      modelId: model.modelId, backend,
      async run({rgb, readRows, width, height, backend: requestedBackend = backend,scientificMask}, {signal,onProgress,checkpointKey,verifiedInputIdentity} = {}) {
        if (busy) throw new EngineError('BUSY', 'D2PRL model busy');
        if(signal?.aborted){requireValue(!disposed && requestedBackend === backend, 'Explicit initialized model backend');busy=true;let failure;try{try{checkAbort(signal);}catch(error){failure=error;}const cleanupError=cleanup([clearStrictCheckpoint,clearCheckpoint]);if(cleanupError.failed)failure??=cleanupError.error;try{await closeGpu();}catch(error){failure??=error;}throw failure;}finally{busy=false;}}
        clearStrictCheckpoint(); requireValue(!disposed && requestedBackend === backend, 'Explicit initialized model backend');
        // Analysis supplies its already verified pixel-SHA/zone/model identity.
        // Internal direct callers must keep their borrowed input immutable and
        // reuse the same object; no second image hash or capacity probe occurs.
        requireValue(verifiedInputIdentity===undefined||typeof verifiedInputIdentity==='string','Verified input identity');
        if(checkpoint&&(checkpoint.key!==checkpointKey||checkpoint.width!==width||checkpoint.height!==height||checkpoint.verifiedInputIdentity!==verifiedInputIdentity||checkpoint.scientificMask?.identity!==scientificMask?.identity||(verifiedInputIdentity===undefined&&(checkpoint.rgb?.deref()!==rgb||checkpoint.readRows?.deref()!==readRows))))clearCheckpoint();
        const state=checkpoint??{key:checkpointKey,width,height,verifiedInputIdentity,scientificMask,phaseTimes:{},...(verifiedInputIdentity===undefined?{rgb:rgb?new WeakRef(rgb):undefined,readRows:readRows?new WeakRef(readRows):undefined}:{})};checkpoint=state;if(scientificMask?.values&&!state.scopeOwnership)state.scopeOwnership=budget.reserve(scientificMask.values.byteLength);scientificMask=state.scientificMask;busy=true;let rawRelease,complete=false,retain=false,failure,hasFailure=false;
        const phase=async(name,work)=>{const started=performance.now();try{return await work();}finally{state.phaseTimes[name]=(state.phaseTimes[name]??0)+performance.now()-started;}};
        recovery=createD2prlRecovery({budget,signal,onRecovery:event=>onProgress?.({phase:'resource-recovery',...event}),onReclaim:event=>onProgress?.(event),onWait:event=>onProgress?.(event)});
        const progress = event => {checkAbort(signal); onProgress?.(event); checkAbort(signal);};
        try {
          if(!state.prepared){progress({phase:'preparation',completed:0,total:1});state.prepared=await phase('preparation',()=>readRows?preparation.runRows({readRows,width,height},{signal,onProgress:progress}):preparation.run({rgb,width,height},{signal}));progress({phase:'preparation',completed:1,total:1});}
          state.descriptorStage??=0;if(!state.features&&!state.pm)state.features=await phase('descriptors',()=>descriptors.run(state.prepared.data,{signal,checkpointKey,onStage:name=>progress({phase:'descriptors',message:name,completed:++state.descriptorStage,total:45})}));convolution.releaseIdleWorkers?.();
          if(!state.pm)await phase('patchmatch',async()=>{state.pmEngine??=await(gpuFactories?.iteration&&!scientificMask?.values?gpuFactories.iteration({budget,operation,side,scientificMask:null,progressMode:gpuFactories?.iteration?.progressMode??'iteration-atomic'}):ownGpu(createPatchMatch(null, {budget, operation,...(randomFactory?{randomFactory}:{}),...(candidateFactory?{candidateFactory}:{}), evaluatorFactory: async (_, {budget}) => state.pmEvaluator=await(gpuFactories?gpuFactories.normal({budget,operation,arithmetic,side,scientificMask:scientificMask?.values??null}):createEvaluatorPool(evaluatorUrl, {budget, maxWorkers,operation,descriptorLayout:evaluatorDescriptorLayout}))})));
          state.pm=await state.pmEngine.run({zmFeatures:state.features.zm,cnnFeatures:state.features.cnn, side, iterations: 40, randomState: model.randomState, referenceThreads: 8,...(scientificMask?.values?{scientificMask:scientificMask.values}:{})}, {signal,checkpointKey,progressMode:gpuFactories?.iteration?.progressMode??'iteration-atomic',onProgress:event=>progress({...event,phase:'patchmatch'})});state.pmStats=structuredClone(state.pmEvaluator?.stats??state.pmEngine.stats);await state.pmEngine.dispose();state.features.release();state.features=null;state.pmEngine=null;state.pmEvaluator=null;});
          state.result??=await phase('heads',()=>heads.run({rgb:state.prepared.data,patchmatch:state.pm},{signal,checkpointKey,onRoleProgress:progress,onStage: name => progress({phase: 'heads', message: name}), onUnetNode: ({index, total}) => progress({phase: 'unet', completed: index + 1, total})}));
          const result=state.result;const raw = await phase('raw-output',()=>operation('raw-output',()=>{const release=budget.reserve(3*side**2*4);try{const raw=new Float32Array(3*side**2);raw.set(result.union);raw.set(result.target,side**2);raw.set(result.source,2*side**2);rawRelease=release;return raw;}catch(error){release();throw error;}})); checkAbort(signal); complete = true;
          return {raw, decision: {...result.decision}, execution: {inputSide:side,spatialConfiguration:spatial,arithmetic,random:{algorithm:arithmetic==='mps'?MPS_RANDOM_ALGORITHM:'pytorch-cpu-mt19937',seed:model.seed,backend:arithmetic==='mps'&&backend==='gpu'?'webgpu-philox':'scalar-cpu'},...(scientificMask?{scientificScope:{schema:'sherloq.neural-scientific-scope/1',identity:scientificMask.identity,admittedCentres:scientificMask.admitted,totalCentres:scientificMask.total,stage:'source-and-target-before-native-patchmatch',cnnContext:'Original RGB and native CNN context retained; excluded content can affect surrounding descriptors.'}}:{}),convolution: backend === 'gpu' ? 'webgpu' : 'wasm-simd-workers', patchmatch: backend==='gpu'?'webgpu':'wasm-workers', patchmatchPool:state.pmStats,candidateTransport:state.pm.candidateTransport, evaluator:backend==='gpu'?{backend:'webgpu',descriptorLayout:'CHW-uint16',kernel:'evaluator-gpu-kernel.js',arithmeticQualification:'experimental-requires-exact-oracle-qualification'}:{url:evaluatorUrl,descriptorLayout:evaluatorDescriptorLayout}, phaseTimes:{...state.phaseTimes},timingSemantics:'Phase elapsed wall milliseconds include waits, retries and phase callbacks; failed attempts accumulate across checkpoint resumes. Pool service times overlap and are not additive CPU time.',dlf: backend==='gpu'?'webgpu':'wasm',roles: 'onnxruntime-wasm', workerCeiling: maxWorkers, referenceThreads: 8, roleRuntime: result.roleRuntime, allocationRecovery: recovery.snapshot(), tensorArena:arena.snapshot(),parameterStore:parameters.snapshot()}, modelId: model.modelId, backend, release: rawRelease};
        }catch(error){hasFailure=true;failure=error;retain=retainD2prlCheckpoint(error,signal,checkpointKey);throw error;}finally{const retired=cleanup([()=>{if(!retain)clearCheckpoint();},()=>convolution.releaseIdleWorkers?.()]);let hasCleanup=retired.failed,cleanupError=retired.error;try{await closeGpu();}catch(cause){if(!hasCleanup){hasCleanup=true;cleanupError=cause;}}if(!complete||hasCleanup){const released=cleanup([()=>rawRelease?.()]);if(released.failed&&!hasCleanup){hasCleanup=true;cleanupError=released.error;}}recovery=null;busy=false;if(hasCleanup){if(hasFailure)preserveConvolutionPrimary(failure,cleanupError);else throw cleanupError;}}
      },
      async runStrict({plan,bank,candidateDomain},{signal,onProgress,checkpointKey}={}){
        requireValue(!busy&&!disposed,'D2PRL model busy or disposed');requireValue((plan.modelSide??448)===side,'Strict plan and model input sizes differ');checkAbort(signal);clearCheckpoint();busy=true;strictCheckpointKey=checkpointKey;strictCheckpointActive=true;let strictRoles,hasPrimary=false,primary;
        recovery=createD2prlRecovery({budget,signal,onRecovery:event=>onProgress?.({phase:'resource-recovery',...event}),onReclaim:onProgress,onWait:onProgress});
        try{const [{runStrictFragmentModel},{createStrictRoleStages}]=await Promise.all([import('./strict-fragment-model.js'),import('./strict-role-stages.js')]);checkAbort(signal);const usePaged=!!pagedDescriptors&&(side===896?budget.limit<8*1024**3:[1344,1792].includes(side)&&budget.limit<=2*1024**3);if(usePaged)await closeGpu();const activeDescriptors=usePaged?await pagedDescriptors.forBank(bank):descriptors;checkAbort(signal);let activeUnionHead=unionHead;if(pagedDescriptors&&[1344,1792].includes(side)&&budget.limit<=2*1024**3){if(!usePaged)await closeGpu();activeUnionHead=await pagedDescriptors.forUnionBank(bank);checkAbort(signal);}const strictRoleRuntime=selectStrictRoleRuntime(runtime,side,budget.limit);strictRoles=createStrictRoleStages({budget,model:model.roles,modelUrl:new URL(model.roles.modelFile,assetBaseUrl).href,ortUrl:runtime.ortUrl,wasmPath:runtime.ortWasmPath,runtime:strictRoleRuntime.rolesRuntime,runtimeFactoryUrl:strictRoleRuntime.rolesFactoryUrl,inputSide:side});
          return await runStrictFragmentModel({plan,bank,candidateDomain,preparation,descriptors:activeDescriptors,unionHead:activeUnionHead,unet,math,roles:strictRoles,convolution,randomState:model.randomState,evaluatorUrl:new URL('../../vendor/d2prl-strict-fragment/evaluator.js',import.meta.url).href,nativeEvaluatorUrl:evaluatorUrl,nativeDescriptorLayout:evaluatorDescriptorLayout,operation,maxWorkers,gpuFactories,arithmetic,randomFactory,candidateFactory},{budget,signal,onProgress,checkpointKey});
        }catch(error){hasPrimary=true;primary=error;throw error;}finally{let failed=false,cleanupError;for(const close of[()=>strictRoles?.dispose(),()=>pagedDescriptors&&(!hasPrimary||!retainD2prlCheckpoint(primary,signal,checkpointKey))?pagedDescriptors.release(bank):undefined,closeGpu])try{await close();}catch(error){if(!failed){failed=true;cleanupError=error;}}recovery=null;busy=false;if(failed){if(hasPrimary)preserveConvolutionPrimary(primary,cleanupError);else throw cleanupError;}}
      },
      releaseCheckpoint(key){requireValue(!busy,'D2PRL model busy');if(key===undefined||checkpoint?.key===key)clearCheckpoint();if(strictCheckpointActive&&(key===undefined||strictCheckpointKey===key))clearStrictCheckpoint();if(pagedDescriptors&&(pagedDescriptors.snapshot().sources||gpuRetirements.pending))return closeGpu();},
      checkpointSnapshot(){return checkpoint?{key:checkpoint.key,phaseTimes:{...checkpoint.phaseTimes},prepared:!!checkpoint.prepared,descriptors:!!checkpoint.features,descriptorProgress:descriptors.checkpointSnapshot(),patchmatchProgress:checkpoint.pmEngine?.checkpointSnapshot(),patchmatch:!!checkpoint.pm,heads:heads.snapshot()}:null;},
      dispose() {requireValue(!busy, 'D2PRL model busy');disposed=true;modelRetirement??=createD2prlRetirement([clearCheckpoint,clearStrictCheckpoint,...[...disposables].reverse().map(value=>()=>typeof value.disposeAsync==='function'?value.disposeAsync():value.dispose()),closeGpu]);return disposing=modelRetirement();}
    };
  } catch (error) {await Promise.allSettled(disposables.reverse().map(value=>Promise.resolve().then(()=>typeof value.disposeAsync==='function'?value.disposeAsync():value.dispose())));throw error;}
}
