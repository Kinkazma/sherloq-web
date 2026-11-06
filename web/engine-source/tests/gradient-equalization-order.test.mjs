import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createEngine} from '../src/index.js';import {Budget} from '../src/cache.js';import {initCvWasm} from '../src/opencv.js';import {initGradientWasm,releaseGradientWasm} from '../src/gradient-math.js';
import {OPENCV_OPERATIONS} from '../src/opencv-operations.js';import {equalizationMethods,equalizationState,equalizationPlan} from '../src/equalization-settings.js';import {equalizationPixels} from '../src/equalization-pixels.js';
import {gradientToneLut} from '../src/segmented-gradient.js';import {equalizeHistogramLut} from '../src/pixel-utils.js';import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
await initCvWasm({wasmBinary:await readFile(new URL('../vendor/opencv/opencv.wasm',import.meta.url))});
const wasm=await readFile(new URL('../vendor/gradient/gradient.wasm',import.meta.url)),width=31,height=27,pixels={width,height,format:'rgb8',data:Uint8Array.from({length:width*height*3},(_,i)=>(i*23+(i>>>2)*37)%256)},settings=id=>equalizationState({method:id,values:equalizationMethods.map(m=>m.default)});let serial=0;
const params=(method,intensity)=>({method,intensity,mode:2,invert:false,equalize:false});
async function frame(engine,result){return result.pixels??(await engine.readPixels({surfaceId:result.surface.id,revision:result.surface.revision})).pixels;}
async function release(engine,result){if(result?.surface)await engine.releaseSurface(result.surface.id);}
function compositionPlan(state){const method=equalizationMethods.find(m=>m.id===state.method);return{state,method,value:state.values[equalizationMethods.indexOf(method)],channels:true,finish:null};}
test('explicit gradient equalization preserves intensity/defaults and leaves legacy booleans outside the plan',()=>{
 for(const method of['sobel','krawetz'])for(const intensity of[0,10,80,95])for(const eq of equalizationMethods){const input={...params(method,intensity),equalize:true,equalization:settings(eq.id)},before=structuredClone(input),plan=equalizationPlan('detail.gradient',input);assert.equal(plan.base.intensity,intensity);assert.equal(plan.base.equalize,eq.id==='histogram');assert.equal(plan.post,eq.id!=='histogram');assert.equal(plan.base.toneBeforeEqualize,eq.id==='histogram'?true:undefined);assert.equal(plan.channels,true);assert.equal(plan.finish,null);assert.deepEqual(input,before);}
 assert.equal(OPENCV_OPERATIONS['detail.gradient'].validate().intensity,95);assert.equal(OPENCV_OPERATIONS['detail.gradient'].validate({method:'krawetz'}).intensity,0);
 assert.equal(equalizationPlan('detail.gradient',{...params('sobel',95),equalize:true}),null);
 const none=equalizationPlan('detail.gradient',{...params('sobel',95),equalization:settings('none')});assert.equal(none.post,false);assert.equal(none.base.intensity,95);assert.equal(none.base.equalize,false);
});
for(const route of['native-contiguous','bounded-parameter-preview'])for(const method of['sobel','krawetz'])test('gradient intensity precedes all16 equalizations: '+route+'/'+method,async()=>{
 await initGradientWasm({wasmBinary:wasm});const engine=createEngine({memoryBudgetBytes:256*1024**2,cpuKernel:'single'}),oracleBudget=new Budget(128*1024**2),outputs={};
 const task=p=>({id:'gradient-eq-'+(++serial),imageId:'original',operation:'detail.gradient',params:p,backend:'cpu'});
 try{await engine.load({id:'original',bytes:Uint8Array.of(1,2,3),pixels,...(route==='bounded-parameter-preview'?{provenance:{decoder:route}}:{})});
  for(const intensity of[10,80]){const p=params(method,intensity),native=await engine.run(task(p)),nativePixels=await frame(engine,native),saved=nativePixels.data.slice();
   for(const eq of equalizationMethods){const state=settings(eq.id),expected=await equalizationPixels(nativePixels,compositionPlan(state),{budget:oracleBudget}),actual=await engine.run(task({...p,equalize:true,equalization:state}));try{const rgb=await frame(engine,actual);assert.deepEqual(rgb.data,expected.data,method+'/'+eq.id+'/'+intensity);assert.equal(actual.provenance.params.intensity,intensity);assert.deepEqual(actual.provenance.params.equalization,state);assert.deepEqual(nativePixels.data,saved,'composed output cannot mutate the native gradient');if(route==='bounded-parameter-preview')assert.equal(actual.metrics.analysisCacheHit,true,'tone/EQ changes retain derivatives');if(['ahe','clahe','bpdhe'].includes(eq.id))outputs[eq.id+'/'+intensity]=rgb.data.slice();}finally{await release(engine,actual);}assert.equal(oracleBudget.total(),0);}
   await release(engine,native);
  }
  for(const eq of['ahe','clahe','bpdhe'])assert.notDeepEqual(outputs[eq+'/10'],outputs[eq+'/80'],'the controlled texture retains requested intensity before '+eq);
 }finally{await engine.dispose();releaseGradientWasm();assert.equal(engine.capabilities().memory.retainedBytes,0);assert.equal(engine.capabilities().memory.activeReservationBytes,0);assert.equal(oracleBudget.total(),0);}
});
test('zero intensity full histogram matches native legacy and no-EQ retains historical defaults',async()=>{
 await initGradientWasm({wasmBinary:wasm});const engine=createEngine({memoryBudgetBytes:256*1024**2,cpuKernel:'single'}),op=OPENCV_OPERATIONS['detail.gradient'];let a,b;
 try{await engine.load({id:'original',bytes:Uint8Array.of(1),pixels});for(const method of['sobel','krawetz']){const p=params(method,0),task=p=>({id:'zero-'+(++serial),imageId:'original',operation:'detail.gradient',params:p,backend:'cpu'});a=await engine.run(task({...p,equalize:true}));b=await engine.run(task({...p,equalization:settings('histogram')}));assert.deepEqual((await frame(engine,b)).data,(await frame(engine,a)).data,'explicit zero-strength HE preserves native equalization');await release(engine,a);await release(engine,b);a=b=null;const legacy={...params(method,95),equalize:true};a=await engine.run(task(legacy));const expected=await op.compute(pixels,op.validate(legacy),{});assert.deepEqual((await frame(engine,a)).data,expected.pixels.data);await release(engine,a);a=null;}}
 finally{await release(engine,a);await release(engine,b);await engine.dispose();releaseGradientWasm();assert.equal(engine.capabilities().memory.retainedBytes,0);assert.equal(engine.capabilities().memory.activeReservationBytes,0);}
});
test('gradient integer, boolean and method validation are preserved after explicit composition',()=>{
 for(const intensity of[-1,101,.5,NaN,'80',null])assert.throws(()=>OPENCV_OPERATIONS['detail.gradient'].validate(equalizationPlan('detail.gradient',{...params('sobel',intensity),equalization:settings('bpdhe')}).base),{code:'INVALID_INPUT'});
 for(const invalid of[{method:'missing'},{invert:'yes'},{mode:4},{extra:1}])assert.throws(()=>OPENCV_OPERATIONS['detail.gradient'].validate(equalizationPlan('detail.gradient',{...params('sobel',80),...invalid,equalization:settings('clahe')}).base),{code:'INVALID_INPUT'});
 assert.throws(()=>equalizationPlan('detail.gradient',{...params('sobel',80),equalization:{method:'missing',values:equalizationMethods.map(m=>m.default)}}),TypeError);
});

