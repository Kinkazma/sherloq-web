import {readDisplayFrame} from '../sherloq-browser/assets/unified-engine/src/display-sampling.js';
import {Budget} from '../sherloq-browser/assets/unified-engine/src/cache.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAutomaticClient} from '../sherloq-browser/assets/automatic-client.js';
import {createAutomaticProgress,automaticSelection,automaticReport} from '../sherloq-browser/assets/automatic-state.js';
const config={assetBase:'./unified-assets/',engineCommit:'fixed',englishSha256:'abc'};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const calls=[],state={cancel:false,paused:false,disposed:0};
 const result={analysisId:'analysis',status:'ok',operation:'analysis.complete',data:{state:{states:{patchmatch:'done'}},entries:[]}};
 const engine={
  capabilities:async()=>({}),loadBlob:async x=>{calls.push(['load',x]);return {surface:{id:'original',revision:1,width:4,height:2,format:'rgb8'}};},
  loadAutomaticModels:async()=>{calls.push(['automatic-models']);},loadD2prlModel:async()=>{calls.push(['d2-model']);},loadM3Models:async()=>{calls.push(['ocr']);},
  run:async (task,{signal})=>{calls.push(['run',task]);if(state.cancel){await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{state.paused=true;reject(Object.assign(Error('paused'),{code:'CANCELLED',details:{retainedAnalysis:{analysisId:'analysis',state:{states:{patchmatch:'cancelled'}}}}}));},{once:true}));}return result;},
  resumeAutomatic:async request=>{calls.push(['resume',request]);return result;},
  updateAutomatic:async request=>{calls.push(['update',request]);return result;},
  renderAutomatic:async()=>{calls.push(['render']);return {surface:{id:'map',revision:1,width:4,height:2,format:'int32'}};},
  readDisplay:async({tile,render})=>{calls.push(['read-display',tile,render]);const budget=new Budget(100000),plane={descriptor:{width:4,height:2,format:'int32'},readWindow:async rect=>({pixels:{width:rect.width,height:rect.height,format:'int32',data:new Int32Array(rect.width*rect.height).fill(1)},release(){}})},overlay={descriptor:{width:4,height:2,format:'rgb8'},readWindow:async rect=>({pixels:{width:rect.width,height:rect.height,format:'rgb8',data:new Uint8Array(rect.width*rect.height*3).fill(90)},release(){}})};const frame=await readDisplayFrame(plane,tile,{budget,render,overlay:render?.overlaySurfaceId?overlay:undefined});frame.release();assert.equal(budget.total(),0);return frame;},
  readPlane:async({rect})=>({plane:{data:new Int32Array(rect.width*rect.height).fill(1)}}),
  readPixels:async({rect})=>({pixels:{width:rect.width,height:rect.height,format:'rgb8',data:new Uint8Array(rect.width*rect.height*3).fill(90)}}),
  releaseSurface:async id=>calls.push(['release',id]),
  exportAutomatic:async()=>({id:'archive',revision:1,byteLength:3}),readExport:async()=>({bytes:new Uint8Array([1,2,3])}),releaseExport:async id=>calls.push(['release-export',id]),
  releaseAutomatic:async()=>calls.push(['release-analysis']),
  dispose:async()=>{state.disposed++;}
 };
 const fetcher=async url=>({ok:true,json:async()=>String(url).includes('neural-runtime')?{providers:{}}:{assets:{}},arrayBuffer:async()=>new ArrayBuffer(1)});
 return {calls,state,engine,result,open:()=>createAutomaticClient({config,engineFactory:()=>engine,fetcher})};
}
test('automatic cancellation preserves checkpoint and resumes the same engine without repeating model setup',async()=>{
 const h=harness(),client=await h.open();await client.load({id:'im',blob:new Blob()});h.state.cancel=true;
 const run=client.run({imageId:'im',operation:'analysis.complete'});await flush();const pause=client.pause();await assert.rejects(run,{code:'CANCELLED'});await pause;
 assert.equal(client.checkpoint.analysisId,'analysis');assert.equal(h.state.disposed,0);
 await client.resume();assert.equal(client.result,h.result);assert.equal(h.calls.filter(c=>c[0]==='run').length,1);assert.equal(h.calls.filter(c=>c[0]==='automatic-models').length,1);
 await client.dispose();assert.equal(h.state.disposed,1);
});
test('window display and opacity reuse the computed map; filters never rerun detectors',async()=>{
 const h=harness(),client=await h.open();await client.load({id:'im',blob:new Blob()});await client.run({operation:'analysis.complete'});
 const a=await client.display('corroboration',{overlay:true,opacity:0}),b=await client.display('corroboration',{overlay:true,opacity:1});
 assert.equal(h.calls.filter(c=>c[0]==='render').length,1);
 const tile={x:0,y:0,w:4,h:2,step:2};assert.deepEqual([...((await client.readTile(a,tile)).data)],Array(6).fill(90));
 assert.deepEqual([...((await client.readTile(b,tile)).data)],[30,100,255,30,100,255]);
 await client.update([{method:'selectTab',value:'D2PRL'}]);assert.equal(h.calls.filter(c=>c[0]==='run').length,1);assert.equal(h.calls.filter(c=>c[0]==='release').length,1);
 await assert.rejects(client.readTile(b,{...tile,step:0}),/Invalid display/);await client.dispose();
});
test('export streams awaited chunks, releases archive on sink failure and keeps the result',async()=>{
 const h=harness(),client=await h.open();await client.run({operation:'analysis.complete'});
 await assert.rejects(client.exportTo({write:async()=>{throw Error('disk-full');}}),/disk-full/);assert.equal(client.result,h.result);assert.equal(h.calls.filter(c=>c[0]==='release-export').length,1);
 const chunks=[];await client.exportTo({write:async b=>chunks.push([...b])});assert.deepEqual(chunks,[[1,2,3]]);assert.equal(h.calls.filter(c=>c[0]==='run').length,1);await client.dispose();
});
test('dispose drains cooperative cancellation before destroying the worker and rejects queued reads',async()=>{
 const h=harness(),client=await h.open();h.state.cancel=true;const run=client.run({operation:'analysis.complete'});await flush();const done=client.dispose();await assert.rejects(run,{code:'CANCELLED'});await done;assert.ok(h.state.paused);assert.equal(h.state.disposed,1);await client.dispose();assert.equal(h.state.disposed,1);
});
test('progress distinguishes useful computation from diagnostics and recovery, without a fake global fraction',()=>{
 let time=0;const progress=createAutomaticProgress(true,()=>time);time=10;progress.accept({phase:'global-patchmatch',group:'patchmatch',completed:30,total:100});time=20;progress.accept({phase:'diagnostic-heartbeat'});progress.accept({phase:'resource-wait'});progress.accept({phase:'resource-recovery'});assert.equal(progress.snapshot().lastUsefulAt,10);assert.equal(progress.snapshot().recoveries,1);assert.equal(progress.snapshot().fraction,undefined);
 const report=automaticReport({data:{entries:[{id:'mask',pixel_mask:{width:2,height:1,data:new Uint8Array([1,0])}}]}},progress.snapshot(),config);assert.equal(report.entries[0].pixel_mask,undefined);assert.equal(report.entries[0].mask.width,2);
});
test('selection preserves original pixel centres and a distinct enclosing search',()=>{
 assert.equal(automaticSelection(12000,8000,[],'detected'),undefined);assert.deepEqual(automaticSelection(12000,8000,[],'whole').envelope[2],[11999,7999]);
 const s=automaticSelection(20,20,[{x0:1,y0:2,x1:5,y1:6},{x0:10,y0:11,x1:15,y1:16}],'selected');assert.equal(s.regions.length,3);assert.deepEqual(s.envelope,[[1,2],[14,2],[14,15],[1,15]]);assert.throws(()=>automaticSelection(2,2,[],'selected'));
});

