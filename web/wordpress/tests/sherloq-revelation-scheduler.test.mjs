import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

// Protocol only: actual Source app functions, no pixels or engine.
const appURL=new URL('../sherloq-browser/assets/app.js',import.meta.url),original=await readFile(appURL,'utf8'),appText=original,spec={source:appURL.pathname};
function fragment(name,next){const a=appText.indexOf('function '+name+'('),b=appText.indexOf('\nfunction '+next+'(',a);assert.ok(a>=0&&b>a,name);return appText.slice(a,b);}
const a=appText.indexOf('let sherloqGeneration=0,'),b=appText.indexOf('\n\n',a),scheduler=appText.slice(a,b),owner=['sourceRegionTaskIdentity','sourceRegionTaskIsCurrent'].map(name=>appText.split('\n').find(line=>line.startsWith('function '+name+'('))).join('\n');
const revoke=appText.split('\n').find(line=>line.startsWith('function revokeFinalDepthResults('))+'\n'+appText.slice(appText.indexOf('function revokeFinalDepthResults(')+appText.slice(appText.indexOf('function revokeFinalDepthResults(')).indexOf('\n')+1,appText.indexOf('\n}',appText.indexOf('function revokeFinalDepthResults('))+2);
const paint=fragment('reportPreparedMagnifierPainted','beginSourceFrame');
const drawGuard=appText.split('\n').find(line=>line.includes('if(nextSurface?.sherloqToken&&'));
assert.ok(drawGuard?.includes('sherloqPresentationCurrent'));
const stopStart=appText.indexOf('function stop('),stopPrefix=appText.slice(appText.indexOf('){',stopStart)+2,appText.indexOf('firstSourceFrame.clear();',stopStart));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({equalized=false,classic=false,operation:requestedOperation}={}){
 if(classic)equalized=true;
 let c;const bank={generation:0},jobs=[],calls=[],frames=new Map(),settings=equalized?{equalization:{method:'sherloq7c',values:[0,25],sherloq7c:{micro:100,precision:'1e-2',maxSide:'native',computationMode:'fast',backend:'auto'}}}:{revelation:25,micro:100,precision:'1e-2',maxSide:'native',computationMode:'fast'},operation=requestedOperation??(classic?'ela.classic':equalized?'inspection.magnifier':'inspection.sherloq7c');let visible=true,nextFrame=0;
 c=vm.createContext({Promise,JSON,Math,Object,Number,Map,Set,WeakMap,WeakSet,Error,structuredClone,performance,setTimeout,clearTimeout,
  destroyed:false,fileInput:{name:'protocol-owner'},imageId:'original-id',hash:'original-sha',revision:0,source:{id:'original-surface'},activeAnalysis:operation,params:classic?settings:{},regions:[],regionController:{scope:{fingerprint:'scope'}},sourceRegionsLocalOverride:false,sourceRegionsSnapshot:()=>null,currentCloneWindowMode:()=> 'independent',currentWorkingDepth:()=>16,
  individualMode:()=>!classic,energyMode:false,synthesisState:{enabled:false},individualUI:{serialize:()=>({[c.activeAnalysis]:settings,uiOptions:{}}),backend:()=> 'auto',taskOptions:()=>({}),sherloqDynamic:true},equalizationMethods:[{id:'histogram'},{id:'sherloq7c'}],
  busy:false,energyViewBusy:false,elaPreviewBusy:false,individualCancelled:false,individualClient:{cancel:()=>calls.push('cancel'),invalidateFinalDepthResults:reason=>{bank.generation++;calls.push({kind:'bank.invalidate',reason,generation:bank.generation});}},worker:null,diagnostic:event=>calls.push(event),controls:()=>{},result:null,resultMeta:null,presentedSurface:null,previousPresentation:null,
  selectedSurface:()=>c.result,document:{hidden:false},host:{visible:()=>visible,onToolPresented:()=>calls.push('tool-ack')},presentedFrameOwners:new WeakMap(),acknowledgedToolFrames:new WeakSet(),preparedMagnifierPaintTicket:null,firstSourceFrame:{pending:()=>false,background:()=>{}},nativeMagnifierPublished:()=>false,
  requestAnimationFrame:fn=>{const id=++nextFrame;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
  runNow:async()=>{const token=c.__scheduler.current();if(classic)c.revision++;assert.equal(c.bindSherloqTask({id:'result-'+(jobs.length+1)},c.sourceRegionTaskIdentity()),true);let complete;const pending=new Promise(resolve=>complete=resolve);const job={token,complete,bankGeneration:bank.generation};jobs.push(job);c.busy=true;await pending;c.busy=false;c.result={sherloqToken:token};c.resultMeta={id:token.taskId,status:'ok'};}
 });
 new vm.Script(owner+'\n'+scheduler+'\n'+revoke+'\n'+paint+'\nglobalThis.__scheduler={current:()=>sherloqCurrent,pending:()=>sherloqPending,stats:()=>sherloqSchedule,generation:()=>sherloqGeneration,stop:()=>{'+stopPrefix+'}};',{filename:spec.source+'#scheduler-patch-protocol'}).runInContext(c);
 const value=n=>{if(equalized)settings.equalization.values[1]=n;else settings.revelation=n;};
 return{c,bank,jobs,calls,settings,value,setVisible:v=>visible=v,async paint(){const frame=c.result;c.presentedSurface=frame;c.presentedFrameOwners.set(frame,()=>true);c.reportPreparedMagnifierPainted(frame);for(const [id,fn]of [...frames]){frames.delete(id);fn();}await new Promise(resolve=>setTimeout(resolve,0));await tick();},guard(frame){c.nextSurface=frame;new vm.Script(drawGuard).runInContext(c);return c.nextSurface;}};
}

test('revelation-only drag publishes its completed intermediate and waits for actual post-rAF ACK before latest',async()=>{
 const h=fixture(),p=h.c.requestSherloq();assert.equal(h.jobs.length,1);h.value(50);h.c.requestSherloq();h.value(75);h.c.requestSherloq();assert.equal(h.calls.filter(x=>x==='cancel').length,0);
 h.jobs[0].complete();await tick();assert.equal(h.jobs.length,1,'next computation must not retire the unpainted result');assert.equal(h.c.__scheduler.stats().published,1);assert.equal(h.c.__scheduler.stats().discarded,0);assert.equal(h.guard(h.c.result),h.c.result,'actual draw generation gate accepts same-family intermediate');assert.equal(h.jobs[0].token.requestedSnapshot.revelation,25);
 await h.paint();assert.equal(h.jobs.length,2);assert.equal(h.jobs[1].token.requestedSnapshot.revelation,75,'only the latest pending value runs');h.jobs[1].complete();await tick();await h.paint();await p;assert.equal(h.c.__scheduler.stats().published,2);assert.equal(h.c.__scheduler.stats().discarded,0);assert.equal(h.calls.filter(x=>x?.kind==='sherloq.latest.presentation-ack').length,2);
});
test('returning to active revelation replaces a different pending value and ends at the released value',async()=>{
 const h=fixture(),p=h.c.requestSherloq();h.value(50);h.c.requestSherloq();h.value(25);h.c.requestSherloq();h.jobs[0].complete();await tick();await h.paint();assert.equal(h.jobs[1].token.requestedSnapshot.revelation,25);h.jobs[1].complete();await tick();await h.paint();await p;
});
test('microcontrast change cancels active work and rejects its stale publication',async()=>{
 const h=fixture(),p=h.c.requestSherloq();h.settings.micro=99;h.c.requestSherloq();assert.equal(h.jobs[0].token.cancelled,true);assert.equal(h.calls.filter(x=>x==='cancel').length,1);h.jobs[0].complete();await tick();assert.equal(h.c.__scheduler.stats().discarded,1);assert.equal(h.jobs.length,2);assert.equal(h.guard({sherloqToken:h.jobs[0].token}),null);h.jobs[1].complete();await tick();await h.paint();await p;assert.equal(h.c.__scheduler.stats().published,1);
});
test('actual Stop prefix releases a paint wait and cancels its pending latest',async()=>{
 const h=fixture(),p=h.c.requestSherloq();h.value(75);h.c.requestSherloq();h.jobs[0].complete();await tick();assert.equal(h.jobs.length,1);h.c.__scheduler.stop();await p;assert.equal(h.jobs.length,1);assert.equal(h.jobs[0].token.cancelled,true);assert.equal(h.c.__scheduler.pending(),null);
});
test('hidden panel does not block the pump or falsely claim a painted frame',async()=>{
 const h=fixture(),p=h.c.requestSherloq();h.value(75);h.c.requestSherloq();h.setVisible(false);h.jobs[0].complete();await tick();assert.equal(h.jobs.length,2);h.jobs[1].complete();await p;assert.equal(h.c.__scheduler.stats().published,2);assert.equal(h.c.__scheduler.stats().discarded,0);assert.equal(h.calls.filter(x=>x?.kind==='sherloq.latest.presentation-ack').length,0);
});
test('Source identity change releases an unacknowledged old frame',async()=>{
 const h=fixture(),p=h.c.requestSherloq();h.jobs[0].complete();await tick();h.c.fileInput={name:'new-owner'};h.c.imageId='new-id';h.c.hash='new-sha';await p;assert.equal(h.guard({sherloqToken:h.jobs[0].token}),null);assert.equal(h.calls.filter(x=>x?.kind==='sherloq.latest.presentation-ack').length,0);
});
test('shared equalization strips only its SHERLOQ revelation slot, preserving other scientific fields',async()=>{
 const h=fixture({equalized:true}),state=h.c.sherloqRequestState();h.value(75);assert.equal(h.c.sherloqRequestState().family,state.family);assert.notEqual(h.c.sherloqRequestState().signature,state.signature);h.settings.equalization.sherloq7c.micro=80;assert.notEqual(h.c.sherloqRequestState().family,state.family);h.settings.equalization.sherloq7c.micro=100;h.c.regionController.scope.fingerprint='different-scope';assert.notEqual(h.c.sherloqRequestState().family,state.family);
});
test('delayed post-paint ACK revalidates the actual Source owner',async()=>{
 const h=fixture(),p=h.c.requestSherloq();h.jobs[0].complete();await tick();h.c.presentedSurface=h.c.result;h.c.presentedFrameOwners.set(h.c.result,()=>true);h.c.reportPreparedMagnifierPainted(h.c.result);h.c.hash='replaced';await h.paint();await p;assert.equal(h.calls.filter(x=>x?.kind==='sherloq.latest.presentation-ack').length,0);assert.equal(await readFile(spec.source,'utf8'),original,'Source never mutated by this private qualification');
});

test('an intentionally unselected result does not wait for a Main paint that cannot occur',async()=>{const h=fixture(),p=h.c.requestSherloq();h.value(75);h.c.requestSherloq();h.c.selectedSurface=()=>h.c.source;h.jobs[0].complete();await tick();assert.equal(h.jobs.length,2);h.jobs[1].complete();await p;assert.equal(h.calls.filter(x=>x?.kind==='sherloq.latest.presentation-ack').length,0);});

test('classic ELA rebinds only its controlled invalidate revision before task publication and paint',async()=>{const h=fixture({classic:true}),p=h.c.requestSherloq();assert.equal(h.c.revision,1);assert.equal(h.jobs[0].token.owner.revision,1);h.value(75);h.c.requestSherloq();assert.equal(h.calls.filter(x=>x==='cancel').length,0);h.jobs[0].complete();await tick();assert.equal(h.jobs.length,1);assert.equal(h.c.sherloqPresentationCurrent(h.jobs[0].token),true);await h.paint();assert.equal(h.jobs.length,2);assert.equal(h.c.revision,2);h.jobs[1].complete();await tick();await h.paint();await p;assert.equal(h.c.__scheduler.stats().published,2);assert.equal(h.c.__scheduler.stats().discarded,0);});


test('native SHERLOQ ArrowLeft begin/commit preserve an active compatible final-depth generation',async()=>{
 const h=fixture({equalized:true,operation:'detail.gradient'}),p=h.c.requestSherloq(),captured=h.jobs[0].bankGeneration;
 h.c.revokeFinalDepthResults('parameter-edit');h.value(24.9);h.c.requestSherloq();h.c.revokeFinalDepthResults('settings-edit');
 assert.equal(h.bank.generation,captured,'a compatible revelation must not make ToolClient captured generation stale');assert.equal(h.calls.filter(x=>x?.kind==='bank.invalidate').length,0);assert.equal(h.calls.filter(x=>x==='cancel').length,0);
 h.jobs[0].complete();await tick();assert.equal(h.jobs.length,1);assert.equal(h.c.__scheduler.stats().discarded,0);await h.paint();assert.equal(h.jobs.length,2);assert.equal(h.jobs[1].token.requestedSnapshot.revelation,24.9);assert.equal(h.jobs[1].bankGeneration,captured);h.jobs[1].complete();await tick();await h.paint();await p;assert.equal(h.c.__scheduler.stats().published,2);assert.equal(h.c.__scheduler.stats().discarded,0);
});

test('incompatible edits, other reasons, cancelled jobs and idle edits retain final-depth invalidation',async()=>{
 const h=fixture({equalized:true,operation:'detail.gradient'}),p=h.c.requestSherloq();
 h.settings.equalization.sherloq7c.micro=90;h.c.revokeFinalDepthResults('settings-edit');assert.equal(h.bank.generation,1,'microcontrast changes still revoke');
 h.settings.equalization.sherloq7c.micro=100;h.c.revokeFinalDepthResults('scope-change');assert.equal(h.bank.generation,2,'scope changes still revoke even in the same family');
 h.c.__scheduler.stop();h.c.revokeFinalDepthResults('parameter-edit');assert.equal(h.bank.generation,3,'cancelled work never suppresses invalidation');h.jobs[0].complete();await p;
 h.c.revokeFinalDepthResults('settings-edit');assert.equal(h.bank.generation,4,'idle editing retains the existing invalidation policy');
});
