import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';
import {createCloneCorroboration,colorizeCounts} from '../src/clone-corroboration.js';
import {annotateRelations,pairRelations,visibleCloneEntries,CLONE_SOURCES,roundEven} from '../src/clone-relations.js';
const reference=JSON.parse(await readFile(new URL('./data/composition-native.json',import.meta.url)));
const wasmBinary=await readFile(new URL('../vendor/composition/composition.wasm',import.meta.url));
const input=()=>({...reference,entries:reference.entries.map(e=>e.pixel_mask?{...e,pixel_mask:{width:e.pixel_mask[0].length,height:e.pixel_mask.length,data:Uint8Array.from(e.pixel_mask.flat())}}:e)});
test('native annotations and pair ownership before hull construction',()=>{
 const r=input(),actual=annotateRelations(r.entries,{...r,envelope:r.regions.at(-1)});
 for(let i=0;i<actual.length;i++)for(const key of ['relation','endpoint_zones','search_context','search_label','from_enclosing_search','biome_fill_alpha'])assert.deepEqual(actual[i][key],reference.annotations[i][key],`${i}/${key}`);
 assert.deepEqual(pairRelations(reference),reference.pairRelations);
 assert.deepEqual([-.5,.5,1.5,2.5,-1.5].map(roundEven),[0,0,2,2,-2]);
});
test('uint32 method/context counts and holes match native through stripe boundaries',async()=>{
 const budget=new Budget(128*1024**2),engine=createCloneCorroboration({budget,wasmBinary}),r=input();
 try{for(const byContext of [true,false]){const value=await engine.counts({...r,byContext});try{assert.deepEqual([...value.values],(byContext?reference.counts:reference.votes).flat());}finally{value.release();}}
  const assembled=new Uint32Array(r.width*r.height);await engine.stripes({...r,stripRows:17},s=>assembled.set(s.values,s.top*r.width));assert.equal(assembled.filter((v,i)=>v!==reference.counts.flat()[i]).length,0,'Small delivery stripes preserve canonical native raster bands');
 }finally{engine.dispose();}assert.equal(budget.total(),0);
});
test('D2PRL votes once across arbitrary pass contexts; counts do not saturate at display six',async()=>{
 const budget=new Budget(128*1024**2),engine=createCloneCorroboration({budget,wasmBinary}),entry={source:'PatchMatch SIFT',polygons:[[[0,0],[1,0],[1,1],[0,1]]]};
 try{const entries=Array.from({length:300},(_,i)=>({...entry,search_context:String(i)}));entries.push(...['a','b','c'].map(search_context=>({...entry,source:'D2PRL',search_context})),{...entry,source:'ELA biomes'});
 const result=await engine.counts({width:2,height:2,entries});try{assert.deepEqual([...result.values],[301,301,301,301]);assert.deepEqual([...colorizeCounts(result).data.slice(0,3)],[255,30,20]);}finally{result.release();}
 }finally{engine.dispose();}assert.equal(budget.total(),0);
});
test('almost identical endpoint pairs deduplicate only presentation, retaining AI separately',async()=>{
 const budget=new Budget(128*1024**2),engine=createCloneCorroboration({budget,wasmBinary}),a=[[0,0],[8,0],[8,8],[0,8]],b=a.map(([x,y])=>[x+15,y]);
 try{const result=await engine.uniqueEnvelopes([{id:'a',source:'PatchMatch SIFT',polygons:[a,b]},{id:'b',source:'PatchMatch Zernike',polygons:[b,a]},{id:'c',source:'Forgeryscope Auto',polygons:[a,b]},{id:'d',source:'PatchMatch SIFT',polygons:[a,a]}]);assert.equal(result.length,3);assert.deepEqual(result[0].member_ids,['a','b']);assert.deepEqual(result[0].polygons,[a,b]);}finally{engine.dispose();}
 assert.equal(budget.total(),0);
});
test('relation filtering affects classical layers only and ELA never enters corroboration',()=>{
 const entries=[{id:'p',source:'PatchMatch SIFT',relation:'between'},{id:'f',source:'Forgeryscope Auto'},{id:'d',source:'D2PRL'},{id:'e',source:'ELA biomes'},{id:'u',source:'PatchMatch Zernike',relation:'unassigned'}];
 assert.deepEqual(visibleCloneEntries(entries,{relation:'within',presentation:'map'}).map(e=>e.id),['f','d']);
 assert.deepEqual(visibleCloneEntries(entries,{relation:'all',presentation:'biomes'}).map(e=>e.id),['p','f','d','e','u']);
 assert.deepEqual(visibleCloneEntries(entries,{relation:'all',enabledSources:CLONE_SOURCES.filter(s=>s!=='D2PRL'),presentation:'overlay'}).map(e=>e.id),['p','f','u']);
});
test('cancellation and consumer failures release stripe workspaces and guard reentrance',async()=>{
 const budget=new Budget(128*1024**2),engine=createCloneCorroboration({budget,wasmBinary}),r=input(),controller=new AbortController();
 await assert.rejects(engine.stripes(r,()=>{controller.abort();},{signal:controller.signal}),{code:'CANCELLED'});
 assert.equal(budget.total(),64*1024**2);
 await assert.rejects(engine.stripes(r,()=>{throw Error('sink failed');}),/sink failed/);
 assert.equal(budget.total(),64*1024**2);
 await engine.stripes(r,async()=>{await assert.rejects(engine.counts(r),{code:'BUSY'});});engine.dispose();assert.equal(budget.total(),0);
});

test('tab/mode preferences restore ELA and relations without scheduling inference',async()=>{
 const {createAutomaticAnalysisView}=await import('../src/automatic-analysis-view.js');const view=createAutomaticAnalysisView({complete:true,width:1200,height:800});
 assert.equal(view.getState().presentation,'overlay');assert.equal(view.getState().relation,'within');assert.equal(view.getState().opacity,.7);
 view.setPresentation('biomes');view.setRelation('between');view.setEla({background:3,biomes:true});view.setPresentation('map');assert.equal(view.getState().relation,'within');assert.deepEqual(view.getState().elaEffective,{background:0,biomes:false});
 view.setRelation('all');view.setPresentation('overlay');assert.equal(view.getState().relation,'all');view.setPresentation('biomes');assert.equal(view.getState().relation,'between');assert.equal(view.getState().elaEffective.background,3);
 view.selectTab('D2PRL');assert.equal(view.getState().presentation,'biomes');assert.equal(view.getState().relation,'all');view.setD2prlMinimum(0);view.selectTab('overlay');assert.equal(view.getState().d2prlMinimum,0);assert.equal(view.getState().relation,'between');assert.equal(view.getState().frameKey,'1200x800');
});
