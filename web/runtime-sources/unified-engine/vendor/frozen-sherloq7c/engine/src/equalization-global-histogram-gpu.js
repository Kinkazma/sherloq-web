import "../../../../../runtime-context.js?v=0.31.0";
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {allocateTypedArray} from './allocation.js';
import {histogramEqualizationLut} from './equalization-histograms.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {initializeGpuOwner,openOwnedGpuDevice,retireOwnedGpuDevice,gpuOwnerFailure,gpuOwnerMayFallback,gpuOwnerSync,gpuOwnerAsync,gpuOwnerReserve} from './gpu-context-owner.js';
import {gpuTransaction,retireGpuTransaction,attachGpuCleanup} from './gpu-ack-retirement.js';
import {HISTOGRAM_WGSL,REDUCE_WGSL,APPLY_WGSL} from './equalization-global-histogram-wgsl.js';

const MiB=1024**2,PIPELINES=12*MiB,IO_BYTES=4*MiB;
const services=new WeakMap(),round4=value=>Math.max(4,Math.ceil(value/4)*4);

// Complete buffers are optional. CPU input and output remain native bounded
// readers/stores: this path never requires a second full host RGB allocation.
export function globalHistogram100GpuPlan(width,height,masked,{axis=65535}={}){
 requireValue(Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0,'Native RGB8 dimensions required.');
 const pixels=width*height,bytes=pixels*3;
 if(!Number.isSafeInteger(bytes)||bytes>0xfffffffc)return null;
 const sourceBytes=round4(bytes),maskBytes=masked?round4(pixels):4,groups=Math.min(axis,1024,Math.max(1,Math.ceil(pixels/2048))),applyGroups=Math.min(axis,Math.max(1,Math.ceil(pixels/1024))),partialBytes=groups*1024,readBytes=Math.min(sourceBytes,IO_BYTES);
 const windowPixels=Math.max(1,Math.min(pixels,Math.floor(IO_BYTES/3))),maskStageBytes=masked?windowPixels:0;
 const gpuBytes=2*sourceBytes+maskBytes+partialBytes+65536+32+1024+1024+readBytes;
 const queueStagingBytes=sourceBytes+(masked?maskBytes:0)+65536+32;
 const cpuBytes=maskStageBytes+256*8+256+65536+32+8+65536;
 const mappingBytes=Math.max(readBytes,1024),workspaceBytes=gpuBytes+queueStagingBytes+cpuBytes+mappingBytes;
 // Source surfaces can own an output window plus a row scratch. This is
 // headroom only; their actual readWindow allocations keep their own owners.
 return{width,height,pixels,bytes,sourceBytes,maskBytes,groups,applyGroups,partialBytes,readBytes,windowPixels,gpuBytes,queueStagingBytes,cpuBytes,mappingBytes,workspaceBytes,readHeadroomBytes:2*Math.min(IO_BYTES,bytes)};
}

