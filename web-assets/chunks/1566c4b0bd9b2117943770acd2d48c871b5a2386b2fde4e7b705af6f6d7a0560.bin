import "../../runtime-context.js?v=0.30.0";
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {initializeGpuOwner,openOwnedGpuDevice,retireOwnedGpuDevice,disposeGpuOwner,gpuOwnerSync,gpuOwnerAsync,gpuOwnerReserve,gpuOwnerFailure,gpuOwnerMayFallback} from './gpu-context-owner.js';
import {gpuTransaction,retireGpuTransaction,attachGpuCleanup} from './gpu-ack-retirement.js';
import {ownGpuArrays} from './gpu-owned-arrays.js';
import {densePmMetricWgsl} from './dense-pm-metric-wgsl.js';
import {densePmActiveWgsl} from './dense-pm-active-wgsl.js';
import {buildActiveDensePlan,validActiveDenseIndices} from './dense-pm-active-plan.js';
import {describeDensePmGeometry,createDensePmGeometryCoordinates} from './dense-pm-geometry.js';
import {normalizedBanksLoop,normalizedBanksCooperative} from './dense-pm-validation.js';

// Descriptor generation, live sequential reverse offers, coherence and model
// fitting retain their native CPU implementation. The GPU changes only the
// execution of initialization and the causal propagation/random-search graph.
// Four fronts are evaluated with a lower halo, then published in a separate
// dispatch. All winning sums and strict ties retain their native float32 order.
export function densePmGpuDomain(input,{content=true}={}){
 const {first,second=first,mask,width,height,dimensions,iterations=8,seed=729,minimum=5,radius=600,gap=[0,0],axes=null,compare=false}=input??{},n=width*height;
 return Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0&&n<0x7fffffff&&width*width+height*height<0x7fffffff&&[12,128].includes(dimensions)&&first instanceof Float32Array&&second instanceof Float32Array&&first.length===(input.activeIndices?.length??n)*dimensions&&second.length===first.length&&mask instanceof Uint8Array&&mask.length===n&&mask.every(v=>v<=3)&&validActiveDenseIndices(input)&&Number.isInteger(iterations)&&iterations>=1&&iterations<=0x7fffffff&&Number.isInteger(seed)&&seed>=0&&seed<=0xffffffff&&typeof compare==='boolean'&&[minimum,radius].every(Number.isFinite)&&minimum>=0&&radius>=minimum&&describeDensePmGeometry(width,height,{axes,gap,minimum,radius})!==null&&(!content||normalizedBanksLoop(first,second));
}

