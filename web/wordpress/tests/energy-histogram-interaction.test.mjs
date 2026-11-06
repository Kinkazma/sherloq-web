import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {EngineError,serializeEngineError,deserializeEngineError,normalizeResourceError} from '../../engine-source/src/errors.js';
import {installWorkerMessageProtocol,workerMessageFailure} from '../../engine-source/src/worker-message-protocol.js';

// Execute the actual app request/cancellation/histogram functions and the actual
// worker dispatcher. Only native readers and pixel painting are replaced.
const appURL=new URL('../sherloq-browser/assets/app.js',import.meta.url),workerURL=new URL('../sherloq-browser/assets/engine-worker.js',import.meta.url),app=await readFile(appURL,'utf8'),worker=await readFile(workerURL,'utf8');
const clientCode=app.slice(app.indexOf('function requestElaMessage('),app.indexOf('let displayFramePending=',app.indexOf('function requestElaMessage(')));
const histogramCode=app.slice(app.indexOf('function hasRetainedEnergy()'),app.indexOf("$('ela-mode').onchange=",app.indexOf('function hasRetainedEnergy()')));
const provisional=worker.match(/const PROVISIONAL_ACTIONS=new Set\([^\n]+\);/)[0],dispatcher=worker.slice(worker.indexOf('async function handle(')).replaceAll('import.meta.url',JSON.stringify(workerURL.href));
const turn=()=>new Promise(setImmediate),gate=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
const sha='a'.repeat(64);

function fixture({heldHistogram=false,heldView=false,deferHistogramReply=false,histogramFailure=false}={}){
 const events=[],posts=[],terminal=[],heldReplies=[],updates=[],markers=[],nodes=new Map(),histogramGate=gate(),viewGate=gate(),raw={low:Float32Array.of(1,2),high:Float32Array.of(3,4),scope:Int32Array.of(1,1)},native={id:'native-energy',imageId:'original',data:raw},audit={histograms:0,viewCalls:0,destroyed:0,workingReaders:0};let appContext,workerContext;
 const histogram=()=>({source:{resultId:native.id,imageId:native.imageId,sourceSha256:sha},selection:{referencePanelId:1,qualityIndex:0},scores:{count:2},reference:{count:2}});
 const deliver=message=>{const call=appContext.pending.get(message.id);if(!call)return;appContext.pending.delete(message.id);message.error?call.reject(deserializeEngineError(message.error)):call.resolve(message.result);};
 const endpoint={postMessage(message){terminal.push(message);if(deferHistogramReply&&posts.find(p=>p.id===message.id&&p.action==='energy-histogram'))heldReplies.push(message);else deliver(message);}};
 workerContext=vm.createContext({parentBudgetGrant:null,engine:{capabilities:()=>({}),dispose(){audit.destroyed++;},unload(){audit.destroyed++;},releaseSurface(){audit.destroyed++;}},lastEnergy:native,lastClassic:null,lastPixels:null,parameterDraft:false,parameterDraftKind:null,controller:null,queue:Promise.resolve(),failed:false,activeCommand:null,cancelledPreviewCommands:new Set(),acks:new Map(),self:endpoint,AbortController,Uint8Array,URL,EngineError,serializeEngineError,deserializeEngineError,normalizeResourceError,installWorkerMessageProtocol,workerMessageFailure,cancelled:()=>new EngineError('CANCELLED','Cancelled'),energySourceDescriptor:()=>({id:'source'}),isEnergyContextCollection:()=>false,energyHistogramAnalysis:analysis=>analysis,energyContextOptions:()=>({}),nativeEnergyHistogram:()=>({async get(analysis,options){audit.histograms++;assert.equal(analysis,native);audit.workingReaders++;audit.histogramSignal=options.signal;try{if(heldHistogram)await histogramGate.promise;if(histogramFailure)throw new EngineError('COMPUTE_FAILED','Late histogram failure');return histogram();}finally{audit.workingReaders--;}}}),async energyView(_presentation,preview){audit.viewCalls++;audit.viewSignal=workerContext.controller.signal;if(heldView)await viewGate.promise;return{width:2,height:1,data:Uint8Array.of(1,2,3,4,5,6),preview:!!preview};},immutablePreviewPixels:pixels=>({...pixels,data:pixels.data.slice()}),resultDisplay:pixels=>({id:'retained-view',width:pixels.width,height:pixels.height,preview:pixels.preview})});
 vm.runInContext(provisional+'\n'+dispatcher,workerContext);
 const transport={postMessage(message){posts.push(message);workerContext.self.onmessage({data:message});},terminate(){audit.destroyed++;}},timers=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='compute-profile'?'maximum':0,textContent:'ready'});return nodes.get(id);};
 appContext=vm.createContext({elaBudgetTransition:null,elaBudgetOwner:null,sourceEncodingFormat:'png',destroyed:false,prepareElaParentBudget:async()=>false,elaWorkerOptions:()=>({}),worker:transport,getWorker:()=>transport,loaded:true,pending:new Map(),seq:0,energyMode:true,elaMode:'biomes',imageId:'original',hash:sha,resultMeta:{id:native.id,operation:'ela.energy',data:{metadata:{}}},lastScientificEnergy:{id:native.id},energyHistogramJob:null,energyHistogramQueued:null,energyHistogramVersion:0,energyHistogramKey:'',energyHistogramUI:{selected:()=>({referencePanelId:1,qualityIndex:0}),update:answer=>updates.push(answer),markers:(...args)=>markers.push(args)},revision:1,busy:false,gestureActive:false,elaProvisional:()=>appContext.gestureActive,energyContextSelection:()=>({}),prepareEnergyRequest:()=>({params:{profile:'standard'}}),retiringExportWorker:null,individualMode:()=>false,automaticMode:()=>false,uiRGBBudget:1024,tileCache:{limit:0},devicePixelRatio:1,navigator:{hardwareConcurrency:1},performance:{now:()=>100},setTimeout:(fn,milliseconds)=>{timers.push({fn,milliseconds});return timers.length;},clearTimeout(){},localPreviewFlight:null,localPreviewContinuity:{reset(){}},controls(){},diagnostic:value=>events.push(value),$:node,t:key=>key,EngineError,serializeEngineError});
 // This interaction fixture starts with its retained native frame already painted.
 appContext.result=appContext.presentedSurface={previewOnly:false};
 vm.runInContext(clientCode+'\n'+histogramCode,appContext);
 return{appContext,workerContext,events,posts,terminal,updates,markers,nodes,timers,native,raw,audit,histogramGate,viewGate,
  refresh:()=>appContext.refreshEnergyHistogram(),request:(action,payload)=>appContext.request(action,payload),
  begin(retainOwned=false){appContext.gestureActive=true;if(retainOwned)appContext.localPreviewFlight={frame:{isCurrent:()=>true},timer:null,started:0};appContext.cancelSupersededLocalPreviews({retainOwned});},
  async commit(){appContext.gestureActive=false;await appContext.request('view-energy',{resultId:native.id,presentation:{view:'overlay'}});appContext.refreshEnergyHistogram();await turn();await turn();},
  flushReply(){for(const message of heldReplies.splice(0))deliver(message);},
  verifyNative(){assert.equal(workerContext.lastEnergy,native);assert.deepEqual(raw.low,Float32Array.of(1,2));assert.deepEqual(raw.high,Float32Array.of(3,4));assert.deepEqual(raw.scope,Int32Array.of(1,1));assert.equal(audit.destroyed,0);assert.equal(audit.workingReaders,0);assert.equal(appContext.pending.size,0);}
 };
}

