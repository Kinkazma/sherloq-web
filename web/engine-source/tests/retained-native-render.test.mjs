import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngine} from '../src/index.js';
import {medianGeometry,medianRender,medianParams} from '../src/median.js';
import {assertRetainedNativeRender} from '../src/retained-native-render.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {Budget} from '../src/cache.js';

const image={width:143,height:79,format:'rgb8',data:new Uint8Array(143*79*3).fill(127)};
function analysis(width=image.width,height=image.height){
 const geometry=medianGeometry(width,height),n=geometry.width*geometry.height;
 return {geometry,probabilities:Float32Array.from({length:n},(_,i)=>(i%9)/8),variances:Float64Array.from({length:n},(_,i)=>i*2),margins:Float32Array.from({length:n},(_,i)=>i-.5),extraNative:{opaqueCounter:9007199254740995n,payload:Uint16Array.of(7,9)}};
}
async function release(engine,result){for(const id of new Set([result.surface.id,...Object.values(result.maskSurfaces??{}).map(s=>s.id),...Object.values(result.rgbSurfaces??{}).map(s=>s.id)]))await engine.releaseSurface(id);}

test('native median final renders complete retained grids A/B/A without a model and preserves all raw fields',async()=>{
 const engine=createEngine({memoryBudgetBytes:512*1024**2}),source=await engine.load({id:'im',bytes:Uint8Array.of(7),pixels:image}),data=analysis(),prior=medianParams({modelId:'model-never-loaded'}),retained={operation:'various.median',sourceSha256:source.sha256,domainFingerprint:null,params:prior,data,provenance:{params:prior,originalSha256:source.sha256}};
 try{
  for(const params of [prior,{...prior,threshold:.8,variance:11,speckle:false,showScore:true},prior]){
   const task={id:'render',imageId:'im',operation:'various.median',params},expected=await medianRender(data,params),result=await engine.renderRetainedNativeParameters({task,retained});
   assert.equal(result.metrics.nativeAnalysisCalls,0);assert.equal(result.metrics.inferenceCalls,0);assert.equal(result.metrics.retainedNativeTables,true);
   const actual=(await engine.readPixels({surfaceId:result.surface.id,revision:1,rect:{x:0,y:0,width:image.width,height:image.height}})).pixels;
   assert.deepEqual(actual,expected.pixels);assert.deepEqual(result.data.probabilities,data.probabilities);assert.deepEqual(result.data.variances,data.variances);assert.deepEqual(result.data.margins,data.margins);assert.deepEqual(result.data.extraNative,data.extraNative);assert.notStrictEqual(result.data.probabilities,data.probabilities);assert.notStrictEqual(result.data.extraNative.payload,data.extraNative.payload);
   for(const field of ['valid','decisions']){const s=result.maskSurfaces[field],actual=(await engine.readMask({surfaceId:s.id,revision:s.revision,rect:{x:0,y:0,width:s.width,height:s.height}})).mask.data;assert.deepEqual(actual,expected[field]);}
   assert.deepEqual(result.data.filtered,expected.filtered);assert.equal(result.data.mean,expected.mean);await release(engine,result);
   assert.equal(engine.capabilities().memory.activeReservationBytes,0);
  }
 }finally{await engine.unload('im');const m=engine.capabilities().memory;assert.equal(m.retainedBytes,0);assert.equal(m.cacheBytes,0);assert.equal(m.activeReservationBytes,0);await engine.dispose();}
});