test('fused tone/HE LUT equals the explicit two-stage histogram for every input code and requested intensity',()=>{
 const histogram=Float64Array.from({length:768},(_,i)=>(i*19)%23+1),n=histogram.subarray(0,256).reduce((a,b)=>a+b,0);
 // Use an equal population in each channel, with differing distributions.
 for(let c=1;c<3;c++)histogram.set(histogram.subarray(0,256).slice().reverse(),c*256);
 for(const intensity of[0,10,80,100]){
  const p=params('sobel',intensity),tone=gradientToneLut(histogram,n,p),fused=gradientToneLut(histogram,n,{...p,equalize:true,toneBeforeEqualize:true});
  for(let c=0;c<3;c++){const toned=new Float64Array(256);for(let i=0;i<256;i++)toned[tone[c*256+i]]+=histogram[c*256+i];const he=equalizeHistogramLut(toned,n);for(let i=0;i<256;i++)assert.equal(fused[c*256+i],he[tone[c*256+i]],intensity+'/'+c+'/'+i);}
 }
 const flat=new Float64Array(768);for(let c=0;c<3;c++)flat[c*256+127]=9;
 for(const intensity of[0,10,80,100]){const tone=gradientToneLut(flat,9,params('sobel',intensity)),fused=gradientToneLut(flat,9,{...params('sobel',intensity),equalize:true,toneBeforeEqualize:true});for(let c=0;c<3;c++)assert.equal(fused[c*256+127],tone[c*256+127]);}
});
for(const route of['native-contiguous','bounded-parameter-preview'])test('fused full histogram preserves tone-first output, cache separation and all Sobel displays: '+route,async()=>{
 await initGradientWasm({wasmBinary:wasm});const engine=createEngine({memoryBudgetBytes:256*1024**2,cpuKernel:'single'}),oracleBudget=new Budget(128*1024**2),task=p=>({id:'fusion-'+(++serial),imageId:'original',operation:'detail.gradient',params:p,backend:'cpu'});
 try{await engine.load({id:'original',bytes:Uint8Array.of(1),pixels,...(route==='bounded-parameter-preview'?{provenance:{decoder:route}}:{})});
  for(const method of['sobel','krawetz'])for(const mode of method==='sobel'?[0,1,2,3]:[2])for(const invert of[false,true])for(const intensity of[0,10,80,100]){
   const p={...params(method,intensity),mode,invert},raw=await engine.run(task(p)),rawPixels=await frame(engine,raw),expected=await equalizationPixels(rawPixels,compositionPlan(settings('histogram')),{budget:oracleBudget}),actual=await engine.run(task({...p,equalization:settings('histogram')}));
   try{assert.deepEqual((await frame(engine,actual)).data,expected.data,JSON.stringify([route,method,mode,invert,intensity]));assert.equal(actual.provenance.params.intensity,intensity);assert.deepEqual(actual.provenance.params.equalization,settings('histogram'));}finally{await release(engine,actual);await release(engine,raw);}
  }
  const p={...params('sobel',80),equalization:settings('histogram')},a=await engine.run(task(p)),saved=(await frame(engine,a)).data.slice(),legacy=await engine.run(task({...params('sobel',80),equalize:true})),b=await engine.run(task({...p,intensity:10})),again=await engine.run(task(p));
  assert.deepEqual((await frame(engine,again)).data,saved);assert.notDeepEqual((await frame(engine,b)).data,saved);assert.notDeepEqual((await frame(engine,legacy)).data,saved);if(route==='native-contiguous')assert.equal(again.metrics.cache.result,true);else assert.equal(again.metrics.analysisCacheHit,true);
  for(const r of[a,legacy,b,again])await release(engine,r);
 }finally{await engine.dispose();releaseGradientWasm();assert.equal(engine.capabilities().memory.retainedBytes,0);assert.equal(engine.capabilities().memory.activeReservationBytes,0);assert.equal(oracleBudget.total(),0);}
});
test('strict mask fusion counts admitted toned pixels only and cancellation retains published output',async()=>{
 await initGradientWasm({wasmBinary:wasm});const engine=createEngine({memoryBudgetBytes:256*1024**2,cpuKernel:'single'});
 try{const loaded=await engine.load({id:'original',bytes:Uint8Array.of(7),pixels}),state=await createOriginalSourceRegionsState({width,height,sourceSha256:loaded.sha256});await state.add('exclusion',{x0:9,y0:0,x1:13,y1:height});await state.add('exclusion',{x0:3,y0:4,x1:7,y1:12});const domain=await compileOriginalSourceRegions(state.snapshot()),task=p=>({id:'masked-fusion-'+(++serial),imageId:'original',operation:'detail.gradient',params:p,backend:'cpu',sourceRegionDomain:domain.descriptor});
  for(const method of['sobel','krawetz'])for(const intensity of[0,10,80,100]){const p=params(method,intensity),raw=await engine.run(task(p)),rgb=await frame(engine,raw),mask=(await engine.readMask({surfaceId:raw.maskSurfaces.analysis_scope.id,revision:raw.maskSurfaces.analysis_scope.revision})).mask.data,histogram=new Float64Array(768),expected=rgb.data.slice();let count=0;for(let i=0;i<mask.length;i++)if(mask[i]){count++;for(let c=0;c<3;c++)histogram[c*256+rgb.data[i*3+c]]++;}const tables=[0,1,2].map(c=>equalizeHistogramLut(histogram.subarray(c*256,(c+1)*256),count));for(let i=0;i<mask.length;i++)if(mask[i])for(let c=0;c<3;c++)expected[i*3+c]=tables[c][rgb.data[i*3+c]];const actual=await engine.run(task({...p,equalization:settings('histogram')}));try{assert.deepEqual((await frame(engine,actual)).data,expected,method+'/'+intensity);assert.equal(actual.metrics.analysedPixels,count);}finally{await release(engine,actual);await release(engine,raw);}}
  const p={...params('krawetz',80),equalization:settings('histogram')},before=await engine.run(task(p)),saved=(await frame(engine,before)).data.slice(),stop=new AbortController();await assert.rejects(engine.run(task({...p,intensity:10}),{signal:stop.signal,onProgress:event=>{if(event.phase==='source-region-gradient-tone')stop.abort();}}),{code:'CANCELLED'});assert.deepEqual((await frame(engine,before)).data,saved);assert.equal(engine.capabilities().memory.activeReservationBytes,0);const retry=await engine.run(task(p));assert.deepEqual((await frame(engine,retry)).data,saved);await release(engine,before);await release(engine,retry);
 }finally{await engine.dispose();releaseGradientWasm();assert.equal(engine.capabilities().memory.retainedBytes,0);assert.equal(engine.capabilities().memory.activeReservationBytes,0);}
});
test('tone order is an optional strict flag and cannot alias the unchanged legacy result key',()=>{
 const validate=OPENCV_OPERATIONS['detail.gradient'].validate,p={...params('sobel',80),equalize:true};assert.deepEqual(validate({...p,toneBeforeEqualize:false}),validate(p));assert.notEqual(JSON.stringify(validate({...p,toneBeforeEqualize:true})),JSON.stringify(validate(p)));
 for(const value of[0,1,null,undefined,'true',{},[]])assert.throws(()=>validate({...p,toneBeforeEqualize:value}),{code:'INVALID_INPUT'});assert.throws(()=>validate({...p,equalize:false,toneBeforeEqualize:true}),{code:'INVALID_INPUT'});
});

