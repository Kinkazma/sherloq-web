import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createLocalHeldPreviewOwners} from '../sherloq-browser/assets/local-held-preview-owner.js';

// Exercise the real app scheduler, request cancellation and typed owners. Native
// computation and canvas drawing are controlled gates; time is entirely fake.
const app=await readFile(new URL('../sherloq-browser/assets/app.js',import.meta.url),'utf8');
const client=app.slice(app.indexOf('function requestElaMessage('),app.indexOf('let displayFramePending=',app.indexOf('function requestElaMessage(')));
const scheduler=app.slice(app.indexOf('function queueElaParameterPreview('),app.indexOf('function takeManualControl(',app.indexOf('function queueElaParameterPreview(')));
const commit=app.slice(app.indexOf('function commitElaParameters('),app.indexOf('async function estimateClassicAuto(',app.indexOf('function commitElaParameters(')));
const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};

function fixture(mode='biomes'){
 let now=0,timerId=0,intent=0,context;const timers=new Map(),requests=[],posts=[],shown=[],commits=[],diagnostics=[],nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='layer'?'result':'',disabled:false});return nodes.get(id);};
 const terminal=(id,value,error)=>{const entry=context.pending.get(id);if(!entry)return;context.pending.delete(id);error?entry.reject(error):entry.resolve(value);};
 const transport={postMessage(message){posts.push(message);if(message.action==='cancel-preview'){const running=requests.find(r=>r.id===message.id);if(running)running.aborted=true;terminal(message.id,null,Object.assign(Error('Cancelled'),{code:'CANCELLED'}));return;}
  const request={...structuredClone(message),aborted:false,reply(){terminal(message.id,{pixels:{width:2,height:1,format:'rgb8',data:Uint8Array.of(1,2,3,4,5,6),calculated:{...message.payload.params}},presentation:{params:{...message.payload.params}},draft:{params:{...message.payload.params}}});}};requests.push(request);
 }};
 const settings=action=>({action,mode:context.elaMode,params:{...context.values},presentation:{view:'overlay',opacity:70},context:{}});
 context=vm.createContext({
  loaded:true,worker:transport,getWorker:()=>transport,fileInput:{},source:{},destroyed:false,busy:false,energyViewBusy:false,elaPreviewBusy:false,
  elaParameterDraft:true,elaPreviewCommit:false,elaParameterKind:mode==='classic'?'classic':'energy',elaMode:mode,energyMode:mode!=='classic',revision:1,elaPreviewEpoch:1,elaPreviewVersion:0,elaPreviewQueued:null,
  imageId:'original',activeAnalysis:'ela.classic',hash:'a'.repeat(64),lastScientificEnergy:{id:'native-energy'},lastScientificClassic:{id:'native-classic'},resultMeta:{id:'native-energy'},values:{quality:75,block:16,minimum:1,profile:'manual',histogramLow:10,histogramHigh:990,shadow:50,highlight:50},
  elaHeldOwners:createLocalHeldPreviewOwners(),elaAdaptiveFeedback:null,synthesisState:{enabled:false},pending:new Map(),seq:0,
  energyHistogramJob:null,energyHistogramQueued:null,energyHistogramVersion:0,energyHistogramUI:{markers(){}},localPreviewFlight:null,
  localPreviewContinuity:{start:event=>event,snapshot:()=>({}),finish(){},reset(){}},sourceRegionsStale:false,
  elaBudgetTransition:null,elaBudgetOwner:null,retiringExportWorker:null,sourceEncodingFormat:'webp',elaWorkerOptions:()=>({}),
  sherloqDynamic:()=>false,individualMode:()=>false,automaticMode:()=>false,compositeMode:()=>false,
  requestedBackend:()=> 'auto',getAdaptivePreferenceStore:()=>({}),prepareEnergyRequest:()=>({params:{...context.values},presentation:{view:'overlay',opacity:70}}),effectiveElaParams:()=>({...context.values}),energyContextSelection:()=>({}),
  elaHeldSettings:settings,bindSourceRegionTask:async()=>({}),captureElaHeldOwner(){const source=context.source,mode=context.elaMode,epoch=context.elaPreviewEpoch;return()=>context.source===source&&context.elaMode===mode&&context.elaPreviewEpoch===epoch;},
  createPreviewSurface:pixels=>({width:pixels.width,height:pixels.height,calculated:pixels.calculated}),observePreviewPresentation(){},retireResult(){},
  result:null,document:{},$:node,controls(){},draw(){if(context.result)shown.push({layer:node('layer').value,calculated:{...context.result.calculated},final:context.result.final===true});},status(){},t:key=>key,autoText:fr=>fr,
  diagnostic:event=>diagnostics.push(event),performance:{now:()=>now},setTimeout(fn,milliseconds){timers.set(++timerId,{fn,at:now+milliseconds});return timerId;},clearTimeout:id=>timers.delete(id),
  finishElaParameters(){commits.push({...context.values});context.elaParameterDraft=false;context.elaPreviewCommit=false;context.result={calculated:{...context.values},final:true};context.draw();}
 });
 node('app').classList={contains:()=>false};vm.runInContext(client+'\n'+scheduler+'\n'+commit,context);
 const key=mode==='classic'?'quality':'histogramLow',field=mode==='classic'?'quality':'energy-histogramLow';
 return{context,requests,posts,shown,commits,diagnostics,
  async input(value){context.values[key]=value;context.revokeElaParameterPreview({retainOwned:true});context.queueElaParameterPreview({field,continuous:true,generation:1,gestureEpoch:1,controlRequestId:++intent});await drain();},
  advance(milliseconds){now+=milliseconds;for(const[id,timer]of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}},
  get timers(){return timers;},get key(){return key;},commit(){context.commitElaParameters();},
  revoke(mutate){mutate(context);context.cancelSupersededLocalPreviews({retainOwned:true});}
 };
}