class GlobalHistogram100Gpu {
 constructor(budget){initializeGpuOwner(this,budget,'global-histogram100');this.pipelines=null;this.pipelineFree=null;this.queue=Promise.resolve();this.closing=false;this.calls=0;this.completed=0;this.lastFallback=null;}
 retirePipelines=async()=>{this.pipelines=null;if(this.pipelineFree){await this.pipelineFree();this.pipelineFree=null;}};
 sync(fn,signal){return gpuOwnerSync(this,fn,signal);}
 asyncCall(fn,signal){return gpuOwnerAsync(this,fn,signal);}
 capacity(bytes){if(this.budget.recovering||this.budget.isBackingUnderPressure?.('gpu')||this.budget.total()+bytes>this.budget.limit)throw gpuOwnerFailure(this,new EngineError('MEMORY_LIMIT','Optional global Histogram100 GPU workspace is not admitted.'));}
 async initialize(signal){
  if(this.pipelines)return;
  this.capacity(PIPELINES);const free=gpuOwnerReserve(this,PIPELINES);this.orphanPipelineFees.add(free);
  if(!this.device)await openOwnedGpuDevice(this,signal,adapter=>({maxBufferSize:adapter.limits.maxBufferSize,maxStorageBufferBindingSize:adapter.limits.maxStorageBufferBindingSize}));
  const compiled=[];
  for(const code of [HISTOGRAM_WGSL,REDUCE_WGSL,APPLY_WGSL]){
   checkAbort(signal);const module=this.sync(()=>this.device.createShaderModule({code}),signal);
   const info=await this.asyncCall(()=>module.getCompilationInfo(),signal);checkAbort(signal);
   if(info.messages.some(message=>message.type==='error'))throw gpuOwnerFailure(this,new EngineError('GPU_FAILED',info.messages.filter(m=>m.type==='error').map(m=>m.message).join('\n')));
   compiled.push(await this.asyncCall(()=>this.device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}}),signal));
  }
  checkAbort(signal);this.pipelines=compiled;this.pipelineFree=free;this.orphanPipelineFees.delete(free);
 }
 compute(source,options){
  const work=async()=>{
   checkAbort(options.signal);if(this.closing||this.closed)throw new EngineError('DISPOSED','Global Histogram100 GPU service is closing.');
   try{return await this.run(source,options);}
   catch(error){
    if(options.signal?.aborted){checkAbort(options.signal);}
    if(!gpuOwnerMayFallback(this,error))throw error;
    try{await retireOwnedGpuDevice(this);}catch(cleanup){attachGpuCleanup(error,cleanup);throw error;}
    checkAbort(options.signal);this.lastFallback=error.code;return null;
   }
  };const result=this.queue.then(work);this.queue=result.then(()=>{},()=>{});return result;
 }
 async run(source,{signal,onProgress,contains,temporarySession,getTemporarySession}={}){
  const {width,height,format}=source?.descriptor??{};
  requireValue(format==='rgb8'&&typeof source.readWindow==='function','Global HSV equalization requires native RGB8.');
  requireValue(contains===null||contains===undefined||typeof contains==='function','A valid equalization membership predicate is required.');
  this.calls++;this.busy=true;this.fallbackFailures=new WeakSet();
  const started=performance.now(),tx=gpuTransaction(this),stages=new Set(),windows=new Set();let outputStore,outputSurface,published=false,failed=false,primary,record;
  // The cache owner retains a failed output retirement; published surfaces own
  // their independent store and are removed from this set only after cleanup.
  const outputOwner={release:async()=>{const value=await(outputSurface?.dispose()??outputStore?.dispose());if(value===0||value===false)throw new EngineError('BUSY','Histogram output awaits retirement ACK.');outputSurface=outputStore=null;this.pendingResults.delete(outputOwner);}};
  this.pendingResults.add(outputOwner);
  const retireWindow=async part=>{const ack=await part.release();if(ack===0||ack===false)throw new EngineError('BUSY','Histogram source window awaits retirement ACK.');windows.delete(part);};
  tx.outputFree=async()=>{for(const part of windows)await retireWindow(part);for(const item of stages){if(!item.retired){item.retiredBytes=await item.backing?.();item.retired=true;}if(!item.notified){if(item.retiredBytes!==0)this.budget.notifyBackingRelease?.('array-buffer',item.retiredBytes??item.bytes);item.notified=true;}item.data=null;stages.delete(item);}};
  const stage=(Type,length,label)=>{let data;try{data=allocateTypedArray(Type,length,{label});}catch(error){throw gpuOwnerFailure(this,error);}const item={data,bytes:data.byteLength,backing:null,retired:false,notified:false};stages.add(item);item.backing=this.budget.registerBacking?.('array-buffer',data.byteLength,{owner:'global-histogram100',label,identity:data.buffer});return data;};
  try{
   if(this.pending.size>1||this.pendingResults.size>1||this.lost||this.retirementNeeded||this.orphanPipelineFees.size){this.pending.delete(tx);this.pendingResults.delete(outputOwner);try{await retireOwnedGpuDevice(this);}finally{this.pending.add(tx);this.pendingResults.add(outputOwner);}}
   let plan=globalHistogram100GpuPlan(width,height,!!contains);
   if(!plan)throw gpuOwnerFailure(this,new EngineError('GPU_LIMIT','Native Histogram100 addressing exceeds the optional GPU path.'));
   // Match the ordinary CPU output's storage policy first. A RAM result remains
   // reserved as one segmented store, not as an additional host transport bank.
   try{outputStore=await createSegmentedBytes(plan.bytes,{budget:this.budget,temporarySession,getTemporarySession,signal,owner:'equalization',label:'presentation-equalization'});}
   catch(error){if(['MEMORY_LIMIT','MEMORY_ALLOCATION','STORAGE_UNAVAILABLE','STORAGE_IO'].includes(error?.code))throw gpuOwnerFailure(this,error);throw error;}
   this.capacity(plan.workspaceBytes+plan.readHeadroomBytes+(this.pipelines?0:PIPELINES));
   tx.lease=await getExecutionScheduler(this.budget).acquire({cpu:0,gpu:1,signal,resourceOwner:'equalization',label:'global-Histogram100'});
   const setup=performance.now(),cold=!this.pipelines;await this.initialize(signal);const setupMilliseconds=performance.now()-setup,device=this.device;tx.device=device;
   const limits=device.limits;
   if(limits.maxComputeInvocationsPerWorkgroup<256||limits.maxComputeWorkgroupSizeX<256||limits.maxComputeWorkgroupStorageSize<1024)throw gpuOwnerFailure(this,new EngineError('GPU_LIMIT','Histogram100 workgroup is unavailable.'));
   plan=globalHistogram100GpuPlan(width,height,!!contains,{axis:limits.maxComputeWorkgroupsPerDimension});
   if([plan.sourceBytes,plan.maskBytes,plan.partialBytes,65536].some(bytes=>bytes>limits.maxBufferSize||bytes>limits.maxStorageBufferBindingSize)||plan.readBytes>limits.maxBufferSize)throw gpuOwnerFailure(this,new EngineError('GPU_LIMIT','Complete Histogram100 buffers exceed this GPU binding limit.'));
   this.capacity(plan.workspaceBytes+plan.readHeadroomBytes);const freeWorkspace=gpuOwnerReserve(this,plan.workspaceBytes);
   // The shared transaction helper retires independent credits even when a
   // preceding ACK failed. Host stages borrow this reservation, so keep it
   // until outputFree has acknowledged every stage/source-window retirement.
   tx.workspace=async()=>{if(tx.outputFree)throw new EngineError('BUSY','Histogram100 host retirement still owns its workspace.');await freeWorkspace();};
   this.sync(()=>device.pushErrorScope('validation'),signal);tx.scopes++;
   this.sync(()=>device.pushErrorScope('out-of-memory'),signal);tx.scopes++;
   const make=(size,usage,label)=>{const buffer=this.sync(()=>device.createBuffer({size,usage,label}),signal),entry={bytes:size,destroyed:false,release:null};tx.buffers.set(buffer,entry);entry.release=this.budget.registerBacking?.('gpu',size,{owner:'global-histogram100',label});return buffer;};
   const rgb=make(plan.sourceBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'Histogram100-source'),mask=make(plan.maskBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'Histogram100-mask'),partials=make(plan.partialBytes,GPUBufferUsage.STORAGE,'Histogram100-locals'),histogram=make(1024,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'Histogram100-counts'),ratios=make(65536,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'Histogram100-ratios'),output=make(plan.sourceBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'Histogram100-result'),params=make(32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,'Histogram100-parameters'),histRead=make(1024,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST,'Histogram100-count-read'),rgbRead=make(plan.readBytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST,'Histogram100-RGB-read');
   const bind=(pipeline,buffers,sizes)=>this.sync(()=>device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:buffers.map((buffer,binding)=>({binding,resource:{buffer,offset:0,size:sizes[binding]}}))}),signal);
   const [hp,rp,ap]=this.pipelines,hb=bind(hp,[rgb,mask,partials,params],[plan.sourceBytes,plan.maskBytes,plan.partialBytes,32]),rb=bind(rp,[partials,histogram,params],[plan.partialBytes,1024,32]),ab=bind(ap,[rgb,mask,ratios,output,params],[plan.sourceBytes,plan.maskBytes,65536,plan.sourceBytes,32]);
   const uploadWriter=buffer=>{const tail=stage(Uint8Array,4,'Histogram100-upload-tail');let used=0,position=0;return{append(data){let at=0;if(used){const n=Math.min(4-used,data.length);tail.set(data.subarray(0,n),used);used+=n;at+=n;if(used===4){tx.drained=false;thisWrite(buffer,position,tail,0,4);position+=4;used=0;}}const bytes=Math.floor((data.length-at)/4)*4;if(bytes){tx.drained=false;thisWrite(buffer,position,data,at,bytes);position+=bytes;at+=bytes;}if(at<data.length){tail.set(data.subarray(at),0);used=data.length-at;}},finish(){if(used){tail.fill(0,used);tx.drained=false;thisWrite(buffer,position,tail,0,4);position+=4;used=0;}return position;}};};
   const thisWrite=(buffer,offset,data,at=0,length=data.byteLength)=>this.sync(()=>device.queue.writeBuffer(buffer,offset,data.buffer,data.byteOffset+at,length),signal);
   const rgbWriter=uploadWriter(rgb),maskWriter=contains?uploadWriter(mask):null,maskStage=contains?stage(Uint8Array,plan.windowPixels,'Histogram100-membership-band'):null,cooperate=createCooperator(signal);
   const uploadStarted=performance.now(),columns=Math.min(width,plan.windowPixels),rows=columns===width?Math.max(1,Math.floor(plan.windowPixels/width)):1;let readWindows=0;
   for(let y=0;y<height;y+=rows)for(let x=0;x<width;x+=columns){
    await cooperate();checkAbort(signal);const w=Math.min(columns,width-x),h=Math.min(rows,height-y),part=await source.readWindow({x,y,width:w,height:h},{signal});windows.add(part);
    try{checkAbort(signal);if(this.closing)throw new EngineError('DISPOSED','Histogram100 service closed during its source read.');const data=part.pixels?.data;requireValue(part.pixels?.format==='rgb8'&&part.pixels.width===w&&part.pixels.height===h&&data instanceof Uint8Array&&data.length===w*h*3,'A complete RGB8 Histogram100 window is required.');rgbWriter.append(data);if(contains){for(let yy=0;yy<h;yy++){if((yy&31)===0)await cooperate();for(let xx=0;xx<w;xx++)maskStage[yy*w+xx]=contains(x+xx,y+yy)?1:0;}maskWriter.append(maskStage.subarray(0,w*h));}readWindows++;}
    finally{await retireWindow(part);}
    onProgress?.({phase:'equalization-statistics',fraction:Math.min(1,(y+h)/height)});
   }
   requireValue(rgbWriter.finish()===plan.sourceBytes&&(!maskWriter||maskWriter.finish()===plan.maskBytes),'Histogram100 upload population changed.');
   const uniform=stage(Uint32Array,8,'Histogram100-parameters');uniform.set([width,height,plan.pixels,plan.groups,contains?1:0,plan.applyGroups,plan.sourceBytes/4,0]);thisWrite(params,0,uniform);
   const uploadMilliseconds=performance.now()-uploadStarted;
   const mapRead=async(buffer,size,consume)=>{
    await this.asyncCall(()=>buffer.mapAsync(GPUMapMode.READ,0,size),signal);tx.mapping={buffer,mapped:true,release:null};
    const mapped=this.sync(()=>buffer.getMappedRange(0,size),signal);tx.mapping.release=this.budget.registerBacking?.('gpu-mapped',size,{owner:'global-histogram100',label:'Histogram100-mapping',identity:mapped});checkAbort(signal);
    await consume(mapped);this.sync(()=>buffer.unmap(),signal);tx.mapping.mapped=false;await tx.mapping.release?.();tx.mapping=null;checkAbort(signal);
   };
   const histogramStarted=performance.now(),encoder=this.sync(()=>device.createCommandEncoder(),signal);
   this.sync(()=>{const pass=encoder.beginComputePass();pass.setPipeline(hp);pass.setBindGroup(0,hb);pass.dispatchWorkgroups(plan.groups);pass.setPipeline(rp);pass.setBindGroup(0,rb);pass.dispatchWorkgroups(1);pass.end();encoder.copyBufferToBuffer(histogram,0,histRead,0,1024);device.queue.submit([encoder.finish()]);},signal);tx.drained=false;
   const counts=stage(Float64Array,256,'Histogram100-counts');await mapRead(histRead,1024,mapped=>{const values=new Uint32Array(mapped);for(let i=0;i<256;i++)counts[i]=values[i];});
   const histogramMilliseconds=performance.now()-histogramStarted,lutStarted=performance.now(),lut=histogramEqualizationLut(counts,'histogram',100),table=stage(Uint8Array,65536,'Histogram100-ratio-table');
   for(let value=0;value<256;value++){const next=lut[value];for(let channel=0;channel<256;channel++)table[value*256+channel]=next===value?channel:value?Math.max(0,Math.min(255,Math.round(channel*next/value))):next;}
   thisWrite(ratios,0,table);const lutMilliseconds=performance.now()-lutStarted,mapStarted=performance.now();
   for(let offset=0;offset<plan.sourceBytes;offset+=plan.readBytes){
    await cooperate();checkAbort(signal);const length=Math.min(plan.readBytes,plan.sourceBytes-offset),copy=this.sync(()=>device.createCommandEncoder(),signal);
    this.sync(()=>{if(offset===0){const pass=copy.beginComputePass();pass.setPipeline(ap);pass.setBindGroup(0,ab);pass.dispatchWorkgroups(plan.applyGroups);pass.end();}copy.copyBufferToBuffer(output,offset,rgbRead,0,length);device.queue.submit([copy.finish()]);},signal);tx.drained=false;
    await mapRead(rgbRead,length,async mapped=>{const bytes=new Uint8Array(mapped,0,Math.min(length,plan.bytes-offset));await outputStore.write(bytes,offset,{signal});});
    onProgress?.({phase:'equalization-render',fraction:Math.min(1,(offset+length)/plan.bytes)});
   }
   tx.drained=true;const oom=await this.asyncCall(()=>device.popErrorScope(),signal);tx.scopes--;const validation=await this.asyncCall(()=>device.popErrorScope(),signal);tx.scopes--;
   if(oom||validation)throw gpuOwnerFailure(this,new EngineError(oom?'GPU_OUT_OF_MEMORY':'GPU_FAILED',(oom??validation).message));
   await outputStore.flush();checkAbort(signal);outputSurface=createRgbSurface(outputStore,{width,height,budget:this.budget});
   record={surface:outputSurface,metrics:{equalization:{method:'histogram',value:100,backend:'webgpu',domain:'admitted-native-pixels',channels:'HSV-V',boundedWindows:true,traversal:'native-bands-GPU-histogram',gpuHistogramPasses:1,gpuApplyPasses:1,gpuReadbackBytes:plan.bytes,sourceReadWindows:readWindows,cold,setupMilliseconds,uploadMilliseconds,histogramMilliseconds,lutMilliseconds,mapAndReadbackMilliseconds:performance.now()-mapStarted,workspaceBytes:plan.workspaceBytes,elapsedMs:performance.now()-started}}};
   checkAbort(signal);published=true;return record;
  }catch(error){failed=true;primary=error;throw error;}
  finally{
   let cleanup;try{await retireGpuTransaction(this,tx);}catch(error){cleanup=error;}
   const closedDuringRun=this.closing&&!failed;
   if(!published||failed||cleanup||closedDuringRun)try{await outputOwner.release();}catch(error){cleanup??=error;}
   else this.pendingResults.delete(outputOwner);
   this.busy=false;
   if(cleanup){if(failed){attachGpuCleanup(primary,cleanup);}else throw cleanup;}
   if(closedDuringRun)throw new EngineError('DISPOSED','Histogram100 service closed before output adoption.');
   if(record&&!failed&&!cleanup){record.metrics.equalization.elapsedMs=performance.now()-started;this.completed++;}
  }
 }
 async dispose(){this.closing=true;await this.queue;await retireOwnedGpuDevice(this);this.closed=true;}
}

export async function tryGlobalHistogram100Gpu(source,options={}){
 const {budget,signal,backend='auto'}=options;requireValue(['cpu','auto','webgpu'].includes(backend),'Unknown global Histogram100 backend.');checkAbort(signal);
 requireValue(budget?.reserve&&budget?.total,'A shared Histogram100 Budget is required.');
 if(backend==='cpu'||!globalThis.navigator?.gpu)return null;
 let service=services.get(budget);if(!service){service=new GlobalHistogram100Gpu(budget);services.set(budget,service);}
 return service.compute(source,options);
}
export function globalHistogram100GpuState(budget){const service=services.get(budget);return service?{calls:service.calls,completed:service.completed,lastFallback:service.lastFallback,pipelines:service.pipelines?.length??0,pending:service.pending.size,failedOutputs:service.pendingResults.size}:null;}
export async function disposeGlobalHistogram100Gpu(budget){const service=services.get(budget);if(service){await service.dispose();if(services.get(budget)===service)services.delete(budget);}}
