import {d2prlInputSide} from './input-side.js';
import {loadRoleModel} from './role-model.js';
import {installWorkerMessageProtocol} from '../../src/worker-message-protocol.js';
import {serializeEngineError} from '../../src/errors.js';
import {validateRoleRuntime,validateRoleFactory,validateRoleHeap,validateRoleInputs} from './role-runtime.js';
// Single useful inference per worker: no internal pool, probes or warm-up.
installWorkerMessageProtocol(self,async data => {
  let session,outputs,model,runtime,bound,runtimeBytes=0;const feeds={};
  const SIDE=d2prlInputSide(data.inputSide);
  const reportHeap=()=>{const bytes=runtime?.heapBytes()??0;if(bytes){validateRoleHeap(bound,bytes);if(bytes!==runtimeBytes){self.postMessage({phase:'parameter-backing',backing:{id:Number.MAX_SAFE_INTEGER,action:runtimeBytes?'resize':'allocate',kind:'wasm',bytes,label:'ort-heap'}});runtimeBytes=bytes;}}};
  try {
    bound=validateRoleRuntime(data.roleRuntime??{runtimeId:'ort130-wasm-512mib',memoryMaximumBytes:512*1024**2},{modelBytes:data.modelBytes,modelSha256:data.modelSha256,inputs:data.modelInputs,outputs:data.modelOutputs});
    validateRoleInputs(bound,data.inputs,SIDE);
    runtime = await import(data.runtimeFactoryUrl);
    validateRoleFactory(bound,runtime);
    const ort = await import(data.ortUrl); ort.env.wasm.numThreads = 1; ort.env.wasm.wasmPaths = data.wasmPath;
    model=await loadRoleModel({modelUrl:data.modelUrl,modelBytes:data.modelBytes,modelSha256:data.modelSha256,onBacking:backing=>self.postMessage({phase:'parameter-backing',backing}),onRecovery:event=>self.postMessage({...event,phase:'resource-recovery'})});
    session=await ort.InferenceSession.create(model.data,{executionProviders:['wasm'],graphOptimizationLevel:'disabled',enableCpuMemArena:false,enableMemPattern:false});reportHeap();
    for (const [name, values] of Object.entries(data.inputs)) {
      for (const value of values) if (!Number.isFinite(value)) throw Error('Nonfinite role input');
      feeds[name] = new ort.Tensor('float32', values, [1, name === 'rgb' ? 3 : 1, SIDE, SIDE]);
    }
    self.postMessage({phase: 'inference'}); outputs = await session.run(feeds);reportHeap();
    const target = outputs.target.data.slice(), source = outputs.source.data.slice();
    if (target.length !== SIDE ** 2 || source.length !== SIDE ** 2) throw Error('Role output shape');
    self.postMessage({ok: true, target, source, ort: ort.env.versions, heapBytes: validateRoleHeap(bound,runtime.heapBytes()),parameterLoading:model.stats}, [target.buffer, source.buffer]);
  } catch (error) {try{reportHeap();}catch(heapError){error=heapError;}self.postMessage({ok: false, error: serializeEngineError(error)}); }
  finally { for (const t of Object.values(feeds)) t.dispose(); for (const t of Object.values(outputs ?? {})) t.dispose(); try{await session?.release();}finally{model?.release();} }
},{label:'d2prl-roles-bounded',onFailure:error=>self.postMessage({protocolFailure:true,ok:false,error:serializeEngineError(error)})});
