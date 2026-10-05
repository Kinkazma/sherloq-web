import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {EngineError,serializeEngineError} from '../src/errors.js';

const enabled=process.execArgv.includes('--experimental-test-module-mocks');
test('presentation allocation and storage failures preserve committed detector owners for update and export',
 {skip:!enabled&&'Run with --experimental-test-module-mocks for isolated ownership protocol tests'},async t=>{
  let runs=0,disposed=0,fail=true,scenario,failureCode;
  const state={states:{patchmatch:'done'},completed:['patchmatch'],running:[],errors:{},attempts:{patchmatch:1}};
  t.mock.module('../src/automatic-analyzer.js',{namedExports:{createAutomaticAnalyzer:async()=>({
   plan:{width:16,height:16},async run(){runs++;},snapshot:()=>structuredClone(state),
   async prepare(){if(fail&&scenario.startsWith('prepare'))throw new EngineError(failureCode,'Presentation refused',{details:{allocationKind:'array-buffer'}});return {entries:[],filters:{},release(){if(fail&&scenario.includes('release'))throw new EngineError('STORAGE_IO','release refused');}};},
   visible:()=>{if(fail&&scenario==='visible+release')throw new EngineError('MEMORY_ALLOCATION','primary visible failure');return [];},view:{getState:()=>({})},
   async export(){return {retainedScientificOwner:true,dispose(){}};},async dispose(){disposed++;}
  })}});
  const {createAutomaticRuntime}=await import('../src/automatic-runtime.js');
  for([scenario,failureCode] of [['prepare-memory','MEMORY_ALLOCATION'],['prepare-storage','STORAGE_IO'],['visible+release','MEMORY_ALLOCATION'],['release','STORAGE_IO']]){
  runs=0;disposed=0;fail=true;
  const budget=new Budget(64*1024**2),image={sha256:'original',pixels:{width:16,height:16},provenance:{}},selection={regions:[],envelope:[],disabled:[]};
  const runtime=createAutomaticRuntime({budget,profile:{maxWorkers:8},version:'test',getD2prl:()=>null,getLanguage:()=>null,exports:{adopt:archive=>archive}});
  try{
   let error;
   await assert.rejects(runtime.run({id:'a',imageId:'original',operation:'analysis.complete',params:{selection}},image),caught=>{error=caught;return caught.code===failureCode;});
   if(scenario==='visible+release'){assert.equal(error.message,'primary visible failure');assert.equal(error.details.cleanupErrors[0].message,'release refused');}
   assert.equal(disposed,0);assert.equal(runs,1);assert.equal(runtime.active,true);
   const kept=serializeEngineError(error).details.retainedAnalysis;
   assert.deepEqual(kept.completed,['patchmatch']);assert.deepEqual(kept.state,state);
   fail=false;
   const result=await runtime.update({analysisId:kept.analysisId});
   assert.equal(result.analysisId,kept.analysisId);assert.equal(result.status,'ok');assert.equal(runs,1);
   assert.equal((await runtime.export({analysisId:kept.analysisId})).retainedScientificOwner,true);
   await runtime.clear();assert.equal(disposed,1);assert.equal(budget.snapshot().activeReservationBytes,0);
  }finally{await runtime.dispose();}
  }
 });