test('strict median retained native contexts preserve local geometry and Original inside exclusions',async()=>{
 const engine=createEngine({memoryBudgetBytes:512*1024**2}),source=await engine.load({id:'im',bytes:Uint8Array.of(7),pixels:image}),state=await createOriginalSourceRegionsState({sourceSha256:source.sha256,width:image.width,height:image.height});
 await state.add('acquisition',{bounds:[13,7,131,75]});await state.add('exclusion',{bounds:[55,23,64,39]});const domain=await compileOriginalSourceRegions(state.snapshot()),testBudget=new Budget(64*1024**2);
 const view=await createSourceRegionView({descriptor:source.surface,sha256:source.sha256,async readWindow(rect){const free=testBudget.reserve(rect.width*rect.height*3);try{return{pixels:(await engine.readPixels({surfaceId:source.surface.id,revision:1,rect})).pixels,release:free};}catch(e){free();throw e;}}},domain.descriptor,{budget:testBudget}),rects=[...view.admittedRectangles()];await view.dispose();assert.equal(testBudget.total(),0);
 const params=medianParams({modelId:'never-loaded',threshold:.6,showScore:true}),fragments=rects.map((r,i)=>({id:'native-context-'+i,bounds:[r.x,r.y,r.x+r.width,r.y+r.height],native:analysis(r.width,r.height)})),data={width:domain.width,height:domain.height,sourceRegionFingerprint:domain.fingerprint,fragments},retained={operation:'various.median',sourceSha256:source.sha256,domainFingerprint:domain.fingerprint,params,data,provenance:{params}},task={id:'strict-render',imageId:'im',operation:'various.median',sourceRegionDomain:domain.descriptor,params};let result;
 try{
  result=await engine.renderRetainedNativeParameters({task,retained});assert.equal(result.data.fragments.length,fragments.length);assert.equal(result.sourceRegionDomain.fingerprint,domain.fingerprint);assert.deepEqual(result.sourceRegionOrigin,domain.origin);
  const actual=(await engine.readPixels({surfaceId:result.surface.id,revision:1,rect:{x:0,y:0,width:domain.width,height:domain.height}})).pixels.data,expected=new Uint8Array(domain.width*domain.height*3).fill(127);
  for(let i=0;i<rects.length;i++){const r=rects[i],rendered=await medianRender(fragments[i].native,params);for(let y=0;y<r.height;y++)expected.set(rendered.pixels.data.subarray(y*r.width*3,(y+1)*r.width*3),((r.y+y)*domain.width+r.x)*3);assert.deepEqual(result.data.fragments[i].native.probabilities,fragments[i].native.probabilities);}
  assert.deepEqual(actual,expected);for(let y=0;y<domain.height;y++)for(let x=0;x<domain.width;x++)if(!domain.containsOriginal(x+domain.origin[0],y+domain.origin[1]))assert.deepEqual(actual.subarray((y*domain.width+x)*3,(y*domain.width+x)*3+3),Uint8Array.of(127,127,127));
 }finally{if(result){await release(engine,result);if(result.sourceRegionSourceSurface.id!==source.surface.id)await engine.releaseSurface(result.sourceRegionSourceSurface.id);}await engine.unload('im');const m=engine.capabilities().memory;assert.equal(m.retainedBytes,0);assert.equal(m.cacheBytes,0);assert.equal(m.activeReservationBytes,0);await engine.dispose();}
});

test('retained native identity rejects source/domain/science/mode changes before rendering',()=>{
 const task={operation:'tampering.copyMove.sparse',cloneWindowMode:'independent',params:{algorithm:'XFeat',limit:6000}},original={sha256:'a'.repeat(64)},retained={operation:task.operation,sourceSha256:original.sha256,domainFingerprint:'domain',cloneWindowMode:'independent',params:task.params},context={original,domain:{fingerprint:'domain'}};
 assert.doesNotThrow(()=>assertRetainedNativeRender(task,retained,context));
 for(const change of [{cloneWindowMode:'global'},{params:{...task.params,limit:100}},{params:{...task.params,algorithm:'ORB'}}])assert.throws(()=>assertRetainedNativeRender({...task,...change},retained,context));
 assert.throws(()=>assertRetainedNativeRender(task,{...retained,sourceSha256:'b'.repeat(64)},context));assert.throws(()=>assertRetainedNativeRender(task,retained,{...context,domain:{fingerprint:'other'}}));
});

test('native grid failure releases the render owner and keeps Original readable',async()=>{
 const engine=createEngine({memoryBudgetBytes:512*1024**2}),source=await engine.load({id:'im',bytes:Uint8Array.of(7),pixels:image}),params=medianParams({modelId:'not-loaded'}),data=analysis();data.probabilities[2]=NaN;const before=engine.capabilities().memory;
 try{
  await assert.rejects(engine.renderRetainedNativeParameters({task:{id:'bad',imageId:'im',operation:'various.median',params},retained:{operation:'various.median',sourceSha256:source.sha256,params,data}}),/Non-finite/);
  const after=engine.capabilities().memory;assert.equal(after.retainedBytes,before.retainedBytes);assert.equal(after.activeReservationBytes,0);const pixels=(await engine.readPixels({surfaceId:source.surface.id,revision:1,rect:{x:0,y:0,width:1,height:1}})).pixels;assert.deepEqual(pixels.data,Uint8Array.of(127,127,127));
 }finally{await engine.unload('im');await engine.dispose();}
});
