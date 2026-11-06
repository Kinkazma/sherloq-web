import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
import {createLocalHeldPreviewOwners} from '../sherloq-browser/assets/local-held-preview-owner.js';
const app=await readFile(new URL('../sherloq-browser/assets/app.js',import.meta.url),'utf8'),at=app.indexOf('function cancelSupersededLocalPreviews('),code=app.slice(at,app.indexOf('function beginLocalPreviewFlight(',at));
function fixture(){
 const owners=createLocalHeldPreviewOwners(),posts=[],timers=[],settings={mode:'scores',params:{quality:85},presentation:{view:'scores',field:'unified',threshold:0,scoreView:'map'},context:{}};
 const state={live:true,now:0,pending:new Map([[1,{action:'view-energy',provisionalPreview:true,cancelRequested:false}]]),worker:{postMessage:message=>posts.push(message)},energyHistogramJob:null,energyHistogramQueued:null,energyHistogramVersion:0,localPreviewContinuity:{reset(){}},performance:{now:()=>state.now},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},diagnostic(){},hash:'a'.repeat(64),resultMeta:{id:'native'},localPreviewFlight:null};
 const own=id=>owners.own({continuous:true,field:'energy-score-threshold',generation:1,gestureEpoch:1,controlRequestId:id},{settings,heldPath:['presentation','threshold'],getSettings:()=>settings,isCurrent:()=>state.live});
 state.localPreviewFlight={frame:own(1),timer:null,started:0};const context=vm.createContext(state);vm.runInContext(code,context);
 return{state,settings,posts,timers,owners,input(value){settings.presentation.threshold=value;state.now+=30;own(value+1);context.cancelSupersededLocalPreviews({retainOwned:true});},cancel:()=>context.cancelSupersededLocalPreviews({retainOwned:true})};
}
test('the real view-energy threshold flight can finish while newer values coalesce instead of being killed at300ms',()=>{
 const f=fixture();for(let value=1;value<=20;value++)f.input(value);assert.equal(f.state.now,600);assert.deepEqual(f.posts,[]);assert.deepEqual(f.timers,[]);assert.equal(f.state.localPreviewFlight.frame.isCurrent(),true);assert.equal(f.state.localPreviewFlight.frame.calculated.presentation.threshold,0);assert.equal(f.state.localPreviewFlight.frame.latest().presentation.threshold,20);
});
for(const cause of ['source','mode','quality','other presentation','release'])test(cause+' still revokes the actual Scores view immediately',()=>{
 const f=fixture();f.input(3);if(cause==='source')f.state.live=false;else if(cause==='mode')f.settings.mode='biomes';else if(cause==='quality')f.settings.params.quality++;else if(cause==='other presentation')f.settings.presentation.scoreView='overlay';else f.owners.reset();f.cancel();assert.deepEqual(f.posts.map(x=>[x.id,x.action]),[[1,'cancel-preview']]);
});
test('an ancillary histogram is still cancelled while the owned Scores frame survives',()=>{
 const f=fixture();f.state.pending.set(2,{action:'energy-histogram',provisionalPreview:true,cancelRequested:false});f.input(5);assert.deepEqual(f.posts.map(x=>[x.id,x.action]),[[2,'cancel-preview']]);assert.equal(f.state.pending.get(1).cancelRequested,false);
});
