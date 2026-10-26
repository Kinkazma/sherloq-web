import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {createSsgStrictEngine} from '../src/ssg-strict-engine.js';
import {SsgFullEngine} from '../src/ssg-full.js';

const identity={url:'https://model.invalid/forest-manifest.json',bytes:100,sha256:'f'.repeat(64)},models={'ssg-edges':identity},profile={maxWorkers:2};
function controlledEdges(counts){return{async run({rgb,width,height},{signal}={}){assert(!signal?.aborted);counts.forest++;const edgeMap=new Float32Array(width*height);for(let i=0;i<edgeMap.length;i++)edgeMap[i]=(rgb[i*3]+rgb[i*3+1]*2+rgb[i*3+2])/1020;return{edgeMap,metadata:{controlledForest:true,nativePixels:width*height},release(){}};},releaseIdle(){},dispose(){}};}
async function setup({selected=false,poison=0,offset=false}={}){
 const budget=new Budget(1024**3),width=offset?334:320,height=offset?108:96,ox=offset?7:0,oy=offset?5:0,state=await createOriginalSourceRegionsState({sourceSha256:'c'.repeat(64),width,height});if(selected||offset)for(const x of[0,112,224])await state.add('acquisition',{x0:x+ox,y0:oy,x1:x+96+ox,y1:96+oy});if(selected)await state.add('exclusion',{x0:18+ox,y0:18+oy,x1:22+ox,y1:22+oy});const domain=await compileOriginalSourceRegions(state.snapshot()),rgb=new Uint8Array(width*height*3),reads=[],counts={forest:0};for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++){const xx=(x-ox)%112,yy=y-oy,checker=((xx>>3)^(yy>>3))&1?190:40;rgb[(y*width+x)*3+c]=domain.containsOriginal(x,y)?Math.max(0,Math.min(255,checker+Math.round(17*Math.sin(xx*.31+yy*.13))+c*3)):poison;}
 const view=await createSourceRegionView({sha256:'c'.repeat(64),descriptor:{id:'ssg-fixture',revision:1,width,height,format:'rgb8'},async readWindow(rect){const free=budget.reserve(rect.width*rect.height*3),data=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++){assert(domain.containsOriginal(rect.x+x,rect.y+y),'Forbidden RGB reached SSG.');data.set(rgb.subarray(((rect.y+y)*width+rect.x+x)*3,((rect.y+y)*width+rect.x+x)*3+3),(y*rect.width+x)*3);}reads.push({...rect});return{pixels:{format:'rgb8',width:rect.width,height:rect.height,data},release:free};}},domain.descriptor,{budget});const engine=createSsgStrictEngine(view,budget,profile,{edgesFactory:()=>controlledEdges(counts)});
 return{budget,width,height,domain,view,engine,rgb,reads,counts,async close(){await engine.dispose();await view.dispose();assert.equal(budget.total(),0);}};
}
const params={normalizationLongEdge:0};
test('complete native SSG orchestration retains the full-rectangle reference bit exactly; only forest inference is controlled',async()=>{
 const h=await setup(),old=new SsgFullEngine({format:'rgb8',width:h.width,height:h.height,data:h.rgb},h.budget,profile),oldCounts={forest:0};old.edges.dispose();old.edges=controlledEdges(oldCounts);let expected,actual;
 try{for(const normalizationLongEdge of[0,384]){expected=await old.analyze({normalizationLongEdge},{models});actual=await h.engine.analyze({normalizationLongEdge},{models});for(const key of['points','pairs','pair_search_regions','groups','models','colors','bases','mask'])assert.deepEqual(actual[key],expected[key],key);assert.deepEqual(actual.metadata.counts,expected.metadata.counts);assert.equal(h.counts.forest,oldCounts.forest);assert(actual.metadata.counts.words>0,'The comparison must execute matching and the controlled forest, not only the empty result path.');actual.release();actual=null;expected.release();expected=null;}}
 finally{actual?.release();expected?.release();await old.dispose();await h.close();}
});
test('a publication callback failure retires the provisional result and leaves the previous native checkpoint reusable',async()=>{
 const h=await setup({selected:true});let first,after;try{first=await h.engine.analyze(params,{models});const cause=Object.freeze(new Error('Controlled publication failed'));await assert.rejects(h.engine.analyze({...params,ratio:.5},{models,onProgress:e=>{if(e.phase==='complete')throw cause;}}),error=>error===cause);after=await h.engine.analyze(params,{models});assert.equal(after.metadata.stageCache.nativeCheckpoint,true);assert.deepEqual(first.points,after.points);}finally{first?.release();after?.release();await h.close();}
});
test('true holes and gaps are absent before every input, global cross matches survive, and cache/views perform no new extraction',async()=>{
 const a=await setup({selected:true,poison:0}),b=await setup({selected:true,poison:255});let first,poison,warm,back;
 try{first=await a.engine.analyze(params,{models});poison=await b.engine.analyze(params,{models});for(const key of['points','pairs','mask','directSsimSupport','models'])assert.deepEqual(first[key],poison[key],key);assert(first.metadata.counts.words>0);assert.equal(first.metadata.nativeContexts.admittedPixels,a.domain.countIncluded);for(let y=0;y<a.domain.height;y++)for(let x=0;x<a.domain.width;x++)if(!a.domain.contains(x,y)){assert.equal(first.mask[y*a.domain.width+x],0);assert.equal(first.directSsimSupport[y*a.domain.width+x],0);}const count=a.counts.forest,reads=a.reads.length;warm=await a.engine.analyze({...params,maskThreshold:.9},{models});back=await a.engine.analyze(params,{models});assert.equal(warm.metadata.stageCache.nativeCheckpoint,true);assert.equal(back.metadata.stageCache.nativeCheckpoint,true);assert.equal(a.counts.forest,count);assert.equal(a.reads.length,reads);assert.deepEqual(back.mask,first.mask);assert.notEqual(back.mask,first.mask);}
 finally{for(const v of[first,poison,warm,back])v?.release();await a.close();await b.close();}
});
test('old successful request signal cannot abort a cached new result; failed replacement preserves its prior owner',async()=>{
 const h=await setup({selected:true}),old=new AbortController(),abort=new AbortController();let first,warm,after;
 try{first=await h.engine.analyze(params,{models,signal:old.signal});old.abort();warm=await h.engine.analyze(params,{models});assert.equal(warm.metadata.stageCache.nativeCheckpoint,true);const count=h.counts.forest;await assert.rejects(h.engine.analyze({...params,ratio:.5},{models,signal:abort.signal,onProgress:e=>{if(e.phase==='ssg-word-matching')abort.abort();}}),{code:'CANCELLED'});after=await h.engine.analyze(params,{models});assert.equal(after.metadata.stageCache.nativeCheckpoint,true);assert.deepEqual(after.points,first.points);assert.equal(h.counts.forest,count);}
 finally{for(const v of[first,warm,after])v?.release();await h.close();}
});
test('offset native source stays in one source-local grid and retains the signed Original origin',async()=>{
 const h=await setup({offset:true});let result;try{result=await h.engine.analyze(params,{models});assert.deepEqual(result.metadata.origin,[7,5]);assert.equal(result.width,320);assert.equal(result.height,96);assert(result.points.every(Number.isFinite));assert(h.reads.every(r=>r.x>=7&&r.y>=5));}finally{result?.release();await h.close();}
});
