import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {fourierFftShader} from './resampling-fourier-fft-gpu-shader.js';
import {initializeGpuOwner,openOwnedGpuDevice,gpuOwnerSync,gpuOwnerAsync,gpuOwnerReserve,gpuOwnerFailure,gpuOwnerMayFallback,retireOwnedGpuDevice,disposeGpuOwner} from './gpu-context-owner.js';
import {gpuTransaction,retireGpuTransaction,attachGpuCleanup} from './gpu-ack-retirement.js';
import {ownGpuArrays} from './gpu-owned-arrays.js';
const MiB=1024**2,PIPELINE_BYTES=4*MiB;
export function fourierFftRadices(side){
 requireValue(Number.isSafeInteger(side)&&side>=2,'Invalid Fourier FFT side.');
 let remaining=side;const stages=[];let span=1,base=0;
 for(const radix of[4,2,3,5,7,11,13,17,19,23,29,31])while(remaining%radix===0){remaining/=radix;stages.push({m:span,radix,base});span*=radix;base+=span*radix;}
 if(remaining!==1)throw new EngineError('GPU_LIMIT','This exact Fourier dimension requires its native FFT radix.');
 return {stages,bankBytes:base*16};
}
export function fourierFftGpuPlan(side,limits,{resident=false}={}){
 const {stages,bankBytes}=fourierFftRadices(side),count=side*side;
 if(count>16777216)throw new EngineError('GPU_LIMIT','Full Fourier FFT exceeds its qualified GPU extent.');
 const binding=Math.min(limits.maxStorageBufferBindingSize,limits.maxBufferSize),axis=limits.maxComputeWorkgroupsPerDimension;
 const groups=Math.ceil(count/128),groupsX=Math.min(groups,axis),groupsY=Math.ceil(groups/groupsX),uniformBytes=(stages.length*2+1)*256;
 if(Math.max(count*16+4,bankBytes)>binding||groupsY>axis)throw new EngineError('GPU_LIMIT','Full Fourier FFT exceeds GPU transport; no axis is shortened.');
 // A retained transform has no complex readback, mapped range or host result.
 // Its 16N immutable output credit is one of the two 16N GPU banks, so only
 // the other bank, real upload bank and upload staging remain temporary32N.
 return {side,count,stages,bankBytes,uniformBytes,groupsX,groupsY,inputBytes:count*8,complexBytes:count*16,readBytes:count*16+4,resultBytes:count*16,temporaryBytes:count*(resident?32:80)+bankBytes*3+uniformBytes*2+8192};
}
export function fourierFftTwiddles(plan){
 const values=new Float32Array(plan.bankBytes/4);let at=0;
 for(const {m,radix}of plan.stages){const span=m*radix;for(let k=0;k<span;k++)for(let q=0;q<radix;q++){
  const phase=q*k%span,quadrant=phase*4/span;let re,im;
  if(Number.isInteger(quadrant)){re=[1,0,-1,0][quadrant%4];im=[0,-1,0,1][quadrant%4];}
  else{const angle=-2*Math.PI*phase/span;re=Math.cos(angle);im=Math.sin(angle);}
  const rh=Math.fround(re),ih=Math.fround(im);values[at++]=rh;values[at++]=Math.fround(re-rh);values[at++]=ih;values[at++]=Math.fround(im-ih);
 }}return values;
}
export class FourierFftGpu{
 constructor(budget,{onDeviceLost}={}){requireValue(budget?.reserve&&(onDeviceLost===undefined||typeof onDeviceLost==='function'),'Fourier FFT requires its shared budget and optional loss observer.');initializeGpuOwner(this,budget,'resampling-fourier-fft');this.pipelineEntry=null;this.pipelineFee=null;this.onDeviceLost=onDeviceLost;}
 mayFallback(error){return gpuOwnerMayFallback(this,error);}
 get retirementPending(){return this.retirementNeeded||this.pending.size>0||this.pendingResults.size>0||this.orphanPipelineFees.size>0;}
 initialize(signal){
  if(this.closed)throw new EngineError('DISPOSED','Fourier FFT GPU closed.');if(this.ready)return this.ready;
  this.pipelineFee??=gpuOwnerReserve(this,PIPELINE_BYTES);this.orphanPipelineFees.add(this.pipelineFee);
  return this.ready=openOwnedGpuDevice(this,signal,adapter=>({maxBufferSize:Math.min(adapter.limits.maxBufferSize,512*MiB),maxStorageBufferBindingSize:Math.min(adapter.limits.maxStorageBufferBindingSize,256*MiB)})).then(device=>{device.lost?.then(()=>{if(this.device===device&&!this.deviceDestroyed)try{this.onDeviceLost?.();}catch{}});return device;}).catch(error=>{this.ready=null;throw error;});
 }
 async preparePipelines(signal){
  if(this.pipelineEntry)return this.pipelineEntry;const free=this.pipelineFee;requireValue(typeof free==='function','FFT device/program credit is required before compilation.');
  const at=performance.now(),module=gpuOwnerSync(this,()=>this.device.createShaderModule({code:fourierFftShader}),signal),info=await gpuOwnerAsync(this,()=>module.getCompilationInfo(),signal);
  if(info.messages.some(m=>m.type==='error'))throw gpuOwnerFailure(this,new EngineError('GPU_FAILED',info.messages.filter(m=>m.type==='error').map(m=>m.message).join('\n')));
  const pipelines={};for(const entryPoint of['main','packed','magnitude'])pipelines[entryPoint]=await gpuOwnerAsync(this,()=>this.device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint}}),signal);
  checkAbort(signal);return {pipelines,free,compileMs:performance.now()-at};
 }
 async transform(input,side,{signal,onSubmitted,resident=false,deferReadbackAck=false}={}){
  requireValue(input instanceof Float64Array&&Number.isSafeInteger(side)&&side>=2&&input.length===side*side,'Complete prepared square binary64 Fourier field required.');
  checkAbort(signal);if(this.closed)throw new EngineError('DISPOSED','Fourier FFT GPU closed.');if(this.busy)throw new EngineError('BUSY','Fourier FFT GPU is busy.');
  requireValue(!this.spectrum,'A live immutable GPU spectrum must be retired before replacement.');requireValue(!deferReadbackAck||resident,'Readback acknowledgment requires a retained FFT spectrum.');
  this.busy=true;this.fallbackFailures=new WeakSet();const record=gpuTransaction(this),cooperate=createCooperator(signal),at=performance.now();let owned,published=false,failed=false,primary,deferred=false;
  const api=operation=>gpuOwnerSync(this,operation,signal),asyncApi=operation=>gpuOwnerAsync(this,operation,signal);
  try {
   try{fourierFftRadices(side);if(input.length>16777216)throw new EngineError('GPU_LIMIT','Fourier FFT exceeds its admitted GPU domain.');}catch(error){throw gpuOwnerFailure(this,error);}
   let l1=0;for(let i=0;i<input.length;i++){const value=input[i];if(!Number.isFinite(value)||value<0||value>1||value!==0&&value<2**-96)throw gpuOwnerFailure(this,new EngineError('GPU_LIMIT','Prepared field requires the unchanged native FFT domain.'));l1+=value;if((i&8191)===0)await cooperate();}
   if(this.pending.size>1||this.pendingResults.size||this.lost||this.retirementNeeded||this.orphanPipelineFees.size){this.pending.delete(record);await retireOwnedGpuDevice(this);this.pending.add(record);}
   record.lease=await getExecutionScheduler(this.budget).acquire({cpu:0,gpu:1,signal,resourceOwner:this.gpuLabel,label:'fourier-full-DD-FFT'});
   await this.initialize(signal);record.device=this.device;const device=this.device;let plan;try{plan=fourierFftGpuPlan(side,device.limits,{resident});}catch(error){throw gpuOwnerFailure(this,error);}
   record.workspace=gpuOwnerReserve(this,plan.temporaryBytes+plan.resultBytes);record.outputFree=record.workspace.split(plan.resultBytes);
   const bankStart=performance.now(),bank=fourierFftTwiddles(plan),bankMs=performance.now()-bankStart;
   api(()=>device.pushErrorScope('validation'));record.scopes++;api(()=>device.pushErrorScope('out-of-memory'));record.scopes++;
   const building=!this.pipelineEntry,entry=await this.preparePipelines(signal);
   const make=(bytes,usage,label)=>{const buffer=api(()=>device.createBuffer({size:bytes,usage})),backing={bytes,destroyed:false,release:null};record.buffers.set(buffer,backing);backing.release=this.budget.registerBacking?.('gpu',bytes,{owner:this.gpuLabel,label});return buffer;};
   const raw=make(plan.inputBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'FFT-prepared-F64'),a=make(plan.complexBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'FFT-DD-a'),b=make(plan.complexBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'FFT-DD-b'),weights=make(plan.bankBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'FFT-twiddles'),uniform=make(plan.uniformBytes,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,'FFT-stage-shapes'),status=resident?null:make(4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'FFT-pack-status'),read=resident?null:make(plan.readBytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST,'FFT-readback');
   api(()=>device.queue.writeBuffer(raw,0,input));api(()=>device.queue.writeBuffer(weights,0,bank));const encoder=api(()=>device.createCommandEncoder());let src=a,dst=b,index=0;
   for(const axis of[1,0])for(const stage of plan.stages){
    checkAbort(signal);const offset=index*256;api(()=>device.queue.writeBuffer(uniform,offset,Uint32Array.of(side,stage.m,stage.radix,axis,Number(index===0),stage.base,plan.groupsX,plan.count)));
    api(()=>{const pass=encoder.beginComputePass(),pipeline=entry.pipelines.main;pass.setPipeline(pipeline);pass.setBindGroup(0,device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[raw,src,dst,weights,uniform].map((buffer,binding)=>({binding,resource:binding===4?{buffer,offset,size:32}:{buffer}}))}));pass.dispatchWorkgroups(plan.groupsX,plan.groupsY);pass.end();});[src,dst]=[dst,src];index++;
   }
   if(resident){
    checkAbort(signal);api(()=>device.queue.submit([encoder.finish()]));onSubmitted?.();while(record.scopes){const error=await asyncApi(()=>device.popErrorScope());record.scopes--;if(error)throw gpuOwnerFailure(this,new EngineError('GPU_FAILED',error.message));}if(!deferReadbackAck){await asyncApi(()=>device.queue.onSubmittedWorkDone());record.drained=true;}checkAbort(signal);if(this.lost)throw gpuOwnerFailure(this,new EngineError('GPU_FAILED','Fourier FFT device lost.'));
    if(building){this.pipelineEntry=entry;this.orphanPipelineFees.delete(entry.free);this.pipelineFee=null;}
    const metrics={backend:'webgpu',fourierFftGpuCalls:1,fourierFftGpuPixels:plan.count,fourierFftStages:plan.stages.length*2,fourierFftBankMs:bankMs,fourierFftCompileMs:building?entry.compileMs:0,fourierFftGpuMs:performance.now()-at,arithmetic:'resident mixed-radix Stockham DD-f32 FFT; original full dimensions',maximumAbsoluteErrorBound:1e-4};
    if(deferReadbackAck){metrics.fourierFftHostSubmitMs=metrics.fourierFftGpuMs;metrics.fourierFftGpuMs=0;metrics.fourierFftAwaitedByMagnitude=true;}
    this.spectrum={buffer:src,backing:record.buffers.get(src),free:record.outputFree,side,metrics,l1,errorBound:l1*32*plan.stages.reduce((sum,s)=>sum+s.radix,0)*2**-48,pendingRecord:deferReadbackAck?record:null,acknowledgeReadbacks:deferReadbackAck};record.buffers.delete(src);record.outputFree=null;
    // The retained scientific spectrum is a live cache owner, unlike an idle
    // presentation program. Generic program pressure may not steal its buffer.
    this.unregister?.();this.unregister=null;published=true;deferred=deferReadbackAck;return {width:side,height:side,kind:'fourier-DD-gpu',owner:this,metrics,dispose:()=>this.dispose()};
   }
   const offset=index*256;api(()=>device.queue.writeBuffer(uniform,offset,Uint32Array.of(side,1,1,0,0,0,plan.groupsX,plan.count)));
   api(()=>{const pass=encoder.beginComputePass(),pipeline=entry.pipelines.packed;pass.setPipeline(pipeline);pass.setBindGroup(0,device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:2,resource:{buffer:src}},{binding:4,resource:{buffer:uniform,offset,size:32}},{binding:5,resource:{buffer:status}}]}));pass.dispatchWorkgroups(plan.groupsX,plan.groupsY);pass.end();encoder.copyBufferToBuffer(src,0,read,0,plan.complexBytes);encoder.copyBufferToBuffer(status,0,read,plan.complexBytes,4);});
   checkAbort(signal);api(()=>device.queue.submit([encoder.finish()]));onSubmitted?.();await asyncApi(()=>read.mapAsync(GPUMapMode.READ));record.mapping={buffer:read,mapped:true,release:null};const mapped=api(()=>read.getMappedRange());record.mapping.release=this.budget.registerBacking?.('gpu-mapped',plan.readBytes,{owner:this.gpuLabel,label:'FFT-mapped',identity:mapped});
   if(new Uint32Array(mapped,plan.complexBytes,1)[0])throw gpuOwnerFailure(this,new EngineError('GPU_LIMIT','DD complex packing invariant requires the native FFT.'));
   const values=new Float64Array(plan.count*2),view=new Float64Array(mapped,0,plan.count*2);for(let i=0;i<values.length;i+=16384){values.set(view.subarray(i,i+16384),i);await cooperate();}
   api(()=>read.unmap());record.mapping.mapped=false;await record.mapping.release?.();record.mapping=null;
   while(record.scopes){const error=await asyncApi(()=>device.popErrorScope());record.scopes--;if(error)throw gpuOwnerFailure(this,new EngineError('GPU_FAILED',error.message));}
   await asyncApi(()=>device.queue.onSubmittedWorkDone());record.drained=true;checkAbort(signal);if(this.lost)throw gpuOwnerFailure(this,new EngineError('GPU_FAILED','Fourier FFT device lost.'));
   if(building){this.pipelineEntry=entry;this.orphanPipelineFees.delete(entry.free);this.pipelineFee=null;}
   const owners=[];owned=ownGpuArrays({values},record.outputFree,owners,this.budget,{width:side,height:side,metrics:{backend:'webgpu',fourierFftGpuCalls:1,fourierFftGpuPixels:plan.count,fourierFftStages:plan.stages.length*2,fourierFftBankMs:bankMs,fourierFftCompileMs:building?entry.compileMs:0,fourierFftGpuMs:performance.now()-at,arithmetic:'mixed-radix Stockham DD-f32 FFT; original full dimensions',maximumAbsoluteErrorBound:1e-4}},this.pendingResults);record.outputFree=null;this.pendingResults.add(owned);owners.push({bytes:values.byteLength,release:this.budget.registerBacking?.('array-buffer',values.byteLength,{owner:this.gpuLabel,label:'FFT-result',identity:values.buffer})});published=true;return owned;
  }catch(error){failed=true;primary=error;throw error;}
  finally{let cleanupFailed=false,cleanup;try{if(!deferred||failed)await retireGpuTransaction(this,record);}catch(error){cleanupFailed=true;cleanup=error;}try{if(owned&&(!published||failed||cleanupFailed))await owned.release();else if(owned)this.pendingResults.delete(owned);}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanup=error;}}this.busy=false;if(cleanupFailed){if(failed)attachGpuCleanup(primary,cleanup);else throw cleanup;}}
 }
 async magnitude({center=false,highpass='simple',signal,onSubmitted}={}){
  requireValue(typeof center==='boolean'&&['simple','radial'].includes(highpass),'Invalid retained Fourier magnitude parameters.');checkAbort(signal);if(this.closed)throw new EngineError('DISPOSED','Fourier FFT GPU closed.');if(this.busy)throw new EngineError('BUSY','Fourier FFT GPU is busy.');requireValue(this.spectrum,'A live retained GPU spectrum is required.');
  this.busy=true;this.fallbackFailures=new WeakSet();const record=gpuTransaction(this),cooperate=createCooperator(signal),started=performance.now();let owned,published=false,failed=false,primary;
  const api=operation=>gpuOwnerSync(this,operation,signal),asyncApi=operation=>gpuOwnerAsync(this,operation,signal);
  try{
   if(this.lost||this.retirementNeeded||!this.device||!this.pipelineEntry)throw gpuOwnerFailure(this,new EngineError('GPU_FAILED','Retained Fourier context is unavailable.'));
   const s=this.spectrum,side=s.side,outputSide=center?2*Math.floor(side/4):side,offset=center?side/2-Math.floor(side/4):0,count=outputSide**2;
   if(this.pendingResults.size||[...this.pending].some(p=>p!==record&&p!==s.pendingRecord))throw gpuOwnerFailure(this,new EngineError('GPU_FAILED','Prior Fourier retirement requires its acknowledged barrier.'));
   requireValue(outputSide>=2,'The Fourier region is too small to take its center.');
   const bytes=count*8,weightBytes=highpass==='radial'?bytes:8,groups=Math.ceil(count/128),groupsX=Math.min(groups,this.device.limits.maxComputeWorkgroupsPerDimension),groupsY=Math.ceil(groups/groupsX);
   if(Math.max(bytes,weightBytes)>Math.min(this.device.limits.maxStorageBufferBindingSize,this.device.limits.maxBufferSize)||groupsY>this.device.limits.maxComputeWorkgroupsPerDimension)throw gpuOwnerFailure(this,new EngineError('GPU_LIMIT','Complete retained Fourier magnitude exceeds GPU transport.'));
   if(s.pendingRecord?.lease){record.lease=s.pendingRecord.lease;s.pendingRecord.lease=null;}
   else record.lease=await getExecutionScheduler(this.budget).acquire({cpu:0,gpu:1,signal,resourceOwner:this.gpuLabel,label:'fourier-retained-DD-magnitude'});record.device=this.device;
   record.workspace=gpuOwnerReserve(this,count*32+weightBytes*3+8192);record.outputFree=record.workspace.split(bytes);
   const weights=new Float64Array(weightBytes/8);if(highpass==='radial'){const c=Math.floor(outputSide/2),radius=Math.sqrt(2*c*c),root2=Math.sqrt(2);for(let y=0;y<outputSide;y++){for(let x=0;x<outputSide;x++){const r=Math.sqrt((x-c)**2+(y-c)**2)/radius*root2;weights[y*outputSide+x]=r<=root2?.5-.5*Math.cos(Math.PI*r/root2):0;}await cooperate();}}
   const device=this.device;api(()=>device.pushErrorScope('validation'));record.scopes++;api(()=>device.pushErrorScope('out-of-memory'));record.scopes++;
   const make=(size,usage,label)=>{const buffer=api(()=>device.createBuffer({size,usage})),backing={bytes:size,destroyed:false,release:null};record.buffers.set(buffer,backing);backing.release=this.budget.registerBacking?.('gpu',size,{owner:this.gpuLabel,label});return buffer;};
   const w=make(weightBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'FFT-native-highpass-weights'),out=make(bytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'FFT-DD-magnitude'),status=make(4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'FFT-magnitude-status'),uniform=make(32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,'FFT-magnitude-shape'),read=make(bytes+4,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ,'FFT-magnitude-readback');
   api(()=>device.queue.writeBuffer(w,0,weights));api(()=>device.queue.writeBuffer(uniform,0,Uint32Array.of(side,outputSide,offset,Math.max(1,Math.trunc(.1*(outputSide/2))),Number(highpass==='radial'),groupsX,count,0)));
   const encoder=api(()=>device.createCommandEncoder()),pipeline=this.pipelineEntry.pipelines.magnitude;api(()=>{const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:2,resource:{buffer:s.buffer}},{binding:5,resource:{buffer:status}},{binding:6,resource:{buffer:w}},{binding:7,resource:{buffer:out}},{binding:8,resource:{buffer:uniform}}]}));pass.dispatchWorkgroups(groupsX,groupsY);pass.end();encoder.copyBufferToBuffer(out,0,read,0,bytes);encoder.copyBufferToBuffer(status,0,read,bytes,4);});
   checkAbort(signal);api(()=>device.queue.submit([encoder.finish()]));onSubmitted?.();await asyncApi(()=>read.mapAsync(GPUMapMode.READ));record.mapping={buffer:read,mapped:true,release:null};const mapped=api(()=>read.getMappedRange());record.mapping.release=this.budget.registerBacking?.('gpu-mapped',bytes+4,{owner:this.gpuLabel,label:'FFT-magnitude-mapped',identity:mapped});
   if(new Uint32Array(mapped,bytes,1)[0])throw gpuOwnerFailure(this,new EngineError('GPU_LIMIT','DD magnitude packing requires the native Fourier path.'));
   const values=new Float64Array(count),view=new Float64Array(mapped,0,count);let low=Infinity,high=-Infinity;for(let i=0;i<count;i+=16384){values.set(view.subarray(i,i+16384),i);for(let j=i;j<Math.min(count,i+16384);j++){if(!Number.isFinite(values[j])||values[j]<0)throw gpuOwnerFailure(this,new EngineError('GPU_FAILED','Nonfinite retained Fourier magnitude.'));low=Math.min(low,values[j]);high=Math.max(high,values[j]);}await cooperate();}
   api(()=>read.unmap());record.mapping.mapped=false;await record.mapping.release?.();record.mapping=null;while(record.scopes){const error=await asyncApi(()=>device.popErrorScope());record.scopes--;if(error)throw gpuOwnerFailure(this,new EngineError('GPU_FAILED',error.message));}checkAbort(signal);if(this.lost)throw gpuOwnerFailure(this,new EngineError('GPU_FAILED','Fourier magnitude device lost.'));
   if(s.acknowledgeReadbacks){
    // Exclusive owner, queue-ordered FFT axes -> retained spectrum -> magnitude
    // -> final copy. Successful map+validated scopes acknowledge this graph;
    // fault/cancel paths deliberately retain generic queue/device-loss fences.
    record.drained=true;if(s.pendingRecord){s.pendingRecord.drained=true;await retireGpuTransaction(this,s.pendingRecord);s.pendingRecord=null;}
   }else{await asyncApi(()=>device.queue.onSubmittedWorkDone());record.drained=true;}
   const owners=[];owned=ownGpuArrays({values},record.outputFree,owners,this.budget,{low,high,outputSide,offset,errorBound:s.errorBound*2,metrics:{backend:'webgpu',fourierMagnitudeGpuCalls:1,fourierMagnitudeGpuPixels:count,fourierMagnitudeGpuMs:performance.now()-started,fourierFftComplexReadbackBytes:0,arithmetic:'resident full DD FFT + DD magnitude; native binary64 radial highpass coefficients'}},this.pendingResults);record.outputFree=null;this.pendingResults.add(owned);owners.push({bytes:values.byteLength,release:this.budget.registerBacking?.('array-buffer',values.byteLength,{owner:this.gpuLabel,label:'FFT-magnitude-result',identity:values.buffer})});published=true;return owned;
  }catch(error){failed=true;primary=error;throw error;}
  finally{let cleanupFailed=false,cleanup;try{await retireGpuTransaction(this,record);}catch(error){cleanupFailed=true;cleanup=error;}try{if(owned&&(!published||failed||cleanupFailed))await owned.release();else if(owned)this.pendingResults.delete(owned);}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanup=error;}}this.busy=false;if(cleanupFailed){if(failed)attachGpuCleanup(primary,cleanup);else throw cleanup;}}
 }
 async retirePipelines(){if(this.spectrum){const s=this.spectrum;if(!s.backing.destroyed){s.buffer.destroy();s.backing.destroyed=true;}if(!s.backing.backingRetired){s.backing.retiredBytes=await s.backing.release?.();s.backing.backingRetired=true;}if(!s.backing.notified){if(s.backing.retiredBytes!==0)this.budget.notifyBackingRelease?.('gpu',s.backing.retiredBytes??s.backing.bytes);s.backing.notified=true;}await s.free();this.spectrum=null;}if(this.pipelineEntry){await this.pipelineEntry.free();this.pipelineEntry=null;}this.pipelineFee=null;}
 retire(){if(this.busy)throw new EngineError('BUSY','Fourier FFT must drain before retirement.');return retireOwnedGpuDevice(this);}
 dispose(){return disposeGpuOwner(this);}
}
