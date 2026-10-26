import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createCmsegWindowFragmentRun} from '../src/cmseg-window-fragment-run.js';
import {createSegmentationPrepare} from '../experiments/segmentation/prepare.js';
const sha='c'.repeat(64),MiB=1024**2;
const zone=(id,b,kind='acquisition')=>({id,kind,enabled:true,x0:b[0],y0:b[1],x1:b[2],y1:b[3],polygon:[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]]});
async function domain(zones){const state=await createOriginalSourceRegionsState({sourceSha256:sha,width:32,height:16});await state.replaceZones(zones,{enabled:true,positiveMode:'selected'});return compileOriginalSourceRegions(state.snapshot());}
async function fixture({empty=false,candidateHole=false}={}){
 const zones=[zone('chosen',[2,1,30,15]),zone('true-negative',[14,1,18,15],'exclusion')],context=await domain(zones),candidate=await domain(empty?[...zones,zone('all',[0,0,32,16],'exclusion')]:candidateHole?[...zones,zone('candidate-only',[5,5,6,6],'exclusion')]:zones),reads=[];let refuse=false,sourceBudget;
 const original={sha256:sha,segmented:true,surface:{descriptor:{width:32,height:16},async readWindow(r){
  for(let y=r.y;y<r.y+r.height;y++)assert.ok(context.originalRowIntervals(y).some(([lo,hi])=>r.x>=lo&&r.x+r.width<=hi),'excluded RGB read');reads.push({...r});
  const free=sourceBudget?.reserve(r.width*r.height*3),data=Uint8Array.from({length:r.width*r.height*3},(_,i)=>(r.x+Math.floor(i/3)%r.width+(i%3)*11+Math.floor(i/3/r.width)+r.y)%256);let released=false;
  return{pixels:{width:r.width,height:r.height,format:'rgb8',data},async release(){if(refuse)throw 0;if(!released){released=true;free?.();}}};
 }}};
 return{original,window:{id:'user-named-window',bounds:[2,1,30,15],fingerprint:context.fingerprint,contextDomain:context,candidateDomain:candidate},reads,refuse(v){refuse=v;},useSourceBudget(value){sourceBudget=value;}};
}
function controlled({budget,calls,failAfterPrepare=false,sourceHook}={}){
 return{cnnFactory({model,backend,maxWorkers,onOwner}){calls.push(['cnn',model.id,backend,maxWorkers]);const owner={release(){calls.push(['cnn-release']);}};onOwner(owner);return owner;},
  headFactory({contexts,prepare,sourceOwner,model,backend,profile,onOwner,window}){
   assert.equal(contexts.length,2);assert.deepEqual(contexts.map(c=>c.bounds),[[2,1,14,15],[18,1,30,15]]);const held=new Set();let closed=false;
   const owner={async release(){for(const p of held){await p.release();held.delete(p);}await sourceOwner.release();closed=true;},async run(){
    for(const c of contexts){const p=await prepare(c,{});held.add(p);assert.equal(p.input.length,3*512**2);assert.equal(p.input[0],Math.fround((c.bounds[0]+c.bounds[1])/255));calls.push(['prepare',c.bounds]);if(failAfterPrepare)throw Error('controlled-before-cnn');await p.release();held.delete(p);}
    sourceHook?.();sourceOwner.assertCurrent();return{contexts:contexts.map(context=>({context,probability:new Float32Array([.125])})),receipt:{controlled:true,model:model.id,backend,cores:profile.maxWorkers,candidateFingerprint:window.candidateDomain.fingerprint}};
   }};onOwner(owner);return owner;
  }};
}
for(const variant of ['cmseg-generalization','cmseg-addnoise'])test('CMSeg literal Original rows use the unchanged native Pillow512 preparer for '+variant+' (0NN)',async()=>{
 const f=await fixture({candidateHole:true}),budget=new Budget(256*MiB),calls=[],parts=controlled({budget,calls}),owners=[];
 const carrier=createCmsegWindowFragmentRun({...f,variant,backend:'webgpu',modelUrl:'http://unused.invalid/model.json'},{budget,profile:{maxWorkers:10},onOwner:o=>owners.push(o),...parts});
 try{const result=await carrier.run();assert.equal(result.cloneWindowMode,'independent');assert.equal(result.receipt.candidateFingerprint,f.window.candidateDomain.fingerprint);assert.equal(result.provenance.maskedOriginalCnnEquivalent,false);assert.equal(result.execution.requestedMaximumCores,10);assert.ok(f.reads.length);assert.equal(carrier.observations.rgbForbiddenPixels,0);assert.equal(calls.filter(c=>c[0]==='prepare').length,2);assert.equal(owners.length,1);}finally{await carrier.release();}assert.equal(budget.total(),0);assert.equal(carrier.pendingACKs,0);
});
test('Empty candidates cause no RGB, preparation or CNN construction and never fall back to whole (0NN)',async()=>{
 const f=await fixture({empty:true}),budget=new Budget(64*MiB),calls=[],carrier=createCmsegWindowFragmentRun({...f,variant:'cmseg-addnoise',backend:'cpu'},{budget,profile:{maxWorkers:10},onOwner(){},...controlled({budget,calls})});
 assert.equal((await carrier.run()).status,'empty');assert.equal(f.reads.length,0);assert.equal(calls.length,0);await carrier.release();assert.equal(budget.total(),0);
});
test('Global canonical window keeps its declared mode without changing the literal RGB partition (0NN)',async()=>{
 const f=await fixture(),budget=new Budget(256*MiB),calls=[],carrier=createCmsegWindowFragmentRun({...f,cloneWindowMode:'global',variant:'cmseg-addnoise',backend:'cpu'},{budget,profile:{maxWorkers:10},onOwner(){},...controlled({budget,calls})});
 try{const result=await carrier.run();assert.equal(result.cloneWindowMode,'global');assert.equal(result.provenance.cloneWindowMode,'global');assert.equal(result.analysisWindow.id,f.window.id);}finally{await carrier.release();}assert.equal(budget.total(),0);
});
test('Native source ACK0 rejects before a prepared tensor can be passed to CNN and remains retryable (0NN)',async()=>{
 const f=await fixture(),budget=new Budget(256*MiB),calls=[];f.useSourceBudget(budget);f.refuse(true);const carrier=createCmsegWindowFragmentRun({...f,variant:'cmseg-addnoise',backend:'cpu'},{budget,profile:{maxWorkers:10},onOwner(){},...controlled({budget,calls})});
 let caught=false;try{await carrier.run();}catch(error){caught=true;assert.equal(error,0);}assert.ok(caught);assert.equal(calls.filter(c=>c[0]==='prepare').length,0);let refused=false;try{await carrier.release();}catch(error){refused=true;assert.equal(error,0);}assert.ok(refused);assert.ok(budget.total()>0);f.refuse(false);await carrier.release();assert.equal(budget.total(),0);
});
test('Cancellation and Original identity changes cannot publish a stale completed carrier (0NN)',async()=>{
 for(const mode of ['cancel','source']){const f=await fixture(),budget=new Budget(256*MiB),calls=[],signal=new AbortController(),parts=controlled({budget,calls,sourceHook(){if(mode==='cancel')signal.abort();else f.original.sha256='d'.repeat(64);}}),carrier=createCmsegWindowFragmentRun({...f,variant:'cmseg-addnoise',backend:'cpu'},{budget,profile:{maxWorkers:10},signal:signal.signal,onOwner(){},...parts});await assert.rejects(carrier.run());await carrier.release();assert.equal(budget.total(),0);}
});
