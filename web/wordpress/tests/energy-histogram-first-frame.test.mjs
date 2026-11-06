import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../sherloq-browser/assets/app.js',import.meta.url),'utf8'),start=source.indexOf('function refreshEnergyHistogram('),end=source.indexOf("\n$('ela-mode').onchange=",start),body=source.slice(start,end);
const drain=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function fixture(){
 const requests=[],updates=[],markers=[];let selection='A';
 const state={elaMode:'biomes',busy:false,provisional:false,hasRetainedEnergy:()=>true,elaProvisional:()=>state.provisional,result:{},presentedSurface:null,resultMeta:{id:'native-A',data:{metadata:{}}},imageId:'original',revision:1,hash:'a'.repeat(64),energyHistogramKey:'',energyHistogramVersion:0,energyHistogramQueued:null,energyHistogramJob:null,controls(){},diagnostic(){},energyContextSelection:()=>({}),prepareEnergyRequest:()=>({params:{}}),energyHistogramUI:{selected:()=>({sourceFragment:selection}),update:value=>updates.push(value),markers:()=>markers.push(1)},request(action,payload){return new Promise(resolve=>requests.push({action,payload,finish(){resolve({histogram:{source:{resultId:payload.resultId,imageId:payload.imageId,sourceSha256:state.hash},selection:{sourceFragment:payload.sourceFragment},scores:{count:1}}});}}));}};
 const context=vm.createContext(state);vm.runInContext(body,context);return {state,requests,updates,markers,select:value=>selection=value,paint(){state.presentedSurface=state.result;},refresh:options=>context.refreshEnergyHistogram(options)};
}
test('native histogram work waits for the actual final display and coalesces repeated paints',async()=>{
 const f=fixture();f.refresh();assert.equal(f.requests.length,0,'the first display read keeps the worker queue');
 f.paint();for(let i=0;i<50;i++)f.refresh({afterPaint:true});assert.equal(f.requests.length,1);assert.equal(f.state.energyHistogramVersion,1);
 f.requests[0].finish();await drain();assert.equal(f.updates.length,1);assert.equal(f.state.energyHistogramJob,null);
 const count=f.markers.length;for(let i=0;i<50;i++)f.refresh({afterPaint:true});assert.equal(f.requests.length,1);assert.equal(f.markers.length,count,'an unchanged canvas paint does not rewrite histogram controls');
 f.refresh();assert.equal(f.markers.length,count+1,'explicit marker refresh remains available');
});
test('a new native frame retires the old pending reply before starting its own histogram',async()=>{
 const f=fixture();f.paint();f.refresh();f.state.result={};f.state.resultMeta={id:'native-B',data:{metadata:{}}};f.refresh();assert.equal(f.requests.length,1);
 f.requests[0].finish();await drain();assert.equal(f.updates.length,0);f.paint();f.refresh({afterPaint:true});assert.equal(f.requests[1].payload.resultId,'native-B');f.requests[1].finish();await drain();assert.equal(f.updates.length,1);
});
test('context A to B to A keeps the newest intent rather than the obsolete queued B',async()=>{
 const f=fixture();f.paint();f.refresh();f.select('B');f.refresh();f.select('A');f.refresh();f.requests[0].finish();await drain();assert.equal(f.requests.length,2);assert.equal(f.requests[1].payload.sourceFragment,'A');f.requests[1].finish();await drain();assert.equal(f.updates.length,1);assert.equal(f.updates[0].selection.sourceFragment,'A');
});
test('provisional frames do not request exportable native histograms and the real draw is wired to the deferred refresh',()=>{
 const f=fixture();f.paint();f.state.result.previewOnly=true;f.refresh({afterPaint:true});assert.equal(f.requests.length,0);f.state.result.previewOnly=false;f.state.provisional=true;f.refresh({afterPaint:true});assert.equal(f.requests.length,0);
 assert.match(source,/if\(!nextSurface\.previewOnly\)refreshEnergyHistogram\(\{afterPaint:true\}\)/);
});

test('the real draw publication block accepts an empty workspace before its first image',()=>{
 const prefix='if(nextSurface&&nextSurface===result){reportPresentedPreview(nextSurface);',at=source.indexOf(prefix);assert(at>=0);
 const block=source.slice(at,source.indexOf("\n $('analysis-state')",at));const calls=[];
 const state={nextSurface:null,result:null,reportPresentedPreview:()=>calls.push('preview'),preparePaintedParameterWorker:()=>calls.push('preparation'),finishZeroViewPresentation:()=>calls.push('zero'),refreshEnergyHistogram:()=>calls.push('histogram')};
 const context=vm.createContext(state);vm.runInContext(block,context);assert.deepEqual(calls,[]);
 state.nextSurface=state.result={previewOnly:true};vm.runInContext(block,context);assert.deepEqual(calls,['preview','preparation','zero']);
 calls.length=0;state.nextSurface=state.result={previewOnly:false};vm.runInContext(block,context);assert.deepEqual(calls,['preview','preparation','zero','histogram']);
});