test('modern HE provenance can be reused for BPDHE, none and HE without retaining a stale internal tone flag',async()=>{
 await initGradientWasm({wasmBinary:wasm});const engine=createEngine({memoryBudgetBytes:256*1024**2,cpuKernel:'single'}),oracleBudget=new Budget(128*1024**2),task=p=>({id:'provenance-'+(++serial),imageId:'original',operation:'detail.gradient',params:p,backend:'cpu'});
 try{await engine.load({id:'original',bytes:Uint8Array.of(1),pixels});for(const method of['sobel','krawetz']){
  const raw=await engine.run(task(params(method,80))),rawPixels=await frame(engine,raw),first=await engine.run(task({...params(method,80),equalization:settings('histogram')})),firstBytes=(await frame(engine,first)).data.slice(),captured=structuredClone(first.provenance.params);assert.equal(captured.toneBeforeEqualize,true);
  for(const eq of['bpdhe','none']){const next={...captured,equalization:settings(eq)},saved=structuredClone(next),plan=equalizationPlan('detail.gradient',next);assert.equal(Object.hasOwn(plan.base,'toneBeforeEqualize'),false);assert.deepEqual(next,saved);const result=await engine.run(task(next));try{const expected=eq==='none'?rawPixels:await equalizationPixels(rawPixels,compositionPlan(settings(eq)),{budget:oracleBudget});assert.deepEqual((await frame(engine,result)).data,expected.data);const again=await engine.run(task({...result.provenance.params,equalization:settings('histogram')}));try{assert.deepEqual((await frame(engine,again)).data,firstBytes);}finally{await release(engine,again);}}finally{await release(engine,result);}}
  await release(engine,raw);await release(engine,first);
 }}finally{await engine.dispose();releaseGradientWasm();assert.equal(engine.capabilities().memory.retainedBytes,0);assert.equal(engine.capabilities().memory.activeReservationBytes,0);assert.equal(oracleBudget.total(),0);}
});
