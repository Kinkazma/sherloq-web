import {requireValue,EngineError,checkAbort} from './errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {copyTypedArray,allocateTypedArray} from './allocation.js';
import {gpuOwnerSync,gpuOwnerAsync,gpuOwnerReserve,gpuOwnerFailure,retireOwnedGpuDevice} from './gpu-context-owner.js';
import {gpuTransaction,retireGpuTransaction,attachGpuCleanup} from './gpu-ack-retirement.js';
import {ownGpuArrays} from './gpu-owned-arrays.js';
const MiB=1024**2;
// Appended to the verified native Ghost source. Only the decoded RGB reader is
// replaced; the IEEE754 quotient table, addition and NumPy pairwise order match
// ghostNativeMeans. No Float32 arithmetic enters a cached raw quality plane.
export const ghostExternalPairShader=`
var<workgroup> externalLanes:array<vec2u,16>;
fn externalByte(at:u32)->i32{return i32((pairInput[at/4u]>>((at%4u)*8u))&255u);}
fn externalGhostTerm(block:u32,pixel:u32)->vec2u{
 let cols=p.width/16u;let at=((block/cols*16u+pixel/16u)*p.width+block%cols*16u+pixel%16u)*3u;
 let r=byte(at)-externalByte(at);let g=byte(at+1u)-externalByte(at+1u);let b=byte(at+2u)-externalByte(at+2u);
 return nativeThirds[u32(r*r+g*g+b*b)];
}
@compute @workgroup_size(16) fn ghostExternalMeans(@builtin(workgroup_id) group:vec3u,@builtin(local_invocation_index) lane:u32){
 let block=group.x+group.y*p.renderGroupsX;if(block>=p.blocks){return;}let half=lane/8u;let first=half*128u+lane%8u;var sum=externalGhostTerm(block,first);
 for(var j=1u;j<16u;j++){sum=positive64Add(sum,externalGhostTerm(block,first+j*8u));}externalLanes[lane]=sum;workgroupBarrier();
 if(lane==0u||lane==8u){let at=half*8u;let a=positive64Add(externalLanes[at],externalLanes[at+1u]);let b=positive64Add(externalLanes[at+2u],externalLanes[at+3u]);let c=positive64Add(externalLanes[at+4u],externalLanes[at+5u]);let d=positive64Add(externalLanes[at+6u],externalLanes[at+7u]);externalLanes[at]=positive64Add(positive64Add(a,b),positive64Add(c,d));}workgroupBarrier();
 if(lane==0u){let value=positive64Add(externalLanes[0],externalLanes[8]);nativeMeans[p.gray+block]=select(vec2u(value.x,value.y-0x800000u),vec2u(0u),positive64Zero(value));}
}
`;
// The producer invokes consume for its existing <=32-line RGB windows. Encoding
// remains the selected codec's job. Eight queued uploads bound driver staging;
// only one final binary64 plane is mapped, after its dependent dispatches.
export async function runGhostExternalQuality(owner,width,height,produce,{signal,onSubmitted,onProgress}={}){
 requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>=16&&height>=16&&Number.isSafeInteger(width*height*3)&&typeof produce==='function','A complete RGB Ghost quality producer is required.');
 checkAbort(signal);if(owner.closed)throw new EngineError('DISPOSED','Ghost GPU closed.');if(owner.busy)throw new EngineError('BUSY','Ghost GPU already running.');owner.busy=true;owner.fallbackFailures=new WeakSet();
 const started=performance.now(),record=gpuTransaction(owner);let owned,published=false,failed=false,primary,hostThirds,thirdBacking;
 const api=fn=>gpuOwnerSync(owner,fn,signal),asyncApi=fn=>gpuOwnerAsync(owner,fn,signal);
 try{
  if(owner.pending.size>1||owner.lost||owner.retirementNeeded||owner.orphanPipelineFees.size){owner.pending.delete(record);await retireOwnedGpuDevice(owner);owner.pending.add(record);}
  record.lease=await getExecutionScheduler(owner.budget).acquire({cpu:0,gpu:1,signal,resourceOwner:'ela',label:'ghost-selected-RGB-binary64-means'});await owner.initialize(signal);record.device=owner.device;
  const compileStart=performance.now(),pipeline=await owner.pipeline('ghostExternalMeans',signal),compileMs=performance.now()-compileStart,device=owner.device,cols=Math.floor(width/16),rows=Math.floor(height/16),bandRows=Math.min(32,height),sourceBytes=Math.ceil(width*bandRows*3/4)*4,resultBytes=cols*rows*8,tableBytes=195076*8,axis=device.limits.maxComputeWorkgroupsPerDimension;
  if([sourceBytes,resultBytes,tableBytes].some(n=>!Number.isSafeInteger(n)||n>device.limits.maxBufferSize||n>device.limits.maxStorageBufferBindingSize)||Math.ceil(cols*2/axis)>axis)throw gpuOwnerFailure(owner,new EngineError('GPU_LIMIT','Selected Ghost RGB reduction exceeds GPU transport.'));
  // Two RGB buffers, at most eight pairs of pending upload copies, quotient
  // source/upload/device, output/mapping/host and bounded parameter staging.
  record.workspace=gpuOwnerReserve(owner,sourceBytes*18+tableBytes*3+resultBytes*4+4096+2*MiB);record.outputFree=record.workspace.split(resultBytes);
  const fee=record.workspace;record.workspace=async()=>{if(thirdBacking){const n=await thirdBacking();if(n!==0)owner.budget.notifyBackingRelease?.('array-buffer',n??tableBytes);thirdBacking=null;}hostThirds=null;await fee();};
  api(()=>device.pushErrorScope('validation'));record.scopes++;api(()=>device.pushErrorScope('out-of-memory'));record.scopes++;
  const make=(size,usage,label)=>{const b=api(()=>device.createBuffer({size,usage,label})),entry={bytes:size,destroyed:false,release:null};record.buffers.set(b,entry);entry.release=owner.budget.registerBacking?.('gpu',size,{owner:'ela',label});return b;};
  const source=make(sourceBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'Ghost-selected-original-band'),decoded=make(sourceBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'Ghost-selected-decoded-band'),uniform=make(48,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,'Ghost-selected-band-parameters'),thirds=make(tableBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'Ghost-selected-exact-third'),output=make(resultBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'Ghost-selected-binary64-means'),read=make(resultBytes,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ,'Ghost-selected-plane-readback');
  hostThirds=allocateTypedArray(Float64Array,195076,{label:'Ghost-selected-IEEE-third'});for(let i=0;i<hostThirds.length;i++)hostThirds[i]=i/3;thirdBacking=owner.budget.registerBacking?.('array-buffer',tableBytes,{owner:'ela',label:'Ghost-selected-IEEE-third',identity:hostThirds.buffer});api(()=>device.queue.writeBuffer(thirds,0,hostThirds));
  const bind=api(()=>device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[[0,source],[5,uniform],[6,decoded],[14,thirds],[15,output]].map(([binding,buffer])=>({binding,resource:{buffer}}))}));
  let nextY=0,bands=0,dispatches=0,fences=0;const submitStart=performance.now();
  const write=(buffer,data)=>{const prefix=Math.floor(data.byteLength/4)*4;if(prefix)api(()=>device.queue.writeBuffer(buffer,0,data,0,prefix));if(prefix<data.length){const tail=new Uint8Array(4);tail.set(data.subarray(prefix));api(()=>device.queue.writeBuffer(buffer,prefix,tail));}};
  const codecDetails=await produce(async(original,reconstructed,{y,rows:count})=>{
   checkAbort(signal);requireValue(original instanceof Uint8Array&&reconstructed instanceof Uint8Array&&original.length===width*count*3&&reconstructed.length===original.length&&y===nextY&&y%16===0&&Number.isInteger(count)&&count>0&&count<=32&&y+count<=height&&(y+count===height||count%16===0),'Ordered complete selected Ghost RGB bands required.');nextY+=count;bands++;
   const cells=cols*Math.floor(count/16);if(!cells)return;const gx=Math.min(cells,axis),gy=Math.ceil(cells/gx);write(source,original);write(decoded,reconstructed);api(()=>device.queue.writeBuffer(uniform,0,Uint32Array.of(width,count,0,0,0,0,cells,0,y/16*cols,gx,0,0)));
   const encoder=api(()=>device.createCommandEncoder());api(()=>{const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(gx,gy);pass.end();});record.drained=false;api(()=>device.queue.submit([encoder.finish()]));dispatches++;onSubmitted?.({phase:'ghost-selected-rgb-gpu-submitted',bands,dispatches});
   if(dispatches%8===0){await asyncApi(()=>device.queue.onSubmittedWorkDone());fences++;record.drained=true;checkAbort(signal);}
  });
  requireValue(nextY===height,'Selected Ghost producer must complete its whole admitted context.');
  const encoder=api(()=>device.createCommandEncoder());api(()=>encoder.copyBufferToBuffer(output,0,read,0,resultBytes));record.drained=false;checkAbort(signal);api(()=>device.queue.submit([encoder.finish()]));await asyncApi(()=>read.mapAsync(GPUMapMode.READ));record.mapping={buffer:read,mapped:true,release:null};checkAbort(signal);
  while(record.scopes){const error=await asyncApi(()=>device.popErrorScope());record.scopes--;if(error)throw gpuOwnerFailure(owner,new EngineError('GPU_FAILED',error.message));}record.drained=true;
  const mapped=api(()=>read.getMappedRange());record.mapping.release=owner.budget.registerBacking?.('gpu-mapped',resultBytes,{owner:'ela',label:'Ghost-selected-plane-mapping',identity:mapped});const means=copyTypedArray(new Float64Array(mapped),{label:'Ghost-selected-NumPy-exact-means'});api(()=>read.unmap());record.mapping.mapped=false;await record.mapping.release?.();record.mapping=null;checkAbort(signal);onProgress?.(1);checkAbort(signal);
  const owners=[];owned=ownGpuArrays({means},record.outputFree,owners,owner.budget,{width,height,cols,rows,codecDetails,runtime:{backend:'webgpu-external-rgb',kernel:'selected-RGB-NumPy-binary64-exact-means',compileMs,bodyMilliseconds:performance.now()-submitStart,totalMs:performance.now()-started,bands,dispatches,queueFences:fences,maximumQueuedBands:Math.min(8,dispatches),queueBoundBands:8,sourceUploads:dispatches*2,dctPreparations:0,rgbReadbackBytes:0,readbackBytes:resultBytes,readbacks:1,nativeMeansExact:true,codecBackend:'cpu',acknowledgement:'final-dependent-readback-and-valid-scopes'}},owner.pendingResults);record.outputFree=null;owner.pendingResults.add(owned);owners.push({bytes:means.byteLength,release:owner.budget.registerBacking?.('array-buffer',means.byteLength,{owner:'ela',label:'Ghost-selected-exact-output',identity:means.buffer})});published=true;return owned;
 }catch(error){failed=true;primary=error;throw error;}
 finally{let cleanupFailed=false,cleanup;try{await retireGpuTransaction(owner,record);}catch(error){cleanupFailed=true;cleanup=error;}try{if(owned&&(!published||failed||cleanupFailed))await owned.release();else if(owned)owner.pendingResults.delete(owned);}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanup=error;}}owner.busy=false;if(cleanupFailed){if(failed)attachGpuCleanup(primary,cleanup);else throw cleanup;}}
}
