// Real app callbacks and deterministic transport/timers; no DOM, image or codec.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const url=process.env.SHERLOQ_ELA_COMMIT_APP_URL??new URL('../sherloq-browser/assets/app.js',import.meta.url);
const app=readFileSync(url,'utf8');
function section(first,last){const start=app.indexOf(first),end=app.indexOf(last,start);assert(start>=0&&end>start,first+' remains an actual app callback');return app.slice(start,end);}
const callbacks=[section('function queueAnalysis(){','\nlet layouts='),section('function beginElaParameters(','\nasync function estimateClassicAuto'),section('function queueElaParameterPreview(','\nfunction revokeElaParameterPreview'),section('function finishElaParameters(){','\nasync function finishEnergyEla'),section('async function refreshEnergyView(','\nasync function exportEnergy')].join('\n');
const drain=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};

function fixture({synthesis=false}={}){
 const timers=new Map(),requests=[],runs=[],paint=[];let serial=0;
 const state={loaded:true,worker:{},fileInput:{},source:{},imageId:'source-1',revision:1,elaPreviewEpoch:1,elaPreviewVersion:0,elaParameterDraft:true,elaPreviewCommit:false,elaPreviewBusy:false,elaPreviewQueued:null,elaParameterKind:'energy',energyMode:true,elaMode:'biomes',energyViewBusy:false,energyViewQueued:false,energyViewPreview:null,energyViewRevision:1,busy:false,sourceRegionsStale:false,destroyed:false,autoRunTimer:null,pendingMagnifier:false,drawing:false,activeAnalysis:'ela.classic',parameterSession:null,parameterCommitting:false,energyHistogramUI:null,elaAdaptiveFeedback:null,energyViewFrame:null,params:{quality:75},scientific:{quality:synthesis?0:75,shadow:29},presentation:{view:'overlay',opacity:70},lastScientificEnergy:{id:'energy-1'},lastScientificClassic:null,regionController:null,resultMeta:{id:'energy-1',ui:{},data:{metadata:{}}},synthesisState:{enabled:synthesis},host:{sourceOnly:false},previousPresentation:null,result:null,hash:'a'.repeat(64)};
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,{value:'',classList:{contains:()=>false}});return elements.get(id);};
 const context=vm.createContext({...state,console,
  $:get,individualMode:()=>false,automaticMode:()=>false,compositeMode:()=>false,localMagnifier:()=>false,firstSourceFrame:{requestAnalysis:()=>false},comparisonRunNotice:()=>'',
  prepareEnergyRequest:()=>({params:{...context.scientific},presentation:{...context.presentation}}),energyContextSelection:()=>({}),effectiveElaParams:()=>({}),requestedBackend:()=> 'cpu',getAdaptivePreferenceStore:()=>({}),
  bindSourceRegionTask:async()=>({}),cancelSupersededLocalPreviews:()=>{},beginLocalPreviewFlight:()=>({progress:{}}),finishLocalPreviewFlight:()=>{},localPreviewContinuity:{snapshot:()=>({})},
  request:(action,payload)=>new Promise((resolve,reject)=>requests.push({action,payload,resolve,reject})),
  energyHeldOwners:{reset(){}},captureElaHeldOwner:()=>()=>true,energyHeldSettings:()=>({}),
  controls(){},retireResult(){},draw(){},status(){},t:x=>x,autoText:x=>x,diagnostic(){},refreshEnergyHistogram(){},sourceRegionCompletedStatus:()=> 'done',
  createPreviewSurface:pixels=>({...pixels}),observePreviewPresentation(){},observeLocalPreviewPaint:surface=>paint.push(surface),document:{},
  setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id),
  run:async()=>{runs.push({params:{...context.scientific},presentation:{...context.presentation},revision:context.revision,imageId:context.imageId});context.elaParameterDraft=false;context.elaPreviewCommit=false;},
 });
 new vm.Script(callbacks).runInContext(context);
 return{context,requests,runs,timers,paint,
  start:async()=>{context.queueElaParameterPreview();await drain();assert.equal(requests.length,1);},
  refresh:async(view='labels')=>{context.presentation={view,opacity:43};await context.refreshEnergyView();await drain();},
  settle:async(index=0,kind='resolve')=>{const row=requests[index];assert(row);if(kind==='cancel')row.reject(Object.assign(Error('Superseded preview'),{code:'CANCELLED'}));else row.resolve({pixels:{width:1,height:1,format:'rgb8',data:new Uint8Array(3)},draft:{params:row.payload.params},presentation:row.payload.presentation});await drain();},
  fire:async()=>{const batch=[...timers.values()];timers.clear();for(const fn of batch)await fn();await drain();}
 };
}

