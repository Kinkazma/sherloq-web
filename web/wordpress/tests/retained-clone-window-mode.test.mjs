import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {parameterPreviewPolicy,retainedNativeBasisStatus} from '../sherloq-browser/assets/parameter-preview-policy.js';
const source={sha256:'a'.repeat(64)},domain={fingerprint:'scope-a'},params={algorithm:'XFeat',limit:6000},task={operation:'tampering.copyMove.sparse',sourceRegionDomain:domain,params},policy=parameterPreviewPolicy(task.operation,'view.lines',params);
const result=mode=>({id:'native',operation:task.operation,cloneWindowMode:mode,sourceRegionDomain:domain,provenance:{cloneWindowMode:mode,params,originalSha256:source.sha256}});
test('retained clone mode is part of native basis identity in both directions, with independent task default',()=>{
 for(const mode of ['independent','global']){assert(retainedNativeBasisStatus(policy,{source,result:result(mode)},{...task,cloneWindowMode:mode}).available);const other=mode==='global'?'independent':'global';assert.equal(retainedNativeBasisStatus(policy,{source,result:result(mode)},{...task,cloneWindowMode:other}).reason,'clone-window-mode-changed');}
 assert.equal(retainedNativeBasisStatus(policy,{source,result:result('global')},task).reason,'clone-window-mode-changed');
});
test('legacy unmarked, invalid and contradictory clone results cannot become an independent basis',()=>{
 for(const prior of [{...result(undefined)},{...result('global'),cloneWindowMode:'independent'},result('unknown')])assert.equal(retainedNativeBasisStatus(policy,{source,result:prior},task).available,false);
 const top=result('independent');delete top.provenance.cloneWindowMode;assert(retainedNativeBasisStatus(policy,{source,result:top},task).available);const provenance=result('independent');delete provenance.cloneWindowMode;assert(retainedNativeBasisStatus(policy,{source,result:provenance},task).available);
});
test('classical and SSG retained modes are guarded without treating their legitimate localization knobs as new scientific basis requirements',()=>{
 for(const algorithm of ['ORB','SSG']){const p={algorithm,maskThreshold:.1},t={...task,params:{...p,maskThreshold:.2},cloneWindowMode:'independent'},r={...result('independent'),provenance:{...result('independent').provenance,params:p}},field=algorithm==='SSG'?'maskThreshold':'view.lines',rule=parameterPreviewPolicy(task.operation,field,p);assert(retainedNativeBasisStatus(rule,{source,result:r},t).available);assert(!retainedNativeBasisStatus(rule,{source,result:r},{...t,cloneWindowMode:'global'}).available);}
 const classical=parameterPreviewPolicy(task.operation,'threshold',{algorithm:'ORB'});assert.equal(retainedNativeBasisStatus(classical,{source,result:result('global')},task).required,false);
});
const app=readFileSync(new URL(import.meta.resolve('../sherloq-browser/assets/app.js')),'utf8');
const helper=app.slice(app.indexOf('function ensureRetainedParameterBasis('),app.indexOf('\nparameterSession=createParameterPreviewSession({'));
const commit=app.slice(app.indexOf('commit:async(event,{isCurrent'),app.indexOf('\n restore:()=>{individualUI')).replace(/^commit:/,'').replace(/,\s*$/,'');
function harness(mode){const counts={loads:0,run:0,retained:0,render:0,unavailable:0},client={source,result:result(mode),async updateRetainedParameters(){counts.retained++;return result(mode);}},context={fileInput:{},busy:false,activeAnalysis:task.operation,destroyed:false,sourceRegionsStale:false,individualClient:client,retainedNativeBasisStatus,parameterCommitting:false,resultMeta:null,individualUI:{render(){counts.render++;}},persistSettings(){},translateTaskActions(){},diagnostic(){},status(){},autoText:x=>x,controls(){},discardIndividualPresentation(){counts.unavailable++;},sourceRegionTaskIdentity:()=>({}),prepareParameterScientificTask:async()=>({task,isCurrent:()=>true}),bindSourceRegionTask:async t=>t,sourceRegionTaskIsCurrent:()=>true,adoptSourceRegionPresentation(){},acknowledgeSourceRegionTask:async()=>true,t:x=>x,$:()=>({}),run(){counts.run++;},regionController:null};return{counts,commit:new Function('context','with(context){'+helper+';return '+commit+';}')(context)};}
test('actual app commit declines a global native basis without configure, inference or retained publication; exact independent cache remains usable',async()=>{
 const event={toolId:task.operation,operation:task.operation,params,field:'view.lines',view:{lines:true},policy},miss=harness('global');await miss.commit(event);assert.equal(miss.counts.retained,0);assert.equal(miss.counts.run,0);assert.equal(miss.counts.render,0);assert.equal(miss.counts.unavailable,1);
 const hit=harness('independent');await hit.commit(event);assert.equal(hit.counts.retained,1);assert.equal(hit.counts.render,1);assert.equal(hit.counts.run,0);assert.equal(hit.counts.unavailable,0);
});
