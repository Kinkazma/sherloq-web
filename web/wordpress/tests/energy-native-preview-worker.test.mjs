// Exercise the current worker run/retirement branches, with controlled owners.
// Candidate identity and scientific equality belong to the candidate/Core tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {EngineError,serializeEngineError} from '../sherloq-browser/assets/unified-engine/src/errors.js';
import {energyFrameBudget,assertEnergyFrameBudget} from '../sherloq-browser/assets/energy-frame-budget.js';

const source=await readFile(new URL('../sherloq-browser/assets/engine-worker.js',import.meta.url),'utf8');
function part(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,'The real worker raccord must remain present: '+start);return source.slice(a,b);}
const runStart="  }else if(action==='run'){",run=part(runStart,"  }else throw Error('Unknown worker action');").slice(runStart.length);
const display=part('function resultDisplay(','function energySourceDescriptor(');
const energyRetirement=part('const energyRetirements=new WeakMap();','function retainResultSource(');
const candidateRetirement=part('async function retireNormalNative(','async function renderNormalNativePreview(');
const candidateRender=part('async function renderNormalNativePreview(','function normalNativeCandidate(');
const turn=()=>new Promise(setImmediate);
function gate(){let resolve;return{promise:new Promise(r=>resolve=r),resolve};}

function fixture({receipt=true,proof=true,takeHook,disposeHook,releaseHook,publishHook,retireHook,aborted=false}={}){
 const width=64,height=48,n=width*height,params={quality:75,block:16,minimum:3,profile:'manual',histogramLow:10,histogramHigh:990,shadow:80,highlight:50},presentation={view:'labels'},backend='webgpu';
 const original={id:'original',sha256:'a'.repeat(64),width,height,surface:{id:'source',revision:1,width,height,format:'rgb8'}};
 const analysis=id=>({id,imageId:'original',operation:'ela.energy',layout:'surface',surface:{id:id+'-low',revision:1,width,height,format:'float32'},planeSurfaces:{energy_low_score:{id:id+'-low'},energy_high_score:{id:id+'-high'}},provenance:{originalSha256:original.sha256,params:{...params},backend},data:{width,height,metadata:{method:'ela_energy',energy:{quantiles:[.01,.99],thresholds:[8,5]}},regions:[{id:1,area:n}],regionColors:[{id:1,rgb:[1,2,3]}]},metrics:{energyRecompressions:3,energyPreparationMs:2,energySegmentationMs:1}});
 const previous=analysis('previous'),candidate=analysis('candidate'),ordinary=analysis('ordinary'),nativeData=Uint8Array.from({length:n*3},(_,i)=>i%251),previewPixels={width,height,format:'rgb8',data:nativeData,preview:true,presentation:{...presentation,preview:true}},nativePixels={...previewPixels,preview:false,presentation:{...presentation,preview:false,exact:true}},freshPixels={width,height,format:'rgb8',data:new Uint8Array(n*3).fill(31),presentation:{...presentation}};
 const audit={takes:[],runs:[],disposals:0,releaseAttempts:0,releaseAcks:0,renders:0,publishes:0,surfaceReleases:[],retirements:0},pending=new Set(),adopted=new WeakMap(),controller=new AbortController();if(aborted)controller.abort();
 const adoption={output:candidate,pixels:proof?nativePixels:null,async release(){audit.releaseAttempts++;await releaseHook?.(audit.releaseAttempts);audit.releaseAcks++;}};
 const owner={async take(request){audit.takes.push(request);await takeHook?.(request);return receipt?adoption:null;},async dispose(){audit.disposals++;await disposeHook?.(audit.disposals);}};
 const ctx=vm.createContext({EngineError,serializeEngineError,energyFrameBudget,assertEnergyFrameBudget,Number,Math,Uint8Array,Map,Set,WeakMap,Promise,controller,previewNow:()=>17,consumerBudget:32*1024**2,descriptors:new Map([['original',original]]),lastEnergy:previous,lastClassic:null,lastPixels:previewPixels,displayRevision:0,parameterDraft:true,parameterDraftKind:'energy',parameterPreview:null,histogramOwner:null,successfulSynthesisEnergyCohort:null,normalNativePreview:owner,normalNativeRetirements:pending,adoptedNormalNativeOwners:adopted,contextEnergyView:null,energyContextKey:null,energyMaxima:{},energySignedRanges:{},resultSourceOwners:[],engine:{capabilities:()=>({memory:{budgetBytes:1024}}),async run(task){audit.runs.push(task);return ordinary;},async releaseSurface(id){audit.surfaceReleases.push(id);}},compileOriginalSourceRegions:async value=>value,sourceRegionDomainShape:()=> 'identity',synthesisEnergyRequestCohort:()=>null,verifiedSynthesisEnergyCohort:()=>null,async retireSynthesisEnergyOwners(){audit.retirements++;await retireHook?.();},async retireEnergyExports(){},async releaseRetiredResultSources(){},async energyView(){audit.renders++;return freshPixels;},async releaseClassicSurface(){audit.publishes++;await publishHook?.();},async releaseClassicOwner(){},retainResultSource(){},runSynthesisTask(){throw Error('This normal Energy fixture must not run Synthèse');},cancelled:()=>new EngineError('CANCELLED','Cancelled'),self:{postMessage(){}}});
 new vm.Script(display+energyRetirement+candidateRetirement+`\nasync function dispatch(payload){let result,nextSuccessfulEnergyCohort;const id=1;${run}\nreturn result;}\nglobalThis.dispatch=dispatch;globalThis.state=()=>({lastEnergy,lastPixels,parameterDraft,parameterDraftKind,pending:normalNativeRetirements.size,adopted:adoptedNormalNativeOwners.has(lastEnergy)});`).runInContext(ctx);
 const payload={id:'commit',imageId:'original',operation:'ela.energy',params,presentation,backend};
 return{ctx,audit,payload,previous,candidate,ordinary,previewPixels,nativePixels,freshPixels,nativeData,pending,adopted,adoption,run:()=>ctx.dispatch(payload),state:()=>ctx.state()};
}

