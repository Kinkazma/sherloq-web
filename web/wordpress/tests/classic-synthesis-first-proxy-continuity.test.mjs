import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createLocalHeldPreviewOwners} from '../sherloq-browser/assets/local-held-preview-owner.js';

const app=await readFile(new URL('../sherloq-browser/assets/app.js',import.meta.url),'utf8');
const at=app.indexOf('function cancelSupersededLocalPreviews('),body=app.slice(at,app.indexOf('function beginLocalPreviewFlight(',at));
function fixture(synthesis=true){
 const owners=createLocalHeldPreviewOwners(),posts=[],timers=[],settings={mode:'classic',synthesis,params:{quality:85,scale:1,contrast:0},presentation:{},context:{}};
 const state={live:true,now:0,pending:new Map([[1,{action:'preview-classic',provisionalPreview:true,cancelRequested:false}]]),worker:{postMessage:m=>posts.push(m)},energyHistogramJob:null,energyHistogramQueued:null,energyHistogramVersion:0,localPreviewContinuity:{reset(){}},performance:{now:()=>state.now},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},diagnostic(){},hash:'a'.repeat(64),resultMeta:{id:'native-synthesis'},localPreviewFlight:null};
 const own=id=>owners.own({continuous:true,field:'scale',generation:1,gestureEpoch:1,controlRequestId:id},{settings,heldPath:['params','scale'],getSettings:()=>settings,isCurrent:()=>state.live});
 state.localPreviewFlight={frame:own(1),timer:null,started:0};const context=vm.createContext(state);vm.runInContext(body,context);
 return{state,settings,posts,timers,owners,input(value){settings.params.scale=value;state.now+=30;own(value+1);context.cancelSupersededLocalPreviews({retainOwned:true});},cancel:()=>context.cancelSupersededLocalPreviews({retainOwned:true})};
}
test('a still-owned Classic synthesis gain preview survives300ms while later values coalesce',()=>{
 const f=fixture();for(let value=2;value<=21;value++)f.input(value);assert.equal(f.state.now,600);assert.deepEqual(f.posts,[]);assert.deepEqual(f.timers,[]);assert.equal(f.state.localPreviewFlight.frame.isCurrent(),true);assert.equal(f.state.localPreviewFlight.frame.calculated.params.scale,1);assert.equal(f.state.localPreviewFlight.frame.latest().params.scale,21);
});
for(const cause of['source','mode','quality','other setting','synthesis disabled','release'])test(cause+' revokes the real Classic synthesis preview immediately',()=>{
 const f=fixture();f.input(3);if(cause==='source')f.state.live=false;else if(cause==='mode')f.settings.mode='biomes';else if(cause==='quality')f.settings.params.quality++;else if(cause==='other setting')f.settings.params.contrast++;else if(cause==='synthesis disabled')f.settings.synthesis=false;else f.owners.reset();f.cancel();assert.deepEqual(f.posts.map(p=>[p.id,p.action]),[[1,'cancel-preview']]);
});
test('ordinary Classic ELA retains the existing300ms cancellation policy',()=>{
 const f=fixture(false);f.input(3);assert.equal(f.timers.length,1);assert.equal(f.timers[0].ms,270);f.timers[0].fn();assert.deepEqual(f.posts.map(p=>p.action),['cancel-preview']);
});
test('Classic synthesis commit cancels after revoking its epoch; ordinary Classic remains unchanged',()=>{
 const code=app.slice(app.indexOf('function commitElaParameters('),app.indexOf('async function estimateClassicAuto('));
 for(const synthesis of[true,false]){const calls=[],state={sherloqDynamic:()=>false,elaParameterDraft:true,elaPreviewCommit:false,elaPreviewQueued:{},elaPreviewVersion:1,elaPreviewEpoch:5,elaMode:'classic',synthesisState:{enabled:synthesis},elaPreviewBusy:true,energyViewBusy:false,busy:false,controls(){},finishElaParameters(){throw Error('Active work must finish first');},cancelSupersededLocalPreviews(){calls.push(state.elaPreviewEpoch);}};const c=vm.createContext(state);vm.runInContext(code,c);c.commitElaParameters();assert.deepEqual(calls,synthesis?[6]:[]);assert.equal(state.elaPreviewCommit,true);}
});
test('held settings carry the actual synthesis state as part of ownership',()=>{
 const code=app.slice(app.indexOf('function elaHeldSettings('),app.indexOf('function queueElaParameterPreview('));
 const context=vm.createContext({elaMode:'classic',synthesisState:{enabled:true},prepareEnergyRequest:()=>({params:{}}),effectiveElaParams:()=>({quality:85,scale:1}),energyContextSelection:()=>({})});vm.runInContext(code,context);assert.equal(context.elaHeldSettings('preview-classic').synthesis,true);context.synthesisState.enabled=false;assert.equal(context.elaHeldSettings('preview-classic').synthesis,false);
});
