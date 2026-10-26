import {ocrPresentationSnapshot} from '../sherloq-browser/assets/ocr-presentation.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {retainedPreviewWorkingBytes} from '../sherloq-browser/assets/retained-parameter-preview.js';

const assets=new URL('../sherloq-browser/assets/',import.meta.url);
const client=await fs.readFile(new URL('tool-client.js',assets),'utf8');
const app=await fs.readFile(new URL('app.js',assets),'utf8');
const workspace=await fs.readFile(new URL('tool-workspace.js',assets),'utf8');
const budgetBody=client.slice(client.indexOf('async function previewPixelsBudget('),client.indexOf('async function displayPreviewPlan('));
const budgetFor=memory=>Function('engine','memoryBudgetBytes','EngineError','return '+budgetBody)({capabilities:async()=>({memory})},undefined,class extends Error{constructor(code,message){super(message);this.code=code;}});

test('retained sampling admits its fixed cell workspace before selecting pixel count',async()=>{
 const fixed=retainedPreviewWorkingBytes({maxSide:1})-40+256*1024;
 const memory={budgetBytes:8*1024**2,retainedBytes:2*1024**2,cacheBytes:1024**2,activeReservationBytes:512*1024,knownHeapCapacityBytes:1024**2};
 const count=await budgetFor(memory)(40,fixed);
 const free=memory.budgetBytes-memory.retainedBytes-memory.cacheBytes-memory.activeReservationBytes-memory.knownHeapCapacityBytes;
 assert.ok(count>=256);assert.ok(count*40+fixed<=free);assert.ok(count*40+fixed+40>free);
 assert.match(client,/previewPixelsBudget\(40,retainedPreviewWorkingBytes\(\{maxSide:1\}\)-40\+256\*1024\)/);
});
test('insufficient preview admission leaves the native budget unchanged',async()=>{
 const memory={budgetBytes:512*1024,retainedBytes:128*1024},original=structuredClone(memory);
 await assert.rejects(budgetFor(memory)(40,retainedPreviewWorkingBytes({maxSide:1})-40),{code:'PREVIEW_UNAVAILABLE'});
 assert.deepEqual(memory,original);
});
test('proxy-only display failure retains the report, native result and fallback frame',()=>{
 const body=app.slice(app.indexOf('function showIndividualSurface(display){'),app.indexOf('\nasync function runIndividual(){'));
 const native={operation:'m2.rita',status:'ok',data:{native:true}},fallback={nativeFrame:true},layer={value:'source'};let fail,discarded=0,recorded=0,draws=0,closed=0;
 const context={ocrPresentationSnapshot,sourceRegionTaskIdentity:()=>({revision:9}),sourceRegionTaskIsCurrent:owner=>owner.revision===9,hash:'a'.repeat(64),revision:9,resultMeta:native,individualUI:{operation:()=>native.operation,view:()=>({})},structuredClone,retireResult:()=>{},remoteSurface:(display,onError)=>{fail=onError;return {close(){closed++;}};},destroyed:false,individualCancelled:false,previousPresentation:fallback,result:null,diagnostic:()=>{},status:()=>{},autoText:fr=>fr,controls:()=>{},draw:()=>draws++,$:id=>id==='layer'?layer:{classList:{contains:()=>false}},observePreviewPresentation:()=>{},source:{width:100,height:80},parameterSession:{pending:true},discardIndividualPresentation:()=>discarded++,errorJournal:{record(){recorded++;return{};}},fit:()=>{}};
 vm.createContext(context);vm.runInContext(body+'\nshowIndividualSurface({id:"view",width:100,height:80,responsePreview:true});',context);
 fail(Object.assign(Error('Not enough transient memory'),{code:'MEMORY_LIMIT'}));
 assert.equal(context.resultMeta,native);assert.equal(context.previousPresentation,fallback);assert.equal(context.result,null);assert.equal(layer.value,'result');assert.equal(recorded,0);assert.equal(discarded,0);assert.equal(closed,1);assert.ok(draws>=1);
});
test('scatter calibration distinguishes actual 2d/3d and channel axes',()=>{
 assert.match(workspace,/key:'scatter\/'.*settings\[id\]\.kind.*\['x','y','z'\]/);
 assert.doesNotMatch(workspace,/key:'scatter\/'.*settings\[id\]\.mode/);
});
