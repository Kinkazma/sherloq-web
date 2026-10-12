import "../../runtime-context.js?v=0.16.0";
import {EngineError, requireValue, checkAbort} from './errors.js';
import {SelfDMProposalEngine} from './selfdm-proposal.js';
import {loadSelfDMProposalBundle} from './selfdm-proposal-assets.js';

// Preparation belongs to the complete pipeline. Passing an owned row source
// avoids both a second SelfDM resize and copying a full image at this boundary.
export function createSelfDMProposalPrepare() {
  let disposed = false;
  return {
    async run(input, {signal} = {}) {
      requireValue(!disposed && input.side === 512, 'SelfDM Proposal preparation disposed or unsupported');
      requireValue([input.width,input.height].every(v=>Number.isSafeInteger(v)&&v>0&&v<=131072)&&Number.isSafeInteger(input.width*input.height*4),'SelfDM original source geometry');
      const streamed=typeof input.readRows==='function';
      requireValue(streamed?input.data===undefined:input.readRows===undefined&&(input.data instanceof Uint8Array||input.data instanceof Uint8ClampedArray)&&input.data.length===input.width*input.height*3,'Owned RGB8 pixels or an exclusive source-row provider required');
      checkAbort(signal);
      return {inferenceInput:{...input,format:'rgb8'},release(){}};
    },
    dispose() {disposed = true;}
  };
}

export function createSelfDMProposalInference({budget, profile, model, modelUrl, backend = 'cpu', engineFactory = (...args) => new SelfDMProposalEngine(...args), bundleLoader = loadSelfDMProposalBundle}) {
  requireValue(budget && Number.isSafeInteger(profile?.maxWorkers) && profile.maxWorkers > 0 && model?.family === 'selfdm-proposal' && ['cpu','webgpu'].includes(backend), 'Qualified SelfDM Proposal compute profile required');
  let engine, sourceKey, bundle, busy = false, disposed = false;
  return {
    model:structuredClone(model), backend:backend==='webgpu'?'webgpu-cpu':'cpu', requiresSourcePixels:true,
    independentZoneWorker:true,
    get residentBytes() {return (engine?.pool?.slots??[]).reduce((sum,slot)=>sum+slot.bytes+(slot.threadLeases?.length??0)*2*1024**2,0) + [...(engine?.cvPools?.values()??[])].reduce((sum,pool)=>sum+[...(pool.workers?.values()??[])].reduce((n,slot)=>n+slot.bytes,0),0);},
    releaseIdle() {engine?.releaseIdle();},
    async run(input, {signal, onProgress, sourceKey:requestedKey} = {}) {
      if (busy) throw new EngineError('BUSY', 'SelfDM Proposal inference busy');
      requireValue(!disposed && typeof requestedKey === 'string' && requestedKey.length > 0, 'Immutable SelfDM Proposal source identity required');
      checkAbort(signal); busy = true;
      try {
        bundle ??= await bundleLoader({...model,url:modelUrl}, {budget,signal});
        if (engine && sourceKey !== requestedKey) {const previous = engine; engine = null; await previous.dispose();}
        if (!engine) {engine = engineFactory(input,budget,profile); sourceKey = requestedKey;}
        // A fresh provider may own the same scientific pixels. Checkpoints use
        // sourceKey, while the source window belongs only to this invocation.
        engine.image = input;
        const started = performance.now(), result = await engine.analyze({}, {signal,onProgress,models:bundle.models,cv:bundle.cv,backend});
        return {...result, timings:{...result.timings,totalMs:performance.now()-started}, modelId:model.id};
      } finally {if(engine)engine.image=null;busy = false;}
    },
    async dispose() {requireValue(!busy, 'SelfDM Proposal inference busy'); if (!disposed) {disposed = true; await engine?.dispose(); engine = null; bundle = null; sourceKey = null;}}
  };
}