export class DensePmGpu {
 constructor(budget,{maxWorkers}={}){
  requireValue(budget?.reserve,'Dense GPU budget required');initializeGpuOwner(this,budget,'dense-pm');this.scheduler=getExecutionScheduler(budget,{maxWorkers});this.pipelines=new Map();this.pipelineFees=new Map();
  this.retirePipelines=async()=>{for(const[dimension,free]of this.pipelineFees){await free();this.pipelineFees.delete(dimension);this.pipelines.delete(dimension);}};
 }
 mayFallback(error){return gpuOwnerMayFallback(this,error);}
 async prepare(dimensions,requiredBytes,signal,metricMode='pixel'){
  if(this.closed)throw new EngineError('DISPOSED','Dense GPU provider is disposed');const alreadyBusy=this.busy;this.busy=true;
  try{return await this.preparePipelines(dimensions,requiredBytes,signal,metricMode);}finally{this.busy=alreadyBusy;}
 }
 async preparePipelines(dimensions,requiredBytes,signal,metricMode='pixel'){
  if(this.pending.size||this.retirementNeeded)await retireOwnedGpuDevice(this);
  if(this.device&&(this.lost||requiredBytes>this.device.limits.maxStorageBufferBindingSize||requiredBytes>this.device.limits.maxBufferSize))await retireOwnedGpuDevice(this);
  if(!this.device)await openOwnedGpuDevice(this,signal,adapter=>{
   if(requiredBytes>adapter.limits.maxStorageBufferBindingSize||requiredBytes>adapter.limits.maxBufferSize||adapter.limits.maxComputeWorkgroupStorageSize<16384)throw gpuOwnerFailure(this,new EngineError('GPU_LIMIT','Dense descriptor bank exceeds available GPU limits'));
   return {maxStorageBufferBindingSize:Math.max(128*1024**2,requiredBytes),maxBufferSize:Math.max(256*1024**2,requiredBytes),maxComputeWorkgroupStorageSize:16384};
  });
  const pipelineKey=dimensions+'/'+metricMode,cached=this.pipelines.get(pipelineKey);if(cached)return cached;
  const record=gpuTransaction(this);record.device=this.device;const fee=gpuOwnerReserve(this,6*1024**2);this.orphanPipelineFees.add(fee);let delivered=false,failed=false,primary;
  try{
   record.lease=await this.scheduler.acquire({cpu:0,gpu:1,signal,resourceOwner:'patchmatch',label:'dense-pm-pipeline'});
   const api=fn=>gpuOwnerSync(this,fn,signal),asyncApi=fn=>gpuOwnerAsync(this,fn,signal),device=this.device;
   api(()=>device.pushErrorScope('validation'));record.scopes++;api(()=>device.pushErrorScope('out-of-memory'));record.scopes++;
   const module=api(()=>device.createShaderModule({code:metricMode.endsWith('-active')?densePmActiveWgsl(dimensions,metricMode.slice(0,-7)):densePmMetricWgsl(dimensions,metricMode)})),info=await asyncApi(()=>module.getCompilationInfo());
   if(info.messages.some(v=>v.type==='error'))throw gpuOwnerFailure(this,new EngineError('GPU_FAILED',info.messages.filter(v=>v.type==='error').map(v=>v.message).join('\n')));
   const bindLayout=api(()=>device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},{binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}},{binding:5,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},{binding:6,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}}]})),layout=api(()=>device.createPipelineLayout({bindGroupLayouts:[bindLayout]})),pipelines={bindLayout};
   for(const entryPoint of ['initialize','propagate','commit'])pipelines[entryPoint]=await asyncApi(()=>device.createComputePipelineAsync({layout,compute:{module,entryPoint}}));
   while(record.scopes){const error=await asyncApi(()=>device.popErrorScope());record.scopes--;if(error)throw gpuOwnerFailure(this,new EngineError(error.constructor?.name==='GPUOutOfMemoryError'?'MEMORY_ALLOCATION':'GPU_FAILED',error.message));}
   record.drained=true;checkAbort(signal);this.pipelines.set(pipelineKey,pipelines);this.pipelineFees.set(pipelineKey,fee);this.orphanPipelineFees.delete(fee);delivered=true;return pipelines;
  }catch(error){failed=true;primary=error;throw error;}
  finally{try{await retireGpuTransaction(this,record);if(!delivered)await retireOwnedGpuDevice(this);}catch(error){this.retirementNeeded=true;if(failed)attachGpuCleanup(primary,error);else throw error;}}
 }
 async run(input,{reverse,signal,onProgress}={}){
  if(this.closed)throw new EngineError('DISPOSED','Dense GPU provider is disposed');if(this.busy)throw new EngineError('BUSY','Dense GPU provider is busy');
  if(!densePmGpuDomain(input,{content:false}))throw gpuOwnerFailure(this,new EngineError('GPU_LIMIT','Dense GPU requires finite normalized direct banks, integer axes and zero gap'));
  requireValue(typeof reverse==='function','Native ordered reverse callback required');checkAbort(signal);this.busy=true;
  const {first,second=first,mask,width,height,dimensions,iterations=8,seed=729,minimum=5,radius=600,compare=false}=input,n=width*height,active=!!input.activeIndices,stateCount=input.activeIndices?.length??n,geometry=describeDensePmGeometry(width,height,input),fees=new Set(),hostOwners=new Set();let record,result,failed=false,primary,state;
  const metrics={backend:active?'webgpu-active-causal4-native-reverse':'webgpu-causal4-native-reverse',descriptors:'native-cpu-float32',initialization:'webgpu',propagation:'webgpu',randomSearch:'webgpu',reverse:'native-cpu-ordered',geometry:geometry.mode,iterations,dispatches:0,validationMs:0,compileMs:0,uploadMs:0,propagationReadbackMs:0,reverseMs:0,returnUploadMs:0,gpuBufferBytes:0};
  const reserve=bytes=>{const free=gpuOwnerReserve(this,bytes);fees.add(free);return async()=>{await free();fees.delete(free);};};
  const hostOwner=(value,label)=>{const entry={bytes:value.byteLength,free:this.budget.registerBacking?.('array-buffer',value.byteLength,{owner:'patchmatch',label,identity:value.buffer}),retired:false};hostOwners.add(entry);return entry;};
  const retireHost=async entry=>{if(!entry.retired){const bytes=await entry.free?.();entry.retired=true;if(bytes!==0)this.budget.notifyBackingRelease?.('array-buffer',bytes??entry.bytes);}hostOwners.delete(entry);};
  try{
   const validationAt=performance.now(),validationLease=await this.scheduler.acquire({cpu:1,signal,resourceOwner:'patchmatch',label:'dense-pm-bank-validation'});let lastValidationYield=performance.now();
   try{if(!await normalizedBanksCooperative(first,second,{check:()=>checkAbort(signal),cooperate:async()=>{if(performance.now()-lastValidationYield>=8){await controlCheckpoint(signal);lastValidationYield=performance.now();}}}))throw gpuOwnerFailure(this,new EngineError('GPU_LIMIT','Dense GPU descriptor values exceed the qualified normalized domain'));}finally{await validationLease.release();}metrics.validationMs=performance.now()-validationAt;
   let at=performance.now();const pipelines=await this.prepare(dimensions,Math.max(first.byteLength,second.byteLength,n*16),signal,geometry.mode+(active?'-active':''));metrics.compileMs=performance.now()-at;
   const device=this.device,api=fn=>gpuOwnerSync(this,fn,signal),asyncApi=fn=>gpuOwnerAsync(this,fn,signal);record=gpuTransaction(this);record.device=device;
   record.workspace=async()=>{state=null;for(const entry of [...hostOwners])await retireHost(entry);for(const free of [...fees]){await free();fees.delete(free);}};
   const buffer=(bytes,usage,label)=>{
    const size=Math.max(4,Math.ceil(bytes/4)*4);if(size>device.limits.maxBufferSize||size>device.limits.maxStorageBufferBindingSize)throw gpuOwnerFailure(this,new EngineError('GPU_LIMIT','Dense GPU buffer exceeds device limits'));
    const free=reserve(size);let value;try{value=api(()=>device.createBuffer({size,usage,label}));const entry={bytes:size,destroyed:false,backingRetired:false,creditRetired:false};entry.release=async()=>{if(!entry.backingRetired){await entry.backing?.();entry.backingRetired=true;}if(!entry.creditRetired){await free();entry.creditRetired=true;}return size;};record.buffers.set(value,entry);entry.backing=this.budget.registerBacking?.('gpu',size,{owner:'patchmatch',label});metrics.gpuBufferBytes+=size;return value;}catch(error){if(!value)void free();throw error;}
   };
   record.lease=await this.scheduler.acquire({cpu:1,gpu:0,signal,resourceOwner:'patchmatch',label:'dense-pm-host-plan'});
   const waves=width+2*height-2,blocks=Math.ceil(waves/4),groupsY=Math.ceil(height/4);let count0=0,count1=0;for(const v of mask){if(v&1)count0++;if(v&2)count1++;}
   let coordinates,coordinateOwner,coordinateFree;if(geometry.coordinateBytes){coordinateFree=reserve(geometry.coordinateBytes);coordinates=createDensePmGeometryCoordinates(width,height,input.axes);coordinateOwner=hostOwner(coordinates,'dense-pm-native-coordinate-axes');}
   let activePlan,stepRecords,iterationSteps,maximumGroups=groupsY,activeOffset=0,forwardOffset=0,backwardOffset=0,axisOffsetX=n+count0+count1;
   if(active){reserve(n*24+blocks*groupsY*2+(blocks+1)*8);activePlan=buildActiveDensePlan(mask,width,height);requireValue(activePlan.count===stateCount&&activePlan.indices.every((v,i)=>v===input.activeIndices[i]),'Active native index publication changed');for(const [name,array] of Object.entries({indices:activePlan.indices,flags:activePlan.flags,pool0:activePlan.pool0,pool1:activePlan.pool1,forwardRows:activePlan.forward.rows,forwardOffsets:activePlan.forward.offsets,backwardRows:activePlan.backward.rows,backwardOffsets:activePlan.backward.offsets}))hostOwner(array,'dense-active-plan-'+name);
    activeOffset=n+count0+count1;forwardOffset=activeOffset+stateCount;backwardOffset=forwardOffset+activePlan.forward.rows.length;axisOffsetX=backwardOffset+activePlan.backward.rows.length;
    let forwardBlocks=0,backwardBlocks=0;for(let block=0;block<blocks;block++){if(activePlan.forward.offsets[block+1]>activePlan.forward.offsets[block])forwardBlocks++;if(activePlan.backward.offsets[block+1]>activePlan.backward.offsets[block])backwardBlocks++;}const plannedSteps=1+Math.ceil(iterations/2)*forwardBlocks+Math.floor(iterations/2)*backwardBlocks,plannedPhysical=iterations*blocks*groupsY*4;if(!Number.isSafeInteger(plannedSteps*256)||plannedSteps*256>device.limits.maxBufferSize||plannedPhysical>device.limits.maxStorageBufferBindingSize)throw gpuOwnerFailure(this,new EngineError('GPU_LIMIT','Dense active iteration plan exceeds available limits'));reserve(plannedSteps*1024);
    stepRecords=[{iteration:0,q:0,rowOffset:forwardOffset,rowCount:0}];iterationSteps=[];maximumGroups=0;for(let iteration=0;iteration<iterations;iteration++){const indices=[],direction=iteration%2?activePlan.backward:activePlan.forward,rowBase=iteration%2?backwardOffset:forwardOffset;for(let block=0;block<blocks;block++){const rowCount=direction.offsets[block+1]-direction.offsets[block];if(!rowCount)continue;maximumGroups=Math.max(maximumGroups,rowCount);indices.push(stepRecords.length);stepRecords.push({iteration,q:block*4,rowOffset:rowBase+direction.offsets[block],rowCount});}iterationSteps.push(indices);}
    Object.assign(metrics,{activePixels:stateCount,logicalFieldPixels:n,activeForwardTiles:activePlan.forward.activeTiles,activeBackwardTiles:activePlan.backward.activeTiles,fullTilesPerDirection:blocks*groupsY,sourceDescriptorBytes:first.byteLength+(second===first?0:second.byteLength)});
   }
   const axisOffsetY=axisOffsetX+width,packedFree=reserve((axisOffsetX+(coordinates?.length??0))*4),packed=new Uint32Array(axisOffsetX+(coordinates?.length??0)),packedOwner=hostOwner(packed,'dense-pm-native-pools');
   if(active){packed.set(activePlan.flags);packed.set(activePlan.pool0,n);packed.set(activePlan.pool1,n+count0);packed.set(activePlan.indices,activeOffset);packed.set(activePlan.forward.rows,forwardOffset);packed.set(activePlan.backward.rows,backwardOffset);}else{packed.set(mask);let rank0=n,rank1=n+count0;for(let i=0;i<n;i++){if(mask[i]&1)packed[rank0++]=i;if(mask[i]&2)packed[rank1++]=i;}}if(coordinates)packed.set(new Uint32Array(coordinates.buffer),axisOffsetX);
   const steps=active?stepRecords.length:1+iterations*blocks,physicalBytes=iterations*blocks*groupsY*4;
   if(!Number.isSafeInteger(steps*256)||steps*256>device.limits.maxBufferSize||physicalBytes>device.limits.maxStorageBufferBindingSize)throw gpuOwnerFailure(this,new EngineError('GPU_LIMIT','Dense GPU iteration plan exceeds available limits'));
   const uniformFree=reserve(steps*256),uniformHost=new Uint32Array(steps*64),uniformOwner=hostOwner(uniformHost,'dense-pm-wave-descriptors');reserve(stateCount*16);state=new Uint32Array(stateCount*4);let stateOwner=hostOwner(state,'dense-pm-reverse-staging');
   for(let step=0;step<steps;step++){const iteration=active?stepRecords[step].iteration:step?Math.floor((step-1)/blocks):0,q=active?stepRecords[step].q:step?(step-1)%blocks*4:0,phase=step?1+(Math.ceil(geometry.searchMax)!==Math.floor(geometry.searchMax)?2:0):0,values=[width,height,dimensions,phase,q,iteration%2,iteration,seed,n,count0,n+count0,count1,+compare,geometry.lower[0],geometry.upper[0],Math.ceil(geometry.searchMax)];if(active||geometry.mode==='half')values.push(...(active?[activeOffset,stateCount,stepRecords[step].rowOffset,stepRecords[step].rowCount]:[0,0,0,0]));if(geometry.mode==='half')values.push(geometry.lower[1],geometry.upper[1],geometry.gapX2,geometry.gapY2,axisOffsetX,axisOffsetY,0,0);uniformHost.set(values,step*64);}
   await record.lease.release();record.lease=null;
   api(()=>device.pushErrorScope('validation'));record.scopes++;api(()=>device.pushErrorScope('out-of-memory'));record.scopes++;
   const a=buffer(first.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'dense-source-bank'),b=second===first?a:buffer(second.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'dense-target-bank'),pools=buffer(packed.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'dense-native-pools'),field=buffer(stateCount*16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST,'dense-live-field'),read=buffer(stateCount*16,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST,'dense-field-readback'),pending=buffer(height*4*16,GPUBufferUsage.STORAGE,'dense-unpublished-cores'),physical=buffer(physicalBytes,GPUBufferUsage.STORAGE,'dense-physical-counts'),uniform=buffer(steps*256,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,'dense-wave-descriptors');reserve(maximumGroups*16384);if(!active)reserve(steps*1024);
   const groups=[];for(let step=0;step<steps;step++)groups.push(api(()=>device.createBindGroup({layout:pipelines.bindLayout,entries:[a,b,pools,field].map((value,binding)=>({binding,resource:{buffer:value}})).concat([{binding:4,resource:{buffer:uniform,offset:step*256,size:active&&geometry.mode==='pixel'?80:geometry.uniformBytes}},{binding:5,resource:{buffer:pending}},{binding:6,resource:{buffer:physical}}])})));
   const scopes=async()=>{while(record.scopes){const error=await asyncApi(()=>device.popErrorScope());record.scopes--;if(error)throw gpuOwnerFailure(this,new EngineError('GPU_FAILED',error.message));}};
   record.lease=await this.scheduler.acquire({cpu:0,gpu:1,signal,resourceOwner:'patchmatch',label:'dense-pm-upload'});record.drained=false;at=performance.now();const stageFree=reserve(first.byteLength+(second===first?0:second.byteLength)+packed.byteLength+uniformHost.byteLength);api(()=>device.queue.writeBuffer(a,0,first));if(b!==a)api(()=>device.queue.writeBuffer(b,0,second));api(()=>device.queue.writeBuffer(pools,0,packed));api(()=>device.queue.writeBuffer(uniform,0,uniformHost));await asyncApi(()=>device.queue.onSubmittedWorkDone());record.drained=true;await scopes();await stageFree();await record.lease.release();record.lease=null;await retireHost(packedOwner);await packedFree();await retireHost(uniformOwner);await uniformFree();if(coordinateOwner)await retireHost(coordinateOwner);await coordinateFree?.();metrics.uploadMs=performance.now()-at;
   for(let iteration=0;iteration<iterations;iteration++){
    checkAbort(signal);record.lease=await this.scheduler.acquire({cpu:0,gpu:1,signal,resourceOwner:'patchmatch',label:'dense-pm-propagation'});record.drained=false;api(()=>device.pushErrorScope('validation'));record.scopes++;api(()=>device.pushErrorScope('out-of-memory'));record.scopes++;at=performance.now();
    const encoder=api(()=>device.createCommandEncoder());api(()=>{const pass=encoder.beginComputePass();if(!iteration){pass.setPipeline(pipelines.initialize);pass.setBindGroup(0,groups[0]);pass.dispatchWorkgroups(Math.ceil(stateCount/64));metrics.dispatches++;}if(active){for(const step of iterationSteps[iteration]){const rows=stepRecords[step].rowCount;pass.setBindGroup(0,groups[step]);pass.setPipeline(pipelines.propagate);pass.dispatchWorkgroups(rows);pass.setPipeline(pipelines.commit);pass.dispatchWorkgroups(Math.ceil(rows*16/64));metrics.dispatches+=2;}}else{for(let block=0;block<blocks;block++){pass.setBindGroup(0,groups[1+iteration*blocks+block]);pass.setPipeline(pipelines.propagate);pass.dispatchWorkgroups(groupsY);pass.setPipeline(pipelines.commit);pass.dispatchWorkgroups(Math.ceil(4*height/64));metrics.dispatches+=2;}}pass.end();encoder.copyBufferToBuffer(field,0,read,0,stateCount*16);});api(()=>device.queue.submit([encoder.finish()]));onProgress?.({phase:'patchmatch-gpu-submitted',completed:iteration,total:iterations});
    const mapFree=reserve(stateCount*16);record.mapping={buffer:read,mapped:false,release:mapFree};await asyncApi(()=>read.mapAsync(GPUMapMode.READ));record.mapping.mapped=true;const mapped=api(()=>read.getMappedRange()),mappingOwner=this.budget.registerBacking?.('gpu-mapped',stateCount*16,{owner:'patchmatch',label:'dense-field-mapped',identity:mapped});let mappedRetired=false;record.mapping.release=async()=>{if(!mappedRetired){await mappingOwner?.();mappedRetired=true;}await mapFree();};state.set(new Uint32Array(mapped));api(()=>read.unmap());record.mapping.mapped=false;await record.mapping.release();record.mapping=null;await asyncApi(()=>device.queue.onSubmittedWorkDone());record.drained=true;await scopes();await record.lease.release();record.lease=null;metrics.propagationReadbackMs+=performance.now()-at;
    // No GPU lease is held across the CPU reverse broker. Its worker can borrow
    // the single CPU grant even when the public profile has maxWorkers=1.
    at=performance.now();const returned=await reverse(state,{iteration,signal});requireValue(returned instanceof Uint32Array&&returned.length===stateCount*4,'Invalid native reverse field');if(returned!==state){await retireHost(stateOwner);state=returned;stateOwner=hostOwner(state,'dense-pm-reverse-staging');}metrics.reverseMs+=performance.now()-at;checkAbort(signal);onProgress?.({phase:'patchmatch-iteration',completed:iteration+1,total:iterations});
    if(iteration+1<iterations){record.lease=await this.scheduler.acquire({cpu:0,gpu:1,signal,resourceOwner:'patchmatch',label:'dense-pm-state-return'});record.drained=false;at=performance.now();const stateStage=reserve(stateCount*16);api(()=>device.queue.writeBuffer(field,0,state));await asyncApi(()=>device.queue.onSubmittedWorkDone());record.drained=true;await stateStage();await record.lease.release();record.lease=null;metrics.returnUploadMs+=performance.now()-at;}
   }
   record.lease=await this.scheduler.acquire({cpu:1,gpu:0,signal,resourceOwner:'patchmatch',label:'dense-pm-field-publication'});record.outputFree=gpuOwnerReserve(this,n*8);const targets=new Int32Array(n),distancesSquared=new Float32Array(n),targetOwner=hostOwner(targets,'dense-targets'),distanceOwner=hostOwner(distancesSquared,'dense-distances'),floatState=new Float32Array(state.buffer,state.byteOffset,state.length),intState=new Int32Array(state.buffer,state.byteOffset,state.length);let comparisons=0n;if(active){targets.fill(-1);distancesSquared.fill(Infinity);for(let slot=0;slot<stateCount;slot++){const i=activePlan.indices[slot];targets[i]=intState[slot*4];distancesSquared[i]=floatState[slot*4+1];comparisons+=BigInt(state[slot*4+2]);}}else{for(let i=0;i<n;i++){targets[i]=intState[i*4];distancesSquared[i]=floatState[i*4+1];comparisons+=BigInt(state[i*4+2]);}}checkAbort(signal);
   const owners=[targetOwner,distanceOwner].map(entry=>({bytes:entry.bytes,release:entry.free}));result=ownGpuArrays({targets,distancesSquared},record.outputFree,owners,this.budget,{width,height,comparisons,metrics},this.pendingResults);record.outputFree=null;hostOwners.delete(targetOwner);hostOwners.delete(distanceOwner);
  }catch(error){failed=true;primary=error;throw error;}
  finally{
   try{if(record)await retireGpuTransaction(this,record);}
   catch(error){this.retirementNeeded=true;if(result)try{await result.release();}catch(retirement){attachGpuCleanup(error,retirement);}if(failed)attachGpuCleanup(primary,error);else{failed=true;primary=error;}}
   if(failed&&this.retirementNeeded)try{await retireOwnedGpuDevice(this);}catch(error){attachGpuCleanup(primary,error);}
   if(failed&&result)try{await result.release();}catch(error){attachGpuCleanup(primary,error);}
   this.busy=false;
  }
  if(failed)throw primary;return result;
 }
 dispose(){return disposeGpuOwner(this);}
}