for(const synthesis of[false,true])for(const outcome of['resolve','cancel'])test(`${synthesis?'Synthèse':'normal'} final intent survives presentation changes and ${outcome} of the old proxy`,async()=>{
 const h=fixture({synthesis});await h.start();h.context.commitElaParameters();await h.refresh();assert.equal(h.context.elaPreviewCommit,true,'Presentation cannot reopen a committed scientific gesture');assert.equal(h.context.elaPreviewQueued,null);assert.equal(h.requests.length,1,'Do not enqueue another scientific proxy instead of the pending native result');h.context.queueAnalysis();assert.equal(h.timers.size,0,'A busy-flight wakeup may be dropped; final intent must remain reachable');await h.settle(0,outcome);assert.equal(h.context.elaPreviewBusy,false);assert.equal(h.context.elaPreviewCommit,true);assert.equal(h.timers.size,1);assert.equal(h.runs.length,0);assert.equal(h.paint.length,0,'The old-epoch proxy never paints after release');await h.fire();assert.equal(h.runs.length,1);assert.equal(h.runs[0].params.shadow,29);assert.equal(h.runs[0].presentation.view,'labels');assert.equal(h.context.elaParameterDraft,false);
});

test('a direct queued preview cannot revoke an existing final intent',async()=>{
 const h=fixture();await h.start();h.context.commitElaParameters();h.context.queueElaParameterPreview();assert.equal(h.context.elaPreviewCommit,true);assert.equal(h.context.elaPreviewQueued,null);await h.settle();await h.fire();assert.equal(h.runs.length,1);
});

test('presentation during an uncommitted gesture still replaces its proxy and waits for scientific release',async()=>{
 const h=fixture();await h.start();await h.refresh();assert.equal(h.context.elaPreviewCommit,false);assert(h.context.elaPreviewQueued);await h.settle(0,'cancel');assert.equal(h.requests.length,2);await h.settle(1);assert.equal(h.paint.length,1);assert.equal(h.runs.length,0);assert.equal(h.timers.size,0);h.context.commitElaParameters();await h.fire();assert.equal(h.runs.length,1);assert.equal(h.runs[0].presentation.view,'labels');
});

test('an actual new scientific intent may postpone the previous final until its own release',async()=>{
 const h=fixture();await h.start();h.context.commitElaParameters();await h.refresh();h.context.beginElaParameters({newIntent:true});h.context.scientific={quality:75,shadow:59};h.context.queueElaParameterPreview();assert.equal(h.context.elaPreviewCommit,false);await h.settle(0,'cancel');assert.equal(h.requests.length,2);await h.settle(1);assert.equal(h.timers.size,0);assert.equal(h.runs.length,0);h.context.commitElaParameters();await h.fire();assert.equal(h.runs.length,1);assert.equal(h.runs[0].params.shadow,59);
});

test('source/revision replacement discards the old flight without carrying its final into the new source',async()=>{
 const h=fixture();await h.start();h.context.commitElaParameters();await h.refresh();Object.assign(h.context,{revision:2,imageId:'source-2',fileInput:{},elaParameterDraft:false,elaPreviewCommit:false,elaPreviewQueued:null,elaPreviewBusy:false});await h.settle(0,'cancel');assert.equal(h.runs.length,0);assert.equal(h.timers.size,0);assert.equal(h.paint.length,0);assert.equal(h.context.imageId,'source-2');
});

test('a final queued for an old operation does not run after the selected operation changes',async()=>{
 const h=fixture();await h.start();h.context.commitElaParameters();await h.refresh();await h.settle();assert.equal(h.timers.size,1);h.context.activeAnalysis='inspection.adjust';await h.fire();assert.equal(h.runs.length,0);
});

for(const backend of['cpu','auto','webgpu'])test('the app selects the requested Energy preview backend '+backend,async()=>{
 const h=fixture();h.context.requestedBackend=task=>{assert.equal(task.operation,'ela.energy');assert.equal(task.params.shadow,29);return backend;};await h.start();assert.equal(h.requests[0].action,'preview-energy-parameters');assert.equal(h.requests[0].payload.backend,backend);await h.settle();assert.equal(h.runs.length,0);
});
