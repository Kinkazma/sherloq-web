import test from'node:test';import assert from'node:assert/strict';
import{Budget}from'../src/cache.js';import{contiguousSurface}from'../src/image-sources.js';import{EngineError}from'../src/errors.js';
import{gradientParams}from'../src/gradient-parameters.js';import{gradientFieldCostIdentity}from'../src/gradient-field-parameters.js';import{gradientFieldSurface}from'../src/gradient-field.js';
import{getGradientFieldGpu,disposeGradientFieldGpu}from'../src/gradient-field-gpu.js';
import{createEngine}from'../src/index.js';import{createOriginalSourceRegionsState,compileOriginalSourceRegions}from'../src/source-region-geometry.js';
import{prefilter,derivativeBlock}from'../src/gradient-field-math.js';
const small={width:19,height:17,format:'rgb8',data:Uint8Array.from({length:19*17*3},(_,i)=>(i*73+(i>>>3)*19)%256)};
async function cleanup(image,budget,result){await result?.surface.dispose();await disposeGradientFieldGpu(budget);budget.clearPrefix('audit');await image.surface.dispose();assert.equal(budget.total(),0);}
test('wide short images admit clipped native halos after switching to large support and tensor views',async()=>{
 const width=4096,height=2,pixels={width,height,format:'rgb8',data:Uint8Array.from({length:width*height*3},(_,i)=>i%256)},budget=new Budget(128*1024**2),image={surface:contiguousSurface(pixels,budget)};let result;
 try{for(const view of['angle','coherence','native']){const params=gradientParams({method:'gaussian',view,kernelSize:63,sampleStep:16,tensorSize:127});result=await gradientFieldSurface(image,params,{budget,backend:'cpu',cacheKey:'audit-wide'});assert.equal(result.surface.descriptor.width,width);assert.equal(result.surface.descriptor.height,height);const lease=await result.surface.readWindow();assert.equal(lease.pixels.data.length,width*height*3);await lease.release();await result.surface.dispose();result=null;}}finally{await cleanup(image,budget,result);}
});
test('a callback failure resembling a GPU error never triggers a CPU retry',async()=>{
 const budget=new Budget(64*1024**2),image={surface:contiguousSurface(small,budget)},error=new EngineError('GPU_FAILED','Caller callback failure');let calls=0,result;
 try{await assert.rejects(async()=>{result=await gradientFieldSurface(image,gradientParams({method:'scharr',view:'angle'}),{budget,backend:'auto',cacheKey:'audit-callback',onProgress(){if(++calls===1)throw error;}});},e=>e===error);assert.equal(calls,1);}finally{await cleanup(image,budget,result);}
});
test('automatic GPU allocation refusal falls back after retiring its GPU owner',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator'),budget=new Budget(64*1024**2),image={surface:contiguousSurface(small,budget)},params=gradientParams({method:'scharr',view:'angle'}),reserve=budget.reserve.bind(budget);let refused=false,result;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu:{requestAdapter(){throw Error('Allocation should refuse before adapter acquisition');}}}});
 budget.reserve=bytes=>{if(bytes===4*1024**2&&!refused){refused=true;throw new EngineError('MEMORY_LIMIT','Injected GPU pipeline reservation refusal');}return reserve(bytes);};
 try{getGradientFieldGpu(budget).observeCpu(image,100,gradientFieldCostIdentity(params));result=await gradientFieldSurface(image,params,{budget,backend:'auto',cacheKey:'audit-memory'});assert.equal(refused,true);assert.equal(result.metrics.backend,'cpu');assert.equal(result.metrics.gradientGpuFallback,'MEMORY_LIMIT');}finally{await cleanup(image,budget,result);if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});

