import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {EngineError,serializeEngineError} from '../src/errors.js';

// Only the analyzer protocol is controlled. The real public runtime, Budget,
// retained-analysis error policy and actual owner-retirement helper are used.
test('automatic frame retirement preserves primary errors and retained source ownership',async t=>{
 let fixture;
 t.mock.module('../src/automatic-analyzer.js',{namedExports:{createAutomaticAnalyzer:async({budget})=>{
  const f=fixture;return{plan:{width:16,height:16},view:{getState:()=>({})},snapshot:()=>({states:{d2prl:'done'},completed:['d2prl']}),async run(){},
   async prepare(){const free=budget.reserve(8);return{entries:[],filters:{},async release(){free();f.retirements++;if(f.failCleanup)throw new EngineError('STORAGE_IO','independent native frame retirement failed');}};},
   visible(lease){if(f.primary)throw f.primary;return lease.entries;},async dispose(){f.disposals++;}
  };
 }}});
 const {createAutomaticRuntime}=await import('../src/automatic-runtime.js');
 const image={sha256:'controlled-original',pixels:{width:16,height:16,format:'rgb8',data:new Uint8Array(768)},provenance:{}},task={id:'frame-owner',imageId:'original',operation:'analysis.clones',params:{selection:{regions:[[[0,0],[15,0],[15,15],[0,15]]],envelope:null,disabled:[]}}};
 for(const scenario of[{name:'frozen retained cancellation',code:'CANCELLED',frozen:true,cleanup:true},{name:'frozen retained resource refusal',code:'MEMORY_LIMIT',frozen:true,cleanup:true},{name:'extensible primary keeps serialized cleanup diagnostics',code:'CANCELLED',cleanup:true},{name:'cleanup error alone keeps its own scientific cause',cleanup:true},{name:'a frozen primary without cleanup failure stays identical',code:'CANCELLED',frozen:true,cleanup:false}])await t.test(scenario.name,async()=>{
  const f={retirements:0,disposals:0,primary:null,failCleanup:false};fixture=f;const budget=new Budget(4*1024**2),runtime=createAutomaticRuntime({budget,profile:{maxWorkers:2},version:'test',getD2prl:()=>null,getLanguage:()=>null});
  try{
   const initial=await runtime.run(task,image);if(scenario.code){f.primary=new EngineError(scenario.code,'retained primary',{details:{retainedAnalysis:{analysisId:initial.analysisId}}});if(scenario.frozen)Object.freeze(f.primary);}f.failCleanup=scenario.cleanup;let caught;
   try{await runtime.update({analysisId:initial.analysisId});}catch(error){caught=error;}
   if(f.primary){assert.equal(caught,f.primary);assert.equal(caught.code,scenario.code);if(!scenario.frozen&&scenario.cleanup)assert.equal(serializeEngineError(caught).details.cleanupErrors[0].code,'STORAGE_IO');}
   else{assert.equal(caught.code,'STORAGE_IO');assert.equal(caught.details.retainedAnalysis.analysisId,initial.analysisId);assert.equal(caught.cause.code,'STORAGE_IO');}
   assert.equal(f.retirements,2,'Every independent lease is retired exactly once');assert.equal(runtime.active,true);f.primary=null;f.failCleanup=false;const again=await runtime.update({analysisId:initial.analysisId});assert.equal(again.analysisId,initial.analysisId);assert.equal(f.retirements,3,'The completed analysis remains usable after the failed frame');
  }finally{f.primary=null;f.failCleanup=false;await runtime.dispose();assert.equal(f.disposals,1);assert.equal(budget.total(),0);}
 });
});
