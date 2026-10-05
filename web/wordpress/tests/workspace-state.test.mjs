import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceState,DEFAULT_FAVORITES} from '../sherloq-browser/assets/workspace-state.js';
import {createWorkspaceEnginePool} from '../sherloq-browser/assets/workspace-engine-pool.js';

test('Startup is empty; language changes preserve groups, visibility, documents and running jobs',()=>{
 const state=createWorkspaceState();assert.equal(state.documents.size,0);assert.equal(state.groups.size,0);assert.equal(state.active,null);
 let stopped=0;const task={controller:{busy:true,dispose(){stopped++;}}};state.open('analysis.complete',task);state.setGroup('Inspection',true);state.toggleTools();state.setLayout('cascade');state.setLanguage('en');state.open('original',{});state.select('analysis.complete');
 assert.equal(state.documents.get('analysis.complete'),task);assert.equal(stopped,0);assert.equal(task.controller.busy,true);assert.equal(state.layout,'cascade');assert.equal(state.toolsVisible,false);assert.deepEqual([...state.groups],['Inspection']);
 state.clear();assert.equal(state.active,null);assert.equal(state.documents.size,0);assert.equal(stopped,0,'Only the owner explicitly disposes calculations');
});
test('Favorites accept any tool, disappear when empty, and restore without opening categories',()=>{
 const s=createWorkspaceState();s.restore({favorites:[]});s.toggleFavorite('inspection.histogram');s.toggleFavorite('file.hex');assert.equal(s.favorites.size,2);s.toggleFavorite('file.hex');s.toggleFavorite('inspection.histogram');assert.equal(s.favorites.size,0);
 s.restore({favorites:['file.hex','invalid'],language:'en',layout:'tile'},['file.hex']);assert.deepEqual([...s.favorites],['file.hex']);assert.equal(s.groups.size,0);
});
test('Closing an active tab selects a real neighbor and eventually produces an empty workspace',()=>{
 const s=createWorkspaceState();s.open('original',{});s.open('ela.classic',{});s.open('composite',{});s.close('composite');assert.equal(s.active,'ela.classic');s.close('original');assert.equal(s.active,'ela.classic');s.close('ela.classic');assert.equal(s.active,null);
});
test('Two panel scopes share decoded source and model configuration without disposing another result',async()=>{
 const calls=[],surface={id:'source-rgb',revision:1,width:10,height:10,format:'rgb8'};
 const engine={loadBlob:async x=>(calls.push('load:'+x.id),{id:x.id,surface}),loadM3Models:async()=>{calls.push('models');return {ok:true};},run:async x=>({surface:{...surface,id:x.id},data:{source:surface}}),releaseSurface:async id=>calls.push('release:'+id),unload:async id=>calls.push('unload:'+id),dispose:async()=>calls.push('dispose')};
 const factory=createWorkspaceEnginePool(()=>engine),a=factory({computeProfile:'maximum'}),b=factory({computeProfile:'maximum'}),input={id:'original',blob:new Blob(['transport only'])};
 await a.loadBlob(input);await b.loadBlob(input);await a.loadM3Models({models:{sift:{url:'local',sha256:'hash'}},language:{sha256:'ocr'}});await b.loadM3Models({models:{sift:{url:'local',sha256:'hash'}},language:{sha256:'ocr'}});
 await a.run({id:'result-a'});await b.run({id:'result-b'});await a.dispose();assert.deepEqual(calls,['load:original','models','release:result-a']);await b.dispose();assert.deepEqual(calls,['load:original','models','release:result-a','release:result-b','unload:original','dispose']);
});
test('Closing a scope discards its queued calls and leaves another scope operational',async()=>{
 let finish;const calls=[],engine={run:async x=>{calls.push(x.id);if(x.id==='active')await new Promise(r=>finish=r);return {};},dispose:async()=>calls.push('disposed')};
 const pool=createWorkspaceEnginePool(()=>engine),a=pool(),b=pool();const active=a.run({id:'active'});await new Promise(r=>setImmediate(r));const skipped=a.run({id:'closed'});const rejected=assert.rejects(skipped,{code:'CANCELLED'});const closed=a.dispose(),next=b.run({id:'next'});finish();await Promise.all([active,rejected,closed,next]);assert.deepEqual(calls,['active','next']);await b.dispose();
});
test('Worker recreation invalidates every scope and rebuilds source reference counts',async()=>{
 let fail=true,invalidations=0,unloads=0;
 const engine={loadBlob:async input=>({id:input.id,surface:{id:'source'}}),run:async()=>{if(fail){fail=false;throw Object.assign(Error('worker lost'),{imagesCleared:true});}return {};},unload:async()=>unloads++,dispose:async()=>{}};
 const pool=createWorkspaceEnginePool(()=>engine),a=pool(),b=pool(),input={id:'same',blob:new Blob(['transport'])};a.onSourceInvalidation(()=>invalidations++);b.onSourceInvalidation(()=>invalidations++);
 await a.loadBlob(input);await b.loadBlob(input);await assert.rejects(a.run({}));assert.equal(invalidations,2);
 await a.loadBlob(input);await b.loadBlob(input);await a.dispose();assert.equal(unloads,0);await b.dispose();assert.equal(unloads,1);
});
test('Clients retain the original Blob after shared worker loss and report unavailable results',async()=>{
 const {createToolClient}=await import('../sherloq-browser/assets/tool-client.js');
 const previousFetch=globalThis.fetch;globalThis.fetch=async()=>({json:async()=>({assetBase:'./unified-assets/'})});
 let epoch=0;const events=[];
 const engine={loadBlob:async input=>({id:input.id,surface:{id:'original-'+(++epoch),revision:1,width:1,height:1,format:'rgb8'}}),run:async task=>{if(task.id==='fail')throw Object.assign(Error('worker lost'),{imagesCleared:true});return {surface:{id:'computed',revision:1,width:1,height:1,format:'rgb8'}};},readPixels:async input=>{assert.equal(input.surfaceId,'original-2');return {pixels:{width:1,height:1,data:Uint8Array.of(1,2,3)}};},releaseSurface:async()=>{},unload:async()=>{},dispose:async()=>{}};
 const pool=createWorkspaceEnginePool(()=>engine);let a,b;
 try{
  a=await createToolClient({engineFactory:pool});b=await createToolClient({engineFactory:pool,onInvalidated:event=>events.push(event)});const input={id:'file',blob:new Blob(['transport'])};await a.load(input);await b.load(input);const original=b.source.surface;
  await b.run({id:'ok',operation:'file.hex',params:{}});await assert.rejects(a.run({id:'fail',operation:'file.hex',params:{}}));assert.equal(b.result,null);assert.deepEqual(events,[{resultLost:true}]);
  const read=await b.readWindow(original,{x:0,y:0,width:1,height:1});assert.deepEqual([...read.data],[1,2,3]);assert.equal(b.source.id,'file');
 }finally{await a?.dispose();await b?.dispose();globalThis.fetch=previousFetch;}
});

test('First visit has four requested favorites; an explicitly empty saved list stays empty',()=>{
 const s=createWorkspaceState();assert.deepEqual([...s.favorites],DEFAULT_FAVORITES);s.restore({language:'en'});assert.deepEqual([...s.favorites],DEFAULT_FAVORITES);s.restore({favorites:[]});assert.equal(s.favorites.size,0);
});

test('Closing one document releases only its export reservations in the shared engine',async()=>{
 let sequence=0,disposed=0;const live=new Map(),engine={reserveExternalMemory:async({bytes})=>{const lease={id:String(++sequence),bytes};live.set(lease.id,bytes);return lease;},releaseExternalMemory:async id=>live.delete(id),dispose:async()=>disposed++};
 const factory=createWorkspaceEnginePool(()=>engine),a=factory(),b=factory();const first=await a.reserveExternalMemory({bytes:11}),second=await b.reserveExternalMemory({bytes:17});
 await a.dispose();assert.equal(live.has(first.id),false);assert.equal(live.get(second.id),17);assert.equal(disposed,0);
 await b.releaseExternalMemory(second.id);await b.dispose();assert.equal(live.size,0);assert.equal(disposed,1);
});