test('a failed automatic adapter is not retried for every later parameter change; explicit GPU stays strict',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator'),budget=new Budget(64*1024**2),image={surface:contiguousSurface(small,budget)},gpu=getGradientFieldGpu(budget);let requests=0,result;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu:{async requestAdapter(){requests++;return null;}}}});
 try{for(const sigma of[1,2,.3,1,4]){const params=gradientParams({method:'gaussian',view:'angle',sigma});gpu.observeCpu(image,100,gradientFieldCostIdentity(params));result=await gradientFieldSurface(image,params,{budget,backend:'auto',cacheKey:'audit-no-adapter'});assert.equal(result.metrics.backend,'cpu');assert.equal(requests,1);await result.surface.dispose();result=null;}await assert.rejects(gradientFieldSurface(image,gradientParams({method:'gaussian',view:'coherence'}),{budget,backend:'webgpu',cacheKey:'audit-no-adapter'}),{code:'GPU_UNAVAILABLE'});assert.equal(requests,2);}finally{await cleanup(image,budget,result);if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});

test('automatic GPU can recover from memory pressure after useful headroom returns',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator'),budget=new Budget(64*1024**2),token={},gpu=getGradientFieldGpu(budget),held=budget.reserve(8*1024**2),key='cost';
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu:{}}});
 try{gpu.observeCpu(token,100,key);gpu.observeGpuFailure(token,key,new EngineError('MEMORY_LIMIT','pressure'));assert.equal(gpu.shouldRun(token,'auto',key),false);held();assert.equal(gpu.shouldRun(token,'auto',key),true);}finally{held();if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});

test('temporary-cache cleanup failure preserves the source error and retires all independent reservations',async()=>{
 const budget=new Budget(64*1024**2),primary=new EngineError('SOURCE_READ_FAILED','Injected source failure'),cleanupError=new EngineError('STORAGE_FAILED','Injected temporary cleanup failure');let disposals=0;
 const image={surface:{descriptor:{width:1024,height:4096,format:'rgb8'},readWindow(){throw primary;}},session:{backend:'opfs',async create(byteLength){return{byteLength,async dispose(){disposals++;throw cleanupError;}};}}};
 await assert.rejects(gradientFieldSurface(image,gradientParams({method:'scharr',view:'angle'}),{budget,backend:'cpu',cacheKey:'audit-cleanup'}),error=>error===primary);
 assert.equal(disposals,1);assert.equal(budget.total(),0);assert(primary.cleanupErrors?.some(e=>e.code==='STORAGE_FAILED'));
});

test('scoped field progress keeps public task envelopes and permits cancellation at a rendering stage',async()=>{
 const engine=createEngine({memoryBudgetBytes:192*1024**2,cpuKernel:'auto'});let sawKernel=false;
 try{const original=await engine.load({id:'input',bytes:Uint8Array.of(1),pixels:small}),selection=await createOriginalSourceRegionsState({width:small.width,height:small.height,sourceSha256:original.sha256});await selection.add('exclusion',{x0:6,y0:5,x1:10,y1:9});const domain=await compileOriginalSourceRegions(selection.snapshot()),stop=new AbortController();
  await assert.rejects(engine.run({id:'scoped-progress',imageId:'input',operation:'detail.gradient',params:{method:'scharr',view:'coherence'},backend:'cpu',sourceRegionDomain:domain.descriptor},{signal:stop.signal,onProgress:event=>{assert.equal(typeof event,'object');assert.equal(event.id,'scoped-progress');if(event.phase==='source-region-gradient-field'&&event.fraction>=.65){sawKernel=true;stop.abort();}}}),{code:'CANCELLED'});assert.equal(sawKernel,true);
 }finally{await engine.dispose();assert.equal(engine.capabilities().memory.activeReservationBytes,0);assert.equal(engine.capabilities().memory.retainedBytes,0);}
});

test('linear operators keep the unused derivative exactly zero on a one-dimensional image',()=>{
 const width=43,height=37,M=new Uint8Array(width*height).fill(1);
 for(const method of['sobel','krawetz','disk','central','prewitt','scharr','farid','gaussian'])for(const axis of[0,1]){
  const p=gradientParams({method,view:'native',luma:'linear709',border:'reflect',preSigma:.7,preSize:7}),L=Float64Array.from({length:width*height},(_,i)=>{const z=axis?Math.floor(i/width):i%width;return .5+.3*Math.sin(z*.7)+.1*Math.cos(z*.21);}),f=derivativeBlock(prefilter(L,M,width,height,p),M,width,height,p);
  for(let i=0;i<width*height;i++)assert.equal(f[2*i+(axis?0:1)],0,method+' axis '+axis+' at '+i);
 }
});