test('an active histogram yields before the retained proxy grace, waits reader ACK, preserves native fields and resumes after commit',async()=>{
 const h=fixture({heldHistogram:true});h.refresh();await turn();assert.equal(h.audit.histograms,1);const histogramId=h.posts.find(p=>p.action==='energy-histogram').id;
 h.begin(true);assert(h.audit.histogramSignal.aborted);assert(h.posts.some(p=>p.action==='cancel-preview'&&p.id===histogramId));assert.equal(h.events.filter(e=>e.kind==='ela.histogram.cancel').length,1);assert.equal(h.timers.length,1);assert.equal(h.timers[0].milliseconds,200);
 const preview=h.request('view-energy',{resultId:h.native.id,presentation:{view:'overlay'},preview:{maxWidth:2,maxHeight:1}});await turn();assert.equal(h.audit.viewCalls,0,'Preview waits the cancelled native reader ACK, not a destroyed worker');
 h.histogramGate.resolve();await preview;await turn();assert.equal(h.terminal.find(r=>r.id===histogramId).error.code,'CANCELLED');assert.equal(h.updates.length,0);assert.equal(h.audit.viewCalls,1);
 await h.commit();assert.equal(h.audit.histograms,2);assert.equal(h.updates.length,1);assert.equal(h.events.filter(e=>e.kind==='ela.histogram.native').length,1);h.verifyNative();
});

test('a queued histogram is skipped without aborting an earlier unrelated exact view',async()=>{
 const h=fixture({heldView:true}),exact=h.request('view-energy',{resultId:h.native.id,presentation:{view:'overlay'}});await turn();h.refresh();h.begin();assert.equal(h.audit.viewSignal.aborted,false);h.viewGate.resolve();await exact;await turn();assert.equal(h.audit.histograms,0);assert.equal(h.updates.length,0);assert(h.terminal.some(r=>r.error?.code==='CANCELLED'));
 await h.commit();assert.equal(h.audit.histograms,1);assert.equal(h.updates.length,1);h.verifyNative();
});

for(const histogramFailure of [false,true])test('a late '+(histogramFailure?'error':'successful histogram')+' cannot publish after gesture revocation',async()=>{
 const h=fixture({deferHistogramReply:true,histogramFailure});h.refresh();await turn();assert.equal(h.terminal.length,1);h.begin();h.flushReply();await turn();assert.equal(h.updates.length,0);assert.equal(h.nodes.get('energy-histogram-status')?.textContent??'ready','ready');assert.equal(h.events.filter(e=>e.kind==='ela.histogram.error').length,0);assert.equal(h.appContext.energyHistogramJob,null);h.verifyNative();
});
