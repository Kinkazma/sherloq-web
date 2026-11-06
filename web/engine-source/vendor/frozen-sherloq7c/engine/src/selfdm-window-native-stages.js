import{NeuralGraphPool}from'./neural-graph-pool.js';
import{selfDMProposalRuntimes}from'./selfdm-proposal-assets.js';
import{SELFDM_WINDOW_GRAPH_POLICY,SELFDM_WINDOW_MODEL_SHA256,SELFDM_WINDOW_FEATURES,SELFDM_WINDOW_ATTENDED,SELFDM_WINDOW_QUERIES,SELFDM_WINDOW_BANK}from'./selfdm-window-context-graph.js';
import{selfDMWindowQueryRanges}from'./selfdm-window-context-bank.js';
import{requireValue,EngineError}from'./errors.js';
const MiB=1024**2,STAGES=['encoder','attention','relations','global','decoder'];
export function selfDMWindowStageAdmission(stage,inputs){
 requireValue(STAGES.includes(stage),'Native SelfDM stage required');
 if(stage==='encoder')return{workspaceBytes:320*MiB,outputBytes:1280*4096*4};
 if(stage==='decoder')return{workspaceBytes:320*MiB,outputBytes:512**2*4};
 const key=stage==='attention'?SELFDM_WINDOW_FEATURES[0]:stage==='relations'?SELFDM_WINDOW_ATTENDED[0]:SELFDM_WINDOW_BANK,n=inputs[key]?.dims?.[3],q=stage==='global'?1:inputs[SELFDM_WINDOW_QUERIES]?.dims?.[0];requireValue(Number.isSafeInteger(n)&&n>0&&Number.isSafeInteger(q)&&q>0&&q<=n,'Actual complete candidate and query populations must precede admission');
 const relations=stage==='attention'||stage==='relations',quadratic=relations?Math.max(0,n*q-4096**2)*16:0,linear=relations?Math.max(0,n-4096)*1280*8:0;
 const workspaceBytes=relations?320*MiB+quadratic+linear:32*MiB+n*144*4;requireValue(Number.isSafeInteger(workspaceBytes),'Native SelfDM common bank exceeds exact integer admission');
 return{workspaceBytes,outputBytes:stage==='attention'?1280*q*4:stage==='relations'?144*q*4:48*4};
}
/** Same original SelfDM runtimes, scheduler, grants and requested backend.
 * Root must merge the four explicit graph-transform identity hunks before this
 * private route is launched. There is no ordinary model/gate bypass here. */
export function createSelfDMWindowNativeStages({budget,profile,model,modelUrl,backend,workerFactory}={}){
 requireValue(model?.sha256===SELFDM_WINDOW_MODEL_SHA256&&model.bytes===62971505&&['cpu','webgpu'].includes(backend)&&/^https?:$/.test(new URL(modelUrl).protocol),'Exact original native SelfDM model/backend required');
 const assets=Object.fromEntries(STAGES.map(stage=>[stage,{...model,url:modelUrl,graphOptimizationLevel:'disabled',wasmMaximumBytes:2*1024**3,graphTransform:{id:SELFDM_WINDOW_GRAPH_POLICY+':'+stage,sourceSha256:SELFDM_WINDOW_MODEL_SHA256,maxAddedBytes:524288}}]));
 const pool=new NeuralGraphPool(budget,profile,{assets,runtimes:selfDMProposalRuntimes(),resourceOwner:'selfdm',...(workerFactory?{workerFactory}:{})});let closed=false;
 return{preflight(plan){const n=plan.nativeCandidateRows,range=selfDMWindowQueryRanges(n).next().value,{workspaceBytes}=selfDMWindowStageAdmission('attention',{[SELFDM_WINDOW_FEATURES[0]]:{dims:[1,256,1,n]},[SELFDM_WINDOW_QUERIES]:{dims:[range.count]}}),modelBytes=model.bytes+524288,cap=Math.ceil((64*MiB+modelBytes*2+workspaceBytes)/(16*MiB))*16*MiB;if(cap>2*1024**3)throw new EngineError('MEMORY_LIMIT','The complete native SelfDM bank exceeds its original2GiB WASM admission even with exhaustive query blocks; no centres or contexts were discarded',{details:{nativeCandidates:n,nativeQueries:range.count,workspaceBytes,requiredWasmBytes:cap,maximumBytes:2*1024**3,beforeRgbAndEncoder:true}});return{nativeCandidates:n,nativeQueries:range.count,workspaceBytes,requiredWasmBytes:cap};},async run(stage,inputs,hooks={}){requireValue(!closed,'Native SelfDM stages retired');const admission=selfDMWindowStageAdmission(stage,inputs);return pool.run(stage,inputs,{...hooks,backend,...admission});},dispose(){closed=true;return pool.disposeGracefully();},snapshot:()=>pool.snapshot()};
}