test('a new calculation releases the previous retained analysis instead of accumulating full masks',async()=>{
 const h=harness(),client=await h.open();await client.run({operation:'analysis.complete'});await client.run({operation:'analysis.clones'});
 assert.deepEqual(h.calls.filter(c=>c[0]==='release-analysis'),[['release-analysis']]);
 await client.load({id:'next',blob:new Blob()});assert.equal(h.calls.filter(c=>c[0]==='release-analysis').length,2);await client.dispose();
});

test('completed mask bytes are not retained a second time by the presentation client',async()=>{
 const h=harness();h.result.data.entries=[{id:'found',pixel_mask:{width:2,height:1,data:new Uint8Array([1,0])}}];
 const client=await h.open();const r=await client.run({operation:'analysis.complete'});assert.deepEqual(r.data.entries[0].pixel_mask,{width:2,height:1});await client.dispose();
});

test('a partial result exposes retry for failed resumable groups without discarding successful groups',async()=>{
 const h=harness();h.result.status='partial';h.result.data.state={states:{d2prl:'failed',patchmatch:'done'},completed:['patchmatch'],resumable:['d2prl']};
 const client=await h.open();await client.run({operation:'analysis.complete'});assert.equal(client.checkpoint.analysisId,'analysis');await client.resume();assert.equal(h.calls.filter(c=>c[0]==='run').length,1);assert.equal(h.calls.filter(c=>c[0]==='resume').length,1);await client.dispose();
});
