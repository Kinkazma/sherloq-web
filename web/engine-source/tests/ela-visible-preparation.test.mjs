import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {ElaGpu,createElaGpuService,getElaGpuService,disposeElaGpuService} from '../src/ela-gpu.js';
import {createEngine} from '../src/index.js';
import {readFile} from 'node:fs/promises';
import {createOriginalSourceRegionsState} from '../src/source-region-geometry.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
const MiB=1024**2,turn=()=>new Promise(resolve=>setImmediate(resolve));
function hardware(t,{compileGate,retireGate}={}){
 const old=Object.getOwnPropertyDescriptor(globalThis,'navigator'),calls={adapters:0,devices:0,compiled:[],submitted:0,destroyed:0};let entered;const compiling=new Promise(resolve=>entered=resolve);
 const device={lost:undefined,queue:{submit(){calls.submitted++;},async onSubmittedWorkDone(){await retireGate;}},createShaderModule(){return{async getCompilationInfo(){return{messages:[]};}};},async createComputePipelineAsync({compute}){calls.compiled.push(compute.entryPoint);entered();if(calls.compiled.length===1)await compileGate;return{entryPoint:compute.entryPoint};},destroy(){calls.destroyed++;}};
 Object.defineProperty(globalThis,'navigator',{value:{gpu:{async requestAdapter(){calls.adapters++;return{limits:{maxBufferSize:512*MiB,maxStorageBufferBindingSize:512*MiB},async requestDevice(){calls.devices++;return device;}};}}},configurable:true});
 t.after(()=>{if(old)Object.defineProperty(globalThis,'navigator',old);else delete globalThis.navigator;});return{calls,device,compiling};
}
test('visible preparation compiles three existing pipelines without image work and stays reclaimable',async t=>{
 const h=hardware(t),budget=new Budget(64*MiB),gpu=new ElaGpu(budget,{loadShader:async()=> 'fixture shader'});let evicted=0;
 budget.put('native-useful',{byteLength:MiB,onEvict(){evicted++;}});const before=budget.total(),first=await gpu.prepare();
 assert.equal(first.prepared,true);assert.deepEqual(first.pipelines,['residual','codec','render']);assert.equal(first.compiledPipelines,3);assert.equal(first.retainedBytes,12*MiB);assert.equal(first.imageComputeCalls,0);assert.equal(h.calls.submitted,0);assert.equal(budget.total(),before+12*MiB);assert.equal(evicted,0);assert.equal(gpu.busy,false);
 const second=await gpu.prepare();assert.equal(second.compiledPipelines,0);assert.equal(h.calls.compiled.length,3);await [...budget.asyncReclaimers][0]();assert.equal(budget.total(),before);assert.equal(h.calls.destroyed,1);assert.equal(evicted,0);await gpu.dispose();budget.clear();assert.equal(budget.total(),0);
});
test('optional preparation cannot evict a useful cache to admit its pipeline fees',async t=>{
 const h=hardware(t),budget=new Budget(16*MiB);let evicted=0,providers=0;budget.put('native',{byteLength:8*MiB,onEvict(){evicted++;}});
 const service=createElaGpuService(budget,{createProvider:()=>{providers++;return new ElaGpu(budget,{loadShader:async()=> ''});}}),answer=await service.prepare();assert.equal(answer.prepared,false);assert.equal(answer.reason,'idle-memory-unavailable');assert.equal(providers,0);assert.equal(h.calls.adapters,0);assert.equal(evicted,0);assert.equal(budget.total(),8*MiB);await service.dispose();budget.clear();
});
test('native admission keeps prepared pipelines when the complete working set fits',async t=>{
 const h=hardware(t),budget=new Budget(64*MiB),service=createElaGpuService(budget,{createProvider:()=>new ElaGpu(budget,{loadShader:async()=> ''})});let evicted=0;
 budget.put('native',{byteLength:8*MiB,onEvict(){evicted++;}});await service.prepare();const before=budget.total();assert.deepEqual(await service.prepareNative(32*MiB),{retired:false,releasedBytes:0});assert.equal(budget.total(),before);assert.equal(h.calls.destroyed,0);assert.equal(evicted,0);assert.equal((await service.prepare()).compiledPipelines,0);await service.dispose();budget.clear();assert.equal(budget.total(),0);
});
test('native admission retires optional pipelines before room and credits only their ACK',async t=>{
 let done;const gate=new Promise(resolve=>done=resolve),h=hardware(t,{retireGate:gate}),budget=new Budget(32*MiB),service=createElaGpuService(budget,{createProvider:()=>new ElaGpu(budget,{loadShader:async()=> ''})});let evicted=0;
 budget.put('native',{byteLength:8*MiB,onEvict(){evicted++;}});await service.prepare();let admitted=false;const native=service.prepareNative(18*MiB).then(answer=>{assert.equal(answer.retired,true);assert.equal(answer.releasedBytes,12*MiB);const release=budget.reserve(18*MiB);admitted=true;release();});await turn();assert.equal(admitted,false);assert.equal(budget.total(),20*MiB);assert.equal(evicted,0);done();await native;assert.equal(budget.total(),8*MiB);assert.equal(evicted,0);assert.equal(h.calls.destroyed,1);assert.equal((await service.prepare()).prepared,true,'A later proxy with headroom can recreate the GPU provider');assert.equal(h.calls.devices,2);assert.equal(h.calls.submitted,0);await service.dispose();budget.clear();
});
test('failed native retirement ACK preserves fees and useful cache until an acknowledged retry',async t=>{
 const h=hardware(t),budget=new Budget(32*MiB),service=createElaGpuService(budget,{createProvider:()=>new ElaGpu(budget,{loadShader:async()=> ''})});let calls=0,evicted=0;
 h.device.queue.onSubmittedWorkDone=async()=>{if(++calls===1)throw Error('ACK failed');};budget.put('native',{byteLength:8*MiB,onEvict(){evicted++;}});await service.prepare();await assert.rejects(service.prepareNative(18*MiB),/ACK failed/);assert.equal(budget.total(),20*MiB);assert.equal(evicted,0);assert.equal((await service.prepareNative(18*MiB)).releasedBytes,12*MiB);assert.equal(budget.total(),8*MiB);assert.equal(evicted,0);await service.dispose();budget.clear();
});
test('cancelled native admission still waits for retirement ACK and never admits native work',async t=>{
 let done;const gate=new Promise(resolve=>done=resolve);hardware(t,{retireGate:gate});const budget=new Budget(32*MiB),service=createElaGpuService(budget,{createProvider:()=>new ElaGpu(budget,{loadShader:async()=> ''})}),stop=new AbortController();
 await service.prepare();let settled=false;const native=assert.rejects(service.prepareNative(28*MiB,{signal:stop.signal}),{code:'CANCELLED'}).finally(()=>settled=true);await turn();stop.abort();await turn();assert.equal(settled,false);assert.equal(budget.total(),12*MiB);done();await native;assert.equal(budget.total(),0);assert.equal((await service.prepare()).prepared,true);await service.dispose();
});
test('cancelled compilation and parking retain credit until actual retirement ACK',async t=>{
 let compileDone,retireDone;const compileGate=new Promise(resolve=>compileDone=resolve),retireGate=new Promise(resolve=>retireDone=resolve),h=hardware(t,{compileGate,retireGate}),budget=new Budget(64*MiB),gpu=new ElaGpu(budget,{loadShader:async()=> ''}),service=createElaGpuService(budget,{createProvider:()=>gpu}),stop=new AbortController();
 let settled=false;const prepare=service.prepare({signal:stop.signal}),rejected=assert.rejects(prepare,error=>error.code==='CANCELLED').finally(()=>settled=true);await turn();assert.equal(gpu.busy,true);assert.equal(budget.total(),4*MiB);assert.equal(await [...budget.asyncReclaimers][0](),0);assert.equal(h.calls.destroyed,0);
 stop.abort();let parked=false;const parking=service.dispose().then(()=>parked=true);compileDone();await turn();assert.equal(settled,false);assert.equal(parked,false);assert.equal(budget.total(),4*MiB,'No credit is released before the device retirement ACK');retireDone();await rejected;await parking;assert.equal(budget.total(),0);assert.equal(gpu.busy,false);assert.equal(h.calls.submitted,0);
});
test('disposing a prepared budget service allows the next service to be recreated',async t=>{
 const h=hardware(t);
 const budget=new Budget(64*MiB),first=getElaGpuService(budget);await disposeElaGpuService(budget);const next=getElaGpuService(budget);assert.notEqual(next,first);await disposeElaGpuService(budget);assert.equal(h.calls.submitted,0);assert.equal(budget.total(),0);
});
test('CPU preparation never creates a GPU provider or modifies backend observations',async t=>{
 hardware(t);const budget=new Budget(64*MiB);let providers=0;const service=createElaGpuService(budget,{createProvider:()=>{providers++;throw Error('No GPU expected');}}),source={},params={linear:false,grayscale:false},before=service.policySnapshot('residual',source,8,8,params);
 assert.equal((await service.prepare({backend:'cpu'})).reason,'cpu-requested');assert.equal(providers,0);assert.deepEqual(service.policySnapshot('residual',source,8,8,params),before);await service.dispose();
});
test('native execution has priority over optional pipeline preparation',async t=>{const h=hardware(t),budget=new Budget(64*MiB),gpu=new ElaGpu(budget,{loadShader:async()=> ''}),native=await getExecutionScheduler(budget).acquire({cpu:1,label:'actual-native'});try{const answer=await gpu.prepare();assert.equal(answer.prepared,false);assert.equal(answer.reason,'native-work-active');assert.equal(h.calls.adapters,0);assert.equal(budget.total(),0);}finally{native.release();await gpu.dispose();}});
test('an unavailable GPU leaves module-only preparation without allocating a provider',async t=>{hardware(t);Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});const budget=new Budget(64*MiB);let providers=0;const service=createElaGpuService(budget,{createProvider:()=>{providers++;throw Error('No provider expected');}});assert.equal((await service.prepare()).reason,'gpu-unavailable');assert.equal(providers,0);assert.equal(budget.total(),0);await service.dispose();});
test('engine preparation validates source and backend, and parking preserves source pixels/provenance',async()=>{
 const data=Uint8Array.of(17,31,99,151,207,251),bytes=Uint8Array.of(1,2,3),engine=createEngine({memoryBudgetBytes:64*MiB,cpuKernel:'reference'});
 try{const source=await engine.load({id:'visible-source',bytes,pixels:{format:'rgb8',width:2,height:1,data},provenance:{decoder:'fixture',format:'png'}}),request={imageId:source.id,sourceSha256:source.sha256,params:{quality:75,scale:50},backend:'cpu'},before=engine.capabilities().memory;
  await assert.rejects(engine.prepareElaClassicPreview({...request,sourceSha256:'wrong'}),{code:'INVALID_INPUT'});await assert.rejects(engine.prepareElaClassicPreview({...request,backend:'invalid'}),{code:'INVALID_INPUT'});
  const otherScope=await createOriginalSourceRegionsState({sourceSha256:'b'.repeat(64),width:2,height:1});await assert.rejects(engine.prepareElaClassicPreview({...request,sourceRegionDomain:otherScope.snapshot()}),{code:'SOURCE_REGIONS_INVALID'});
  const prepared=await engine.prepareElaClassicPreview(request);assert.equal(prepared.prepared,true);assert.equal(prepared.level,'worker');assert.equal(prepared.gpuPrepared,false);assert.equal(prepared.metrics.nativeAnalysisCalls,0);assert.equal(prepared.metrics.imageComputeCalls,0);assert.equal(prepared.metrics.recompressions,0);
  assert.equal((await engine.parkElaClassicPreview({sourceKey:'another-owner'})).parked,false);assert.equal((await engine.parkElaClassicPreview({sourceKey:prepared.sourceKey})).parked,true);assert.deepEqual(await engine.original(source.id),bytes);assert.deepEqual(await engine.imagePixels(source.id),{format:'rgb8',width:2,height:1,data});assert.equal(engine.capabilities().memory.retainedBytes,before.retainedBytes);
 }finally{await engine.dispose();}
});
test('aborted engine preparation keeps its source key so parking can retry a failed retirement ACK',async t=>{
 let compileDone,retireDone;const compileGate=new Promise(resolve=>compileDone=resolve),retireGate=new Promise(resolve=>retireDone=resolve),h=hardware(t,{compileGate});let retireCalls=0;
 h.device.queue.onSubmittedWorkDone=async()=>{if(++retireCalls===1)throw Error('Retirement ACK failed');await retireGate;};
 const oldFetch=globalThis.fetch;globalThis.fetch=async url=>{const bytes=await readFile(new URL(url));return{ok:true,json:async()=>JSON.parse(bytes),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};};
 const engine=createEngine({memoryBudgetBytes:64*MiB}),data=Uint8Array.of(1,2,3);t.after(async()=>{compileDone();retireDone();await engine.dispose();globalThis.fetch=oldFetch;});
 const source=await engine.load({id:'abort-source',bytes:Uint8Array.of(7),pixels:{format:'rgb8',width:1,height:1,data}}),stop=new AbortController(),key=JSON.stringify([source.id,source.sha256,null,'webgpu']);let failed;
 const preparing=engine.prepareElaClassicPreview({imageId:source.id,sourceSha256:source.sha256,params:{},backend:'webgpu'},{signal:stop.signal}).catch(error=>{failed=error;});await h.compiling;assert.equal(h.calls.compiled.length,1);stop.abort();compileDone();await preparing;assert.equal(failed.code,'CANCELLED');assert(failed.elaGpuCleanupErrors?.length||failed.cleanupErrors?.length||failed.cause||h.calls.destroyed===1);const retained=engine.capabilities().memory.activeReservationBytes;assert.equal(retained,4*MiB);
 let parked=false;const parking=engine.parkElaClassicPreview({sourceKey:key}).then(answer=>{parked=true;return answer;});await turn();assert.equal(parked,false);retireDone();const answer=await parking;assert.equal(answer.parked,true);assert.equal(answer.releasedBytes,4*MiB);assert.equal(engine.capabilities().memory.activeReservationBytes,0);assert.deepEqual(await engine.imagePixels(source.id),{format:'rgb8',width:1,height:1,data});assert.equal(h.calls.submitted,0);
});
test('engine native admission waits for optional GPU ACK and keeps the prior native recompression cache',async t=>{
 let retireDone;const retireGate=new Promise(resolve=>retireDone=resolve),h=hardware(t,{retireGate});let recompressions=0;
 const codec={id:'bounded-native-fixture',async recompress(pixels,quality){recompressions++;return{...pixels,data:pixels.data.map(value=>Math.min(255,value+quality%7))};}},oldFetch=globalThis.fetch;
 globalThis.fetch=async url=>{const bytes=await readFile(new URL(url));return{ok:true,json:async()=>JSON.parse(bytes),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};};
 const engine=createEngine({memoryBudgetBytes:64*MiB,codec,cpuKernel:'single'});t.after(async()=>{retireDone();await engine.dispose();globalThis.fetch=oldFetch;});
 const source=await engine.load({id:'native-headroom',bytes:Uint8Array.of(9),pixels:{format:'rgb8',width:1,height:1,data:Uint8Array.of(17,100,211)}}),task={id:'native-before',imageId:source.id,operation:'ela.classic',params:{quality:75},backend:'cpu'};
 await engine.run(task);assert.equal(recompressions,1);const prepared=await engine.prepareElaClassicPreview({imageId:source.id,sourceSha256:source.sha256,params:task.params,backend:'webgpu'});assert.equal(prepared.gpuPrepared,true);
 let complete=false;const running=engine.run({...task,id:'native-after',params:{quality:76}}).then(answer=>{complete=true;return answer;});await turn();assert.equal(complete,false);assert.equal(recompressions,1,'Native JPEG work cannot start before retirement is acknowledged');assert.equal(engine.capabilities().memory.activeReservationBytes,12*MiB);retireDone();assert.equal((await running).status,'ok');assert.equal(recompressions,2);assert.equal(h.calls.destroyed,1);assert.equal(h.calls.submitted,0);
 const cached=await engine.run({...task,id:'native-reuse',params:{quality:75,scale:70,linear:true}});assert.equal(cached.metrics.cache.recompressed,true);assert.equal(recompressions,2);assert.equal((await engine.parkElaClassicPreview({sourceKey:prepared.sourceKey})).parked,true);
});
