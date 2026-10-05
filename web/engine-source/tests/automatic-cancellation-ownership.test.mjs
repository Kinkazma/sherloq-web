import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {checkAbort,serializeEngineError} from '../src/errors.js';
import {createAutomaticAnalysisSession} from '../src/automatic-analysis-session.js';
import {automaticAnalysisPlan} from '../src/automatic-analysis-plan.js';
const enabled=process.execArgv.includes('--experimental-test-module-mocks'),turn=()=>new Promise(resolve=>setImmediate(resolve));
const polygon=[[0,0],[15,0],[15,15],[0,15]],selection={regions:[polygon],envelope:polygon,disabled:[]};
const image={sha256:'original',pixels:{width:16,height:16,format:'rgb8',data:new Uint8Array(768)},provenance:{}},task={id:'a',imageId:'original',operation:'analysis.clones',params:{selection}};
const gate=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve};};

test('public cancellation preserves real session checkpoints until explicit resume or destruction',
 {skip:!enabled&&'Run with --experimental-test-module-mocks for isolated ownership protocol tests'},async t=>{
 let currentFixture,created=0;
 t.mock.module('../src/automatic-analyzer.js',{namedExports:{createAutomaticAnalyzer:async({budget})=>{
  created++;const f=currentFixture,p=automaticAnalysisPlan({width:16,height:16,...selection});p.jobs=p.jobs.filter(job=>f.stage==='before-first'?job.id==='sift':['patchmatch','sift'].includes(job.id));
  const checkpoints=new Map(),providers=Object.fromEntries(p.jobs.map(job=>[job.id,{
   async run(job,hooks){
    f.calls[job.id]=(f.calls[job.id]??0)+1;(f.keys[job.id]??=[]).push(hooks.checkpointKey);
    if(!checkpoints.has(hooks.checkpointKey)){checkpoints.set(hooks.checkpointKey,{exact:23,release:budget.reserve(64)});f.checkpoints++;}
    if(job.id==='sift'&&f.block){f.entered.resolve();await new Promise(resolve=>hooks.signal.addEventListener('abort',resolve,{once:true}));checkAbort(hooks.signal);}
    if(job.id==='sift'&&f.cancel&&['before-first','after-done'].includes(f.stage)){f.cancel=false;hooks.onProgress({phase:'checkpoint-committed'});}
    checkAbort(hooks.signal);return {value:{id:job.id,exact:checkpoints.get(hooks.checkpointKey).exact},release:budget.reserve(16)};
   },
   async prepare(value){assert.equal(value.exact,23);return {value:{entries:[]},release:budget.reserve(8)};},
   releaseCheckpoint(key){const value=checkpoints.get(key);if(value){value.release();checkpoints.delete(key);f.checkpointReleases++;}}
  }]));
  const session=createAutomaticAnalysisSession({budget,plan:p,providers,maxConcurrent:1});f.session=session;
  return {plan:p,view:{getState:()=>({})},snapshot:session.snapshot,run:hooks=>session.run(hooks),
   resume(request,hooks){f.resumes++;return session.resume(request,hooks);},
   async prepare(input,hooks){
    if(f.cancel&&f.stage==='frame-prepare'){f.cancel=false;f.controller.abort();}
    const lease=await session.prepare(input,hooks);
    if(f.cancel&&f.stage==='frame-owned'){f.cancel=false;f.controller.abort();}
    return {...lease,async release(){await lease.release();if(f.cancel&&f.stage==='frame-release'){f.cancel=false;f.controller.abort();}}};
   },visible:lease=>lease.entries,async dispose(){f.disposed++;await session.dispose();}};
 }}});
 const {createAutomaticRuntime}=await import('../src/automatic-runtime.js');
 function fixture(stage){
  const budget=new Budget(2*1024**2),f={budget,stage,cancel:true,controller:new AbortController(),calls:{},keys:{},checkpoints:0,checkpointReleases:0,disposed:0,resumes:0,entered:gate()};currentFixture=f;
  f.runtime=createAutomaticRuntime({budget,profile:{maxWorkers:2},version:'test',getD2prl:()=>null,getLanguage:()=>null});return f;
 }
 for(const stage of ['before-first','after-done','frame-prepare','frame-owned','frame-release'])await t.test(stage,async()=>{
  const f=fixture(stage);try{
   let error;await assert.rejects(f.runtime.run(task,image,{signal:f.controller.signal,onProgress:event=>{if(event.phase==='checkpoint-committed')f.controller.abort();}}),caught=>{error=caught;return caught.code==='CANCELLED';});
   const kept=serializeEngineError(error).details.retainedAnalysis;assert.equal(typeof kept.analysisId,'string');assert.equal(f.runtime.active,true);assert.equal(f.disposed,0);assert.equal(f.checkpointReleases,0);assert.ok(f.budget.total()>0);
   assert.deepEqual(kept.completed,stage==='before-first'?[]:stage==='after-done'?['patchmatch']:['patchmatch','sift']);
   const attempts={...f.calls},checkpoints=f.checkpoints,resumed=await f.runtime.resume({analysisId:kept.analysisId});
   assert.equal(resumed.analysisId,kept.analysisId);assert.ok(Object.values(resumed.data.state.states).every(value=>value==='done'));assert.equal(f.checkpoints,checkpoints);
   if(stage.startsWith('frame')){assert.deepEqual(f.calls,attempts);assert.equal(f.resumes,0);}else{assert.equal(f.calls.sift,2);assert.equal(f.resumes,1);if(stage==='after-done')assert.equal(f.calls.patchmatch,1);}
   for(const keys of Object.values(f.keys))assert.equal(new Set(keys).size,1,'Checkpoint identity survives public cancellation');
   await assert.rejects(f.runtime.resume({analysisId:kept.analysisId}),{code:'INVALID_INPUT'});
   await f.runtime.clear();assert.equal(f.disposed,1);assert.equal(f.checkpointReleases,f.checkpoints);assert.equal(f.budget.total(),0);await assert.rejects(f.runtime.update({analysisId:kept.analysisId}),{code:'NOT_FOUND'});
  }finally{await f.runtime.dispose();}assert.equal(f.budget.total(),0);
 });
 await t.test('explicit dispose during a useful run drains and destroys its checkpoint',async()=>{
  const f=fixture('before-first');f.block=true;
  const pending=f.runtime.run(task,image),rejected=assert.rejects(pending,error=>error.code==='CANCELLED'&&!error.details?.retainedAnalysis);await f.entered.promise;await f.runtime.dispose();await rejected;assert.equal(f.runtime.active,false);assert.equal(f.disposed,1);assert.equal(f.checkpointReleases,1);assert.equal(f.budget.total(),0);
 });
 await t.test('new scope explicitly replaces a cancelled analysis and releases old checkpoints',async()=>{
  const first=fixture('before-first');let retained;
  await assert.rejects(first.runtime.run(task,image,{signal:first.controller.signal,onProgress:event=>{if(event.phase==='checkpoint-committed')first.controller.abort();}}),error=>{retained=error.details.retainedAnalysis;return error.code==='CANCELLED';});
  const second={...first,stage:'frame-prepare',cancel:false,calls:{},keys:{},checkpoints:0,checkpointReleases:0,disposed:0,resumes:0};currentFixture=second;
  try{const result=await first.runtime.run({...task,id:'new',imageId:'another'},image);assert.notEqual(result.analysisId,retained.analysisId);assert.equal(first.disposed,1);assert.equal(first.checkpointReleases,1);await assert.rejects(first.runtime.update({analysisId:retained.analysisId}),{code:'NOT_FOUND'});}finally{await first.runtime.dispose();}assert.equal(second.checkpointReleases,2);assert.equal(first.budget.total(),0);
 });
 await t.test('already cancelled calls create no analysis or checkpoint',async()=>{
  const f=fixture('before-first'),before=created;f.controller.abort();await assert.rejects(f.runtime.run(task,image,{signal:f.controller.signal}),error=>error.code==='CANCELLED'&&!error.details?.retainedAnalysis);assert.equal(created,before);assert.equal(f.runtime.active,false);assert.equal(f.budget.total(),0);await f.runtime.dispose();await turn();
 });
});