test('a current first Biomes frame survives input drift past 300 ms, paints, then executes only the latest queued intention',async()=>{
 const h=fixture();await h.input(20);const first=h.requests[0];
 assert.equal(first.payload.preview.integerHalving,true,'Biomes carries its explicit half-grid permission');
 for(let value=21;value<=60;value++){h.advance(10);await h.input(value);}
 assert.equal(first.aborted,false);assert.equal(h.requests.length,1,'one active calculation while raw inputs replace its successor');assert.equal(h.timers.size,0);
 first.reply();await drain();assert.equal(h.shown[0].calculated.histogramLow,20);assert.equal(h.shown[0].final,false);assert.equal(h.shown[0].layer,'result');
 assert.deepEqual(h.requests.map(r=>r.payload.params.histogramLow),[20,60]);assert.equal(h.diagnostics.find(d=>d.kind==='ela.preview.displayed').latestRequestedParameters.histogramLow,60);
 h.requests[1].reply();await drain();assert.deepEqual(h.shown.map(s=>s.calculated.histogramLow),[20,60]);assert.equal(h.context.elaPreviewBusy,false);assert.equal(h.context.pending.size,0);
});

test('Biomes release revokes the intermediate reply, commits the latest exact parameters once and rejects a late old reply',async()=>{
 const h=fixture();await h.input(20);await h.input(60);const first=h.requests[0];h.commit();assert.equal(first.aborted,true);await drain();
 assert.equal(h.requests.length,1,'release discards the queued provisional intention');assert.equal(h.commits.length,1);assert.equal(h.commits[0].histogramLow,60);assert.equal(h.shown.length,1);assert.equal(h.shown[0].final,true);
 first.reply();await drain();assert.equal(h.shown.length,1);assert.equal(h.shown[0].calculated.histogramLow,60);assert.equal(h.context.pending.size,0);
});

