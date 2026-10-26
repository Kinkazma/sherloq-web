import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isCloneWindowOperation} from '../sherloq-browser/assets/clone-window-choice.js';
const source=await readFile(new URL('../sherloq-browser/assets/app.js',import.meta.url),'utf8');
function binding({individual=true,automatic=false,mode='independent',automaticModeValue='independent'}={}){
 const line=source.split('\n').find(x=>x.startsWith('async function bindSourceRegionTask('));assert.ok(line);
 const ui={taskOptions:()=>({cloneWindowMode:mode})},domain={fingerprint:'verified-original'},fn=new Function('isCloneWindowOperation','individualMode','individualUI','automaticMode','currentCloneWindowMode','sourceRegionApplicability','analysisSourceDomain','hash','return ('+line+');')(isCloneWindowOperation,()=>individual,ui,()=>automatic,()=>automatic?automaticModeValue:mode,()=>({applicable:true}),async()=>domain,'source-sha');
 return {fn,domain};
}
test('Actual app source binds the selected window mode and retains the verified source domain',async()=>{
 const {fn,domain}=binding({mode:'global'}),task={operation:'tampering.copyMove.sparse',params:{algorithm:'XFeat'},backend:'webgpu'},out=await fn(task);assert.equal(out.cloneWindowMode,'global');assert.equal(out.sourceRegionDomain,domain);assert.deepEqual(out.params,task.params);assert.equal(out.backend,'webgpu');assert.equal(task.cloneWindowMode,undefined);
});
test('An already captured task mode cannot be silently replaced during source binding',async()=>{
 const {fn}=binding({mode:'global'}),out=await fn({operation:'ai.clones.segmentation',cloneWindowMode:'independent',params:{variant:'mgcfdn'}});assert.equal(out.cloneWindowMode,'independent');
});
test('ELA and the automatic workspace cannot inherit a stale individual tool choice',async()=>{
 const {fn}=binding({mode:'global'});assert.equal((await fn({operation:'ela.classic'})).cloneWindowMode,undefined);assert.equal((await binding({mode:'global',individual:false}).fn({operation:'analysis.clones'})).cloneWindowMode,undefined);
});
test('The actual app source owner rejects results after the window mode changes',()=>{
 const identity=source.split('\n').find(x=>x.startsWith('function sourceRegionTaskIdentity(')),current=source.split('\n').find(x=>x.startsWith('function sourceRegionTaskIsCurrent('));let mode='independent';const ui={taskOptions:()=>({cloneWindowMode:mode})};
 const api=new Function('individualUI','currentCloneWindowMode','revision','hash','imageId','fileInput','activeAnalysis','destroyed','return {identity:('+identity+'),current:('+current+')};')(ui,()=>mode,4,'sha','image',{},'tampering.copyMove.sparse',false),owner=api.identity();assert.equal(api.current(owner),true);mode='global';assert.equal(api.current(owner),false);mode='independent';assert.equal(api.current(owner),true);
});

test('Automatic analysis binds its own global choice without inheriting the individual tool',async()=>{const {fn}=binding({individual:false,automatic:true,mode:'independent',automaticModeValue:'global'});assert.equal((await fn({operation:'analysis.clones'})).cloneWindowMode,'global');assert.equal((await fn({operation:'analysis.complete',cloneWindowMode:'independent'})).cloneWindowMode,'independent');});