test('run consumes an owner take receipt, reuses its proved RGB and clears exports only after publication',async()=>{
 const disposing=gate(),disposeAck=gate(),publishing=gate(),publishAck=gate(),h=fixture({disposeHook:async()=>{disposing.resolve();await disposeAck.promise;},publishHook:async()=>{publishing.resolve();await publishAck.promise;}});let done=false;
 const task=h.run().then(value=>{done=true;return value;});await disposing.promise;
 assert.equal(done,false);assert.equal(h.state().parameterDraft,true);assert.equal(h.state().lastEnergy,h.previous);assert.equal(h.audit.runs.length,0);assert.equal(h.audit.takes.length,1);
 const request=h.audit.takes[0];assert.equal(request.analysis,h.previous);assert.equal(request.params,h.payload.params);assert.equal(request.presentation,h.payload.presentation);assert.equal(request.pixels,h.previewPixels);assert.equal(request.backend,'webgpu');assert.equal(request.domain,null);
 disposeAck.resolve();await publishing.promise;assert.equal(h.state().lastEnergy.data,h.candidate.data);assert.equal(h.state().lastPixels,h.nativePixels);assert.equal(h.state().parameterDraft,true,'A constructed display is not yet successful publication');assert.equal(done,false);
 publishAck.resolve();const answer=await task;assert.equal(h.audit.runs.length,0);assert.equal(h.audit.renders,0);assert.equal(h.audit.disposals,1);assert.equal(h.audit.releaseAttempts,0,'Taking transfers the candidate instead of retiring its surfaces');assert.equal(h.state().parameterDraft,false);assert.equal(h.state().parameterDraftKind,null);assert.equal(answer.id,h.candidate.id);assert.equal(answer.display.preview,undefined);assert.equal(answer.metrics.promotedPreview,true);assert.equal(answer.metrics.nativeAnalysisRequests,0);assert.equal(answer.metrics.cache.previewExact,true);assert.equal(h.state().lastPixels.data,h.nativeData);assert.equal(h.state().adopted,true);assert(!h.audit.surfaceReleases.some(id=>id.startsWith('candidate')));
});

