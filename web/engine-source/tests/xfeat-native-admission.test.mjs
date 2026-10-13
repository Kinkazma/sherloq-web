// Execute the installed admission/control statements in isolation. Numerical
// matching and actual M3 routing are separately qualified by the public gates.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Budget} from '../src/cache.js';
const live=await fs.readFile(new URL('../src/sparse-copy.js',import.meta.url),'utf8');
const guard="if(p.algorithm==='XFeat'&&!settings.binary&&settings.descriptors instanceof Float32Array&&settings.points.length>100*7)",start=live.indexOf(guard),end=live.indexOf('(settings,control);});',start)+'(settings,control);'.length;
assert.ok(start>0&&end>start);
const dispatchBody=live.slice(start,end);
assert.equal(dispatchBody.split("await import('./copy-spatial-private.js')").length,2);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const dispatch=new AsyncFunction('p','settings','control','glue','g2nn','siftG2nnMatch','spatialCopyMatches','__importPrivate','glueKind','glueModel','hooks',dispatchBody.replace("await import('./copy-spatial-private.js')","await __importPrivate()"));
const resetLine=live.split('\n').find(line=>line.includes("if(p.algorithm==='XFeat'&&base.points.length<=100*7)"));
assert.ok(resetLine);
const reset=new Function('p','base',resetLine);
function fixture(n,{algorithm='XFeat',binary=false,Type=Float32Array}={}){
 const budget=new Budget(1024),claims=[],events=[],p={algorithm,limit:20000},settings={points:new Float64Array(n*7),descriptors:new Type(n*64),binary},control={signal:new AbortController().signal,reserveMemory(bytes){const free=budget.reserve(bytes);claims.push(free);return free;}};
 const metrics={mode:'native',completedHelperCalls:123,liveBankBytes:0},value={marker:'original-result'},engine={image:{width:256,height:256},lastNativeDistanceMetrics:{stale:true},glue:{match(input,options){events.push(['glue',input,options]);return value;}}};
 const publicMatch=(input,options)=>{events.push(['public',input,options]);options.reserveMemory(4);return value;};
 const g2nnMatch=(input,options)=>{events.push(['g2nn',input,options]);return value;};
 const importPrivate=async()=>{events.push(['import-private']);return{async spatialCopyMatchesInternal(input,options){events.push(['native',input,options]);options.reserveMemory(4);return {...value,nativeDistanceMetrics:metrics};}};};
 return{budget,claims,events,p,settings,control,metrics,value,engine,async run({cached=false,glue=false,g2nn=false}={}){reset.call(engine,p,settings);if(cached)return value;return dispatch.call(engine,p,settings,control,glue,g2nn,g2nnMatch,publicMatch,importPrivate,'glue-kind','glue-model',{backend:'cpu'});},close(){claims.forEach(free=>free());assert.equal(budget.total(),0);assert.equal(budget.resources.operations.size,0);assert.equal(budget.resources.backings.size,0);}};
}
for(const n of [0,1,100])test(`real private bank N=${n} uses historical matcher without native import`,async()=>{
 const row=fixture(n);try{assert.strictEqual(await row.run(),row.value);assert.deepEqual(row.events.map(event=>event[0]),['public']);assert.strictEqual(row.events[0][1],row.settings);assert.strictEqual(row.events[0][2],row.control);assert.equal(row.engine.lastNativeDistanceMetrics,null);}finally{row.close();}
});
test('N=101 retains the identical installed native arguments and observation',async()=>{
 const row=fixture(101);try{await row.run();assert.deepEqual(row.events.map(event=>event[0]),['import-private','native']);assert.strictEqual(row.events[1][1],row.settings);assert.strictEqual(row.events[1][2].reserveMemory,row.control.reserveMemory);assert.strictEqual(row.events[1][2].signal,row.control.signal);assert.equal(row.events[1][2].nativeDistance,true);assert.equal(row.events[1][2].nativeVariant,'simd-ordered');assert.strictEqual(row.engine.lastNativeDistanceMetrics,row.metrics);}finally{row.close();}
});
test('other families, Glue/G2NN and non-Float32 banks keep historical dispatch',async()=>{
 for(const [options,route,expected]of [[{algorithm:'ALIKED'}, {}, 'public'],[{algorithm:'SIFT'}, {}, 'public'],[{algorithm:'ORB',binary:true,Type:Uint8Array}, {}, 'public'],[{algorithm:'XFeat + LighterGlue'},{glue:true},'glue'],[{algorithm:'SIFT + G2NN + RANSAC'},{g2nn:true},'g2nn'],[{algorithm:'XFeat',Type:Float64Array},{},'public']]){
  const row=fixture(101,options);try{await row.run(route);assert.deepEqual(row.events.map(event=>event[0]),[expected]);}finally{row.close();}
 }
});
test('native then small public analysis retires the private observation',async()=>{
 const row=fixture(101);try{await row.run();assert.strictEqual(row.engine.lastNativeDistanceMetrics,row.metrics);row.settings.points=new Float64Array(700);row.settings.descriptors=new Float32Array(6400);row.events.length=0;await row.run();assert.deepEqual(row.events.map(event=>event[0]),['public']);assert.equal(row.engine.lastNativeDistanceMetrics,null);}finally{row.close();}
});
test('small matching cache hit still clears an earlier native observation',async()=>{
 const row=fixture(100);try{assert.strictEqual(await row.run({cached:true}),row.value);assert.equal(row.events.length,0);assert.equal(row.engine.lastNativeDistanceMetrics,null);}finally{row.close();}
});
