import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../sherloq-browser/assets/app.js',import.meta.url),'utf8');
const matching=app.slice(app.indexOf('function completedNativeEnergyPreviewMatches('),app.indexOf('async function finishEnergyEla(',app.indexOf('function completedNativeEnergyPreviewMatches(')));
function fixture(){
 const queued=[],p={quality:75,block:16,minimum:1,profile:'manual',histogramLow:10,histogramHigh:990,shadow:50,highlight:50};
 const state={elaMode:'biomes',elaParameterKind:'energy',synthesisState:{enabled:false},worker:{},lastScientificEnergy:{},params:p,prepareEnergyRequest:()=>({params:state.params}),queueAnalysis:value=>queued.push(value),sourceCurrent:true};
 state.result={nativeEnergyPreview:{worker:state.worker,basis:state.lastScientificEnergy,paramsKey:JSON.stringify(p),sourceCurrent:()=>state.sourceCurrent}};
 const context=vm.createContext(state);vm.runInContext(matching,context);return {state,queued,commit:()=>vm.runInContext('finishElaParameters()',context)};
}
test('a completed native Biomes proxy can publish immediately after release',()=>{const f=fixture();f.commit();assert.equal(f.queued[0].completedNativePreview,true);});
test('changed intent, source, worker, basis, Synthèse and other modes retain the ordinary scheduling contract',()=>{
 for(const change of [s=>s.params={...s.params,shadow:51},s=>s.sourceCurrent=false,s=>s.worker={},s=>s.lastScientificEnergy={},s=>s.synthesisState.enabled=true,s=>s.elaMode='classic',s=>s.result=null]){
  const f=fixture();change(f.state);f.commit();assert.equal(f.queued[0].completedNativePreview,false);
 }
});
test('immediate publication keeps the actual automatic-calculation guards and cancels stale timers',async()=>{
 const start=app.indexOf('function queueAnalysis('),end=app.indexOf('\n}',start)+2,code=app.slice(start,end),timers=[],nodes=new Map();let runs=0,clears=0;
 const state={autoRunTimer:42,fileInput:{},host:{sourceOnly:false},$:id=>{if(!nodes.has(id))nodes.set(id,{classList:{contains:()=>false}});return nodes.get(id);},parameterSession:null,parameterCommitting:false,firstSourceFrame:{requestAnalysis:()=>false},source:{},localMagnifier:()=>false,busy:false,energyViewBusy:false,elaPreviewBusy:false,pendingMagnifier:false,comparisonRunNotice:()=>'',activeAnalysis:'ela.classic',regionController:null,individualMode:()=>false,status(){},autoText:x=>x,clearTimeout(){clears++;},setTimeout(fn,ms){timers.push({fn,ms});return timers.length;},drawing:false,run:()=>runs++};
 const context=vm.createContext(state);vm.runInContext(code,context);
 vm.runInContext('queueAnalysis({completedNativePreview:true})',context);assert.equal(timers[0].ms,0);await timers[0].fn();assert.equal(runs,1);
 vm.runInContext('queueAnalysis()',context);assert.equal(timers[1].ms,250);
 state.regionController={scientificActive:()=>true};vm.runInContext('queueAnalysis({completedNativePreview:true})',context);assert.equal(timers.length,2,'scientific-region workflow keeps its Calculate action');
 state.regionController=null;state.activeAnalysis='detail.gradient';await timers[1].fn();assert.equal(runs,1,'a changed tool cannot publish the old candidate');assert.equal(clears,3);
});