test('take mismatch runs the ordinary engine task and never marks that result as a promoted preview',async()=>{
 const h=fixture({receipt:false}),answer=await h.run();assert.equal(h.audit.takes.length,1);assert.equal(h.audit.runs.length,1);assert.equal(h.audit.runs[0].id,'commit');assert.equal(h.audit.runs[0].operation,'ela.energy');assert.equal(h.audit.runs[0].params,h.payload.params);assert.equal(h.audit.runs[0].backend,'webgpu');assert.equal(h.audit.renders,1);assert.equal(h.audit.disposals,1);assert.equal(h.audit.releaseAttempts,0);assert.equal(answer.id,h.ordinary.id);assert.equal(answer.metrics.promotedPreview,undefined);assert.equal(h.state().parameterDraft,false);assert.equal(h.state().lastPixels,h.freshPixels);assert.equal(h.state().adopted,false);
});
test('a run for another loaded source cannot take the previous source candidate',async()=>{
 const h=fixture(),other={id:'other',sha256:'b'.repeat(64),width:64,height:48,surface:{id:'other-source',revision:1,width:64,height:48,format:'rgb8'}};h.ctx.descriptors.set('other',other);h.payload.imageId='other';h.ordinary.imageId='other';h.ordinary.provenance.originalSha256=other.sha256;const answer=await h.run();assert.equal(h.audit.takes.length,0);assert.equal(h.audit.runs.length,1);assert.equal(h.audit.runs[0].imageId,'other');assert.equal(answer.metrics.promotedPreview,undefined);assert.equal(answer.imageId,'other');
});

test('a native take without RGB proof reuses science but renders the exact native view again',async()=>{
 const h=fixture({proof:false}),answer=await h.run();assert.equal(h.audit.runs.length,0);assert.equal(h.audit.renders,1);assert.equal(h.state().lastEnergy.data,h.candidate.data);assert.equal(h.state().lastPixels,h.freshPixels);assert.equal(answer.metrics.promotedPreview,true);assert.equal(h.state().parameterDraft,false);
});

test('take rejection preserves the primary and leaves provisional exports guarded',async()=>{
 const primary=Object.freeze(new EngineError('STALE_RESULT','Controlled take rejection')),h=fixture({takeHook:()=>{throw primary;}});await assert.rejects(h.run(),error=>error===primary);assert.equal(h.audit.runs.length,0);assert.equal(h.audit.disposals,0);assert.equal(h.audit.releaseAttempts,0);assert.equal(h.state().lastEnergy,h.previous);assert.equal(h.state().parameterDraft,true);assert.equal(h.state().parameterDraftKind,'energy');
});

test('a taken candidate waits for its release ACK when preview disposal prevents adoption',async()=>{
 const primary=Object.freeze(new EngineError('STORAGE_IO','Controlled preview disposal rejection')),releasing=gate(),releaseAck=gate(),h=fixture({disposeHook:()=>{throw primary;},releaseHook:async()=>{releasing.resolve();await releaseAck.promise;}});let done=false;
 const task=h.run();task.then(()=>{done=true;},()=>{done=true;});await releasing.promise;assert.equal(done,false);assert.equal(h.audit.runs.length,0);assert.equal(h.audit.releaseAttempts,1);assert.equal(h.audit.releaseAcks,0);assert.equal(h.pending.size,1);assert.equal(h.state().parameterDraft,true);releaseAck.resolve();await assert.rejects(task,error=>error===primary);assert.equal(h.audit.releaseAcks,1);assert.equal(h.pending.size,0);assert.equal(h.state().lastEnergy,h.previous);
});