for(const change of ['source','mode','second parameter'])test('a '+change+' change immediately cancels a Biomes frame and prevents stale publication',async()=>{
 const h=fixture();await h.input(20);const first=h.requests[0];
 h.revoke(c=>{if(change==='source')c.source={};else if(change==='mode')c.elaMode='scores';else c.values.highlight++;});
 assert.equal(first.aborted,true);first.reply();await drain();assert.deepEqual(h.shown,[]);assert.equal(h.context.pending.size,0);
});

for(const mode of ['classic'])test(mode+' keeps the existing 300 ms cancellation policy',async()=>{
 const h=fixture(mode);await h.input(20);h.advance(50);await h.input(60);assert.equal(h.timers.size,1);h.advance(249);assert.equal(h.requests[0].aborted,false);h.advance(1);assert.equal(h.requests[0].aborted,true);await drain();
 assert.equal(h.requests[0].payload.preview.integerHalving,undefined,'Other modes retain the default quality policy');
 assert.deepEqual(h.requests.map(r=>r.payload.params[h.key]),[20,60]);h.requests[1].reply();await drain();assert.equal(h.shown[0].calculated[h.key],60);assert.equal(h.context.pending.size,0);
});

test('a current Scores calculation also survives held input drift and keeps its default quality policy',async()=>{
 const h=fixture('scores');await h.input(20);const first=h.requests[0];
 for(let value=21;value<=60;value++){h.advance(10);await h.input(value);}
 assert.equal(first.aborted,false);assert.equal(h.timers.size,0);assert.equal(h.requests.length,1);assert.equal(first.payload.preview.integerHalving,undefined);
 first.reply();await drain();assert.deepEqual(h.requests.map(r=>r.payload.params.histogramLow),[20,60]);h.requests[1].reply();await drain();assert.deepEqual(h.shown.map(s=>s.calculated.histogramLow),[20,60]);assert.equal(h.context.pending.size,0);
});

test('release immediately revokes a pending Scores parameter frame and commits the latest parameters once',async()=>{
 const h=fixture('scores');await h.input(20);await h.input(60);const first=h.requests[0];h.commit();assert.equal(first.aborted,true);await drain();assert.equal(h.requests.length,1);assert.equal(h.commits.length,1);assert.equal(h.commits[0].histogramLow,60);first.reply();await drain();assert.equal(h.shown.length,1);assert.equal(h.shown[0].final,true);assert.equal(h.context.pending.size,0);
});

test('an ancillary histogram still cancels immediately while the current Biomes calculation finishes',async()=>{
 const h=fixture();await h.input(20);const first=h.requests[0],histogram=h.context.request('energy-histogram',{resultId:'native-energy'});const rejected=assert.rejects(histogram,{code:'CANCELLED'});
 await h.input(60);await rejected;h.advance(400);assert.equal(first.aborted,false);assert.equal(h.posts.filter(p=>p.action==='cancel-preview').length,1);assert.equal(h.requests[1].action,'energy-histogram');
 first.reply();await drain();assert.equal(h.requests[2].payload.params.histogramLow,60);h.requests[2].reply();await drain();assert.equal(h.context.pending.size,0);
});

test('a coalesced Biomes successor takes the latest painted feedback at dispatch without waiting for another frame',async()=>{
 const h=fixture();await h.input(20);h.context.elaAdaptiveFeedback={schema:'adaptive-preview-feedback/1',key:'biomes',calibration:{lastId:1}};await h.input(60);
 const latest={schema:'adaptive-preview-feedback/1',key:'biomes',calibration:{lastId:2}};h.context.elaAdaptiveFeedback=latest;
 h.requests[0].reply();await drain();assert.equal(h.requests.length,2);assert.deepEqual(h.requests[1].payload.preview.adaptiveFeedback,latest);assert.equal(h.requests[1].payload.params.histogramLow,60);assert.equal(h.timers.size,0);
 h.requests[1].reply();await drain();assert.equal(h.context.pending.size,0);
});
