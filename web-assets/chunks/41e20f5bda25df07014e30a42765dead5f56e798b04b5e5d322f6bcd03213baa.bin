import "../../runtime-context.js?v=0.33.3";
import {native16SeparationFilterPlan,native16NlmGpuHeapPlan} from './native16-separation-filter-plan.js';
import {EngineError,requireValue,checkAbort,createCooperator,normalizeResourceError} from './errors.js';
import {createGpuAttemptArray,gpuRetirementFailure,gpuRetirementBlocked} from './gpu-attempt-retirement.js';
import {gray} from './pixel-utils.js';
const LITTLE_ENDIAN=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;
// Typed transport for the existing separation device/buffers/pipelines. No
// second device or full-frame retained source is created by this adapter.
export async function runNative16SeparationGpu(image,p,start,rows,hooks,owner){
 const{budget,device,buffer,pipeline,tableFor,scheduler,operation,stats,isLost}=owner,{signal,nativeGpuRetirement,retirementTicket,retirementCacheOwner}=hooks,w=image.width,h=image.height,n=w*h,total=w*rows;
 requireValue(image.data instanceof Uint16Array&&image.data.length===n*3&&[w,h,start,rows].every(Number.isSafeInteger)&&w>0&&h>0&&start>=0&&rows>0&&start+rows<=h&&([0,1,2,3,4].includes(p.mode)||!!hooks.nativeProgram)&&Number.isInteger(p.radius)&&p.radius>=1&&p.radius<=(p.mode===1?(owner.maximumGaussianRadius??10):10)&&typeof p.grayscale==='boolean'&&!hooks.membership,'Invalid native16 separation GPU window.');
 if(p.mode===3)requireValue(Number.isInteger(p.sigma)&&p.sigma>=1&&p.sigma<=200,'Invalid native16 bilateral sigma.');
 const originX=hooks.nativeOriginX??0,originY=hooks.nativeOriginY??0,nativeWidth=hooks.nativeWidth??w;requireValue([originX,originY,nativeWidth].every(Number.isSafeInteger)&&originX>=0&&originY>=0&&nativeWidth>0&&originX+w-1<=0xffffffff&&originY+start+rows-1<=0xffffffff&&nativeWidth<=0xffffffff,'Invalid native16 GPU window origin.');
 if(p.mode===4){const heap=native16NlmGpuHeapPlan(w,h,rows,p.grayscale);requireValue(heap.requiredBytes<=heap.heapBytes,'Native16 NLM preparation exceeds its existing heap');}
 checkAbort(signal);const cooperate=createCooperator(signal);let packed,output,lease,read,mapping,submitted=false,drained=false,complete=false,scopes=0,failed=false,primary,retirement,refusedDuringCalculation=false,proof,cacheRecorded=false,precisionRepairs=0,precisionStageMs=0;
 const popScope=async()=>{try{const value=await device.popErrorScope();scopes--;return value;}catch(error){refusedDuringCalculation=true;throw error;}};
 const attempt={
  async retire(){
   if(retirement)return retirement;
   const task=(async()=>{let refused=false,cleanup;const step=async action=>{try{await action();}catch(error){if(!refused)cleanup=error;refused=true;}};
    // mapAsync settlement is a drain even when mapping itself failed. A
    // rejected calculation promise is not an unacknowledged retirement.
    if(mapping){await Promise.allSettled([mapping]);mapping=null;}
    if(read)await step(()=>{if(read.mapState==='mapped')read.unmap();});
    if(submitted&&!drained)await step(async()=>{try{await device.queue.onSubmittedWorkDone();}catch(error){if(!isLost()||!device.lost)throw error;await device.lost;}drained=true;});
    while(scopes){let popped=false;await step(async()=>{await device.popErrorScope();scopes--;popped=true;});if(!popped)break;}
    await step(()=>owner.retirePrefixes?.());
    if(packed)await step(()=>{packed.release();packed=null;});
    if(!complete&&output)await step(()=>{output.release();owner.retireOutput?.(output);output=null;});
    if(!scopes&&(!submitted||drained)&&(!read||read.mapState!=='mapped')&&lease)await step(()=>{lease.release();lease=null;});
    if(refused)throw cleanup;
    if(proof&&!cacheRecorded&&!nativeGpuRetirement.sealed){if(owner.proofKnown?.()!==true||!retirementCacheOwner)proof.unproven(attempt);else{proof.retainCache(attempt,retirementCacheOwner);cacheRecorded=true;}}
    if(!complete&&cacheRecorded)proof?.acknowledge(attempt);
    if(complete&&output)owner.adoptOutput?.(output);
    owner.retireAttempt?.(attempt);
   })();retirement=task;try{return await task;}finally{if(retirement===task)retirement=null;}
  },
  async dispose(){complete=false;await attempt.retire();await owner.disposeEngine?.();if(owner.proofKnown?.()!==true)proof?.unproven(attempt);proof?.acknowledge(attempt);}
 };
 // This durable owner exists before either reservation or typed constructor.
 if(nativeGpuRetirement)proof=nativeGpuRetirement.adopt(retirementTicket,attempt);
 owner.adoptAttempt?.(attempt);
 try{
  const hostPlan=owner.executionPlan(w,h,rows,p,{sampleDepth:16,nativeProgram:hooks.nativeProgram});
  if(hostPlan.transport==='rgb16-tight')requireValue(LITTLE_ENDIAN,'Tight RGB16 GPU transport requires little-endian typed arrays.');
  output=createGpuAttemptArray(Uint16Array,hostPlan.hostOutputBytes/2,{budget,owner:'separation',label:'native16-filter-output'});output.allocate();packed=createGpuAttemptArray(Uint32Array,hostPlan.hostPackedBytes/4,{budget,owner:'separation',label:'native16-packed-window'});packed.allocate();
  lease=await scheduler.acquire({cpu:1,gpu:0,signal,resourceOwner:'separation',label:'separation-native16-preparation'});const prepared=performance.now();
  if(hostPlan.transport==='rgb16-tight'){
   checkAbort(signal);const codes=new Uint16Array(packed.data.buffer,packed.data.byteOffset,packed.data.byteLength/2);codes.set(image.data);
   if(codes.length>image.data.length)codes[image.data.length]=0;
   checkAbort(signal);
  }
  else if(p.mode===4){requireValue(typeof owner.packNlm16==='function','Native16 NLM owned preparation is unavailable');owner.packNlm16(image,p,packed.data);await cooperate();}
  else{for(let i=0;i<n;i++){if(i%8192===0)await cooperate();const r=image.data[3*i],g=image.data[3*i+1],b=image.data[3*i+2],v=p.grayscale?gray(r,g,b):0;packed.data[2*i]=(p.grayscale?v:r)|((p.grayscale?v:g)<<16);packed.data[2*i+1]=p.grayscale?v:b;}}
  const lut=hooks.nativeProgram?{data:hooks.nativeProgram.table}:tableFor(p),gpuPlan=owner.executionPlan(w,h,rows,p,{sampleDepth:16,tableBytes:lut.data.byteLength,nativeProgram:hooks.nativeProgram}),sizes=gpuPlan.buffers;stats.nativePreparationMs+=performance.now()-prepared;try{lease.release();lease=null;}catch(error){refusedDuringCalculation=true;throw error;}
  lease=await scheduler.acquire({cpu:0,gpu:1,signal,resourceOwner:'separation',label:'separation-native16-filter'});device.pushErrorScope('validation');scopes++;device.pushErrorScope('out-of-memory');scopes++;
  const src=buffer('source',sizes.source,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),out=buffer('output',sizes.output,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),uniform=buffer('shape',sizes.shape,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),tab=buffer('table',sizes.table,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),mask=buffer('membership',sizes.membership,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),scratch=buffer('scratch',sizes.scratch,GPUBufferUsage.STORAGE);
  read=buffer('readback',sizes.readback,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);device.queue.writeBuffer(src,0,packed.data);let tableUploadBytes;if(hooks.nativeProgram&&owner.uploadProgramTable)tableUploadBytes=owner.uploadProgramTable(tab,hooks.nativeProgram);else{owner.invalidateProgramTable?.();device.queue.writeBuffer(tab,0,lut.data);tableUploadBytes=lut.data.byteLength;}device.queue.writeBuffer(mask,0,new Uint32Array(1));device.queue.writeBuffer(uniform,0,new Uint32Array([w,h,start,rows,0,originX,nativeWidth,!hooks.nativeProgram&&(p.mode===3||p.mode===4)?lut.count:originY]));stats.uploadedBytes+=packed.data.byteLength+tableUploadBytes+4;
  const group=device.createBindGroup({layout:owner.layout,entries:[src,out,uniform,tab,mask,scratch].map((buffer,binding)=>({binding,resource:{buffer}}))}),passes=hooks.nativeProgram?hooks.nativeProgram.passes:native16SeparationFilterPlan(p).passes,programs=[];
  for(const pass of passes)programs.push([await pipeline(p,pass,hooks.nativeProgram),pass==='horizontal'?n:total]);
  const encoder=device.createCommandEncoder();
  for(const[program,count]of programs){const pass=encoder.beginComputePass();pass.setPipeline(program);pass.setBindGroup(0,group);if(!hooks.nativeProgram&&p.mode===4)pass.dispatchWorkgroups(Math.ceil(w/8),Math.ceil(rows/8));else pass.dispatchWorkgroups(Math.ceil(count/64));pass.end();stats.dispatches++;}
  const readbackBytes=sizes.readback;encoder.copyBufferToBuffer(out,0,read,0,readbackBytes);checkAbort(signal);const began=performance.now();device.queue.submit([encoder.finish()]);submitted=true;
  await operation('separation-native16:readback',()=>mapping=read.mapAsync(GPUMapMode.READ,0,readbackBytes),{bytes:readbackBytes});
  checkAbort(signal);const words=new Uint32Array(read.getMappedRange(0,readbackBytes));let flagged=0;
  if(hostPlan.transport==='rgb16-tight'){output.data.set(new Uint16Array(words.buffer,words.byteOffset,output.data.length));checkAbort(signal);}
  else if(!hooks.nativeProgram&&p.mode===4){const precisionStageStarted=performance.now();try{lease.release();lease=null;}catch(error){refusedDuringCalculation=true;throw error;}lease=await scheduler.acquire({cpu:1,gpu:0,signal,resourceOwner:'separation',label:'separation-native16-nlm-colour-finish'});checkAbort(signal);const finishStarted=performance.now();requireValue(typeof owner.finishNlm16==='function','Owned native16 NLM finish is unavailable');const finish=owner.finishNlm16(packed.data,words,w,h,start,rows,p,output.data);precisionRepairs=finish.precisionRepairs;stats.precisionRepairs+=precisionRepairs;stats.nativePrecisionRepairMs+=finish.precisionRepairMs;stats.nativePreparationMs+=performance.now()-finishStarted-finish.precisionRepairMs;precisionStageMs=performance.now()-precisionStageStarted;}else for(let i=0;i<total;i++){output.data[3*i]=words[2*i]&65535;output.data[3*i+1]=words[2*i]>>>16;output.data[3*i+2]=words[2*i+1]&65535;if(!hooks.nativeProgram&&p.mode===3&&(words[2*i+1]&0x80000000))flagged++;}
  if(flagged){const precisionStageStarted=performance.now();try{lease.release();lease=null;}catch(error){refusedDuringCalculation=true;throw error;}lease=await scheduler.acquire({cpu:1,gpu:0,signal,resourceOwner:'separation',label:'separation-native16-precision-repair'});checkAbort(signal);const repairStarted=performance.now();requireValue(typeof owner.repairBilateral16==='function','Owned native16 sparse repair is unavailable');precisionRepairs=owner.repairBilateral16(packed.data,words,w,h,start,rows,p,originX,nativeWidth,output.data);requireValue(precisionRepairs===flagged,'Native16 sparse repair count differs from the GPU flags');stats.precisionRepairs+=precisionRepairs;stats.nativePrecisionRepairMs+=performance.now()-repairStarted;precisionStageMs=performance.now()-precisionStageStarted;}
  try{read.unmap();mapping=null;}catch(error){refusedDuringCalculation=true;throw error;}
  stats.gpuWallMs+=performance.now()-began-precisionStageMs;stats.readbackBytes+=readbackBytes;const oom=await popScope();const validation=await popScope();if(oom||validation)throw new EngineError(oom?'MEMORY_ALLOCATION':'GPU_FAILED',(oom??validation).message);if(isLost())throw new EngineError('GPU_FAILED','Separation device lost');checkAbort(signal);stats.calls++;complete=true;drained=true;return{bytes:output.data,precisionRepairs,release(){const captured=output;try{captured.release();owner.retireOutput?.(captured);proof?.acknowledge(attempt);}catch(error){owner.refuseOutput?.(captured);throw gpuRetirementFailure(error,{dispose:()=>{captured.release();owner.retireOutput?.(captured);proof?.acknowledge(attempt);}},error);}}};
 }catch(error){owner.invalidateProgramTable?.();failed=true;primary=normalizeResourceError(error);throw primary;}
 finally{
  if(refusedDuringCalculation||failed&&gpuRetirementBlocked(primary)){complete=false;throw gpuRetirementFailure(primary,attempt,primary);}
  try{await attempt.retire();}catch(cleanup){
   // The apparent return has not transferred its output while finally runs.
   // Preserve that same owner, rather than retrying its NACK in this frame.
   complete=false;throw gpuRetirementFailure(failed?primary:cleanup,attempt,cleanup);
  }
 }
}