test('failed publication retires the adopted owner through its ACK and keeps export guards dirty',async()=>{
 const primary=Object.freeze(new EngineError('STORAGE_IO','Controlled publication rejection')),releasing=gate(),releaseAck=gate(),h=fixture({publishHook:()=>{throw primary;},releaseHook:async()=>{releasing.resolve();await releaseAck.promise;}});let done=false;
 const task=h.run();task.then(()=>{done=true;},()=>{done=true;});await releasing.promise;assert.equal(done,false);assert.equal(h.state().lastEnergy.data,h.candidate.data);assert.equal(h.state().parameterDraft,true);assert.equal(h.audit.releaseAttempts,1);assert.equal(h.audit.releaseAcks,0);assert.equal(h.pending.size,1);assert.equal(h.adopted.has(h.state().lastEnergy),true);assert(!h.audit.surfaceReleases.some(id=>id.startsWith('candidate')));releaseAck.resolve();await assert.rejects(task,error=>error===primary);assert.equal(h.audit.runs.length,0);assert.equal(h.audit.releaseAcks,1);assert.equal(h.pending.size,0);assert.equal(h.adopted.has(h.candidate),false);assert.equal(h.state().lastEnergy,null);assert.equal(h.state().parameterDraft,true);
});

test('refused adoption cleanup preserves its retry handle until a later owner disposal ACK',async()=>{
 const primary=Object.freeze(new EngineError('STORAGE_IO','Controlled preview disposal rejection')),cleanup=Object.freeze(new EngineError('BUSY','Controlled candidate retirement rejection')),releasing=gate(),releaseAck=gate(),h=fixture({disposeHook:attempt=>{if(attempt===1)throw primary;},releaseHook:async attempt=>{if(attempt===1)throw cleanup;releasing.resolve();await releaseAck.promise;}});
 await assert.rejects(h.run(),error=>error===primary);assert.equal(h.pending.size,1);assert.equal(h.audit.releaseAcks,0);assert.equal(h.state().parameterDraft,true);let done=false;const retry=h.ctx.disposeNormalNativePreview().then(()=>{done=true;});await releasing.promise;await turn();assert.equal(done,false);assert.equal(h.audit.releaseAttempts,2);assert.equal(h.audit.disposals,1,'Retry drains the candidate before closing its preview owner');releaseAck.resolve();await retry;assert.equal(h.pending.size,0);assert.equal(h.audit.releaseAcks,1);assert.equal(h.audit.disposals,2);assert.equal(h.audit.runs.length,0);
});
test('falsy publication primaries survive a rejected adoption cleanup and retain its retry debt',async()=>{
 for(const primary of [0,false,null,undefined]){const cleanup=new EngineError('BUSY','Controlled cleanup refusal'),h=fixture({publishHook:()=>{throw primary;},releaseHook:attempt=>{if(attempt===1)throw cleanup;}});await assert.rejects(h.run(),error=>error===primary);assert.equal(h.pending.size,1);assert.equal(h.state().parameterDraft,true);assert.equal(h.audit.releaseAcks,0);await h.ctx.disposeNormalNativePreview();assert.equal(h.pending.size,0);assert.equal(h.audit.releaseAcks,1);assert.equal(h.audit.runs.length,0);}
});
test('the candidate renderer uses the existing contiguous or surface Energy renderer according to its output',async()=>{
 const calls=[],controller=new AbortController(),engine={},desc={width:80,height:80,surface:{id:'source',revision:1}};const ctx=vm.createContext({engine,ADAPTIVE_PREVIEW_MAX_PIXELS:4096**2,consumerBudget:1024**2,lastPixels:null,energyFrameBudget,assertEnergyFrameBudget,energySourceDescriptor:()=>desc,renderEnergy:async(data,_source,view,options)=>{calls.push(['contiguous',data,view,options]);return{kind:'contiguous'};},renderEnergySurface:async(analysis,_source,view,options)=>{calls.push(['surface',analysis,view,options]);return{kind:'surface'};}});new vm.Script(candidateRender).runInContext(ctx);const contig={data:{width:80,height:80}},surface={data:contig.data,planeSurfaces:{energy_low_score:{id:'low'}}},view={view:'overlay'};assert.equal((await ctx.renderNormalNativePreview(contig,view,{signal:controller.signal})).kind,'contiguous');assert.equal((await ctx.renderNormalNativePreview(surface,view,{signal:controller.signal})).kind,'surface');assert.equal(calls[0][1],contig.data);assert.equal(calls[1][1],surface);assert.equal(calls[0][3].signal,controller.signal);assert.equal(calls[1][3].signal,controller.signal);
});
