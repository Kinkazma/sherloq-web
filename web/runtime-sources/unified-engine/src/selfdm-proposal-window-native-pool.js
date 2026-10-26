import "../../runtime-context.js?v=0.25.0";
import {requireValue,EngineError} from './errors.js';
import {NeuralGraphPool} from './neural-graph-pool.js';
import {selfDMProposalRuntimes} from './selfdm-proposal-assets.js';
import {selfDMProposalWindowNativeAssets} from './selfdm-proposal-native-assets.js';
import {SELFDM_WINDOW_GRAPH_POLICY,SELFDM_WINDOW_MODEL_SHA256,SELFDM_WINDOW_FEATURES,SELFDM_WINDOW_QUERIES} from './selfdm-window-context-graph.js';
import {selfDMWindowStageAdmission} from './selfdm-window-native-stages.js';
import {selfDMWindowQueryRanges} from './selfdm-window-context-bank.js';
const MiB=1024**2,STAGES=['encoder','attention','relations','global','decoder'];

/** One existing shared pool for every original Proposal model and its exact
 * received cuts. Backend auto stays auto in EVERY useful call, including the
 * initial Map stages: provider selection/recovery remain native pool policy. */
export function createSelfDMProposalWindowNativePool({models,budget,profile,backend='auto',workerFactory,poolFactory=(...args)=>new NeuralGraphPool(...args),runtimes}={}){
 requireValue(['auto','cpu','webgpu'].includes(backend),'Native Proposal backend required');
 const assets=selfDMProposalWindowNativeAssets(models);
 for(const stage of STAGES)assets['proposal-map-'+stage]={...assets.selfdm,graphTransform:{id:SELFDM_WINDOW_GRAPH_POLICY+':'+stage,sourceSha256:SELFDM_WINDOW_MODEL_SHA256,maxAddedBytes:524288}};
 const pool=poolFactory(budget,profile,{assets,runtimes:runtimes??selfDMProposalRuntimes(),resourceOwner:'selfdm-proposal',...(workerFactory?{workerFactory}:{})});let closed=false,requested=false,closing;
 const run=(name,input,options)=>{requireValue(!requested&&!closed,'Proposal native pool retiring or retired');return pool.run(name,input,{...options,backend})};
 return{assets,run,snapshot:()=>pool.snapshot(),
  createInitialStages({onRun}={}){return{
   // This is the unchanged Map native admission formula, using its exported
   // stage/query helpers. It runs before RGB and does not discard any row.
   preflight(plan){const n=plan.nativeCandidateRows,range=selfDMWindowQueryRanges(n).next().value,{workspaceBytes}=selfDMWindowStageAdmission('attention',{[SELFDM_WINDOW_FEATURES[0]]:{dims:[1,256,1,n]},[SELFDM_WINDOW_QUERIES]:{dims:[range.count]}}),modelBytes=assets.selfdm.bytes+524288,cap=Math.ceil((64*MiB+modelBytes*2+workspaceBytes)/(16*MiB))*16*MiB;if(cap>2*1024**3)throw new EngineError('MEMORY_LIMIT','The complete native SelfDM bank exceeds its original2GiB WASM admission even with exhaustive query blocks; no centres or contexts were discarded',{details:{nativeCandidates:n,nativeQueries:range.count,workspaceBytes,requiredWasmBytes:cap,maximumBytes:2*1024**3,beforeRgbAndEncoder:true}});return{nativeCandidates:n,nativeQueries:range.count,workspaceBytes,requiredWasmBytes:cap}},
   run(stage,input,hooks={}){requireValue(STAGES.includes(stage),'Exact native initial Map stage required');const name='proposal-map-'+stage,options={...hooks,...selfDMWindowStageAdmission(stage,input)};return onRun?onRun(name,input,options):run(name,input,options)},
   // The product parent owns this common pool; Map's child borrows it.
   dispose(){return Promise.resolve()},snapshot:()=>pool.snapshot(),
  }},
  dispose(){requested=true;if(closed)return Promise.resolve();if(closing)return closing;closing=(async()=>{await pool.disposeGracefully();closed=true})().finally(()=>{closing=null});return closing},
 };
}
