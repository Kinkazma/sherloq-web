import "../../runtime-context.js?v=0.30.0";
import {ElaJpegArchiveGpu} from './ela-jpeg-archive-gpu.js';
import {elaJpegQuantization} from './ela-gpu.js';
import {requireValue,EngineError,checkAbort} from './errors.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {copyTypedArray} from './allocation.js';
import {gpuOwnerSync,gpuOwnerAsync,gpuOwnerReserve,gpuOwnerFailure,retireOwnedGpuDevice} from './gpu-context-owner.js';
import {gpuTransaction,retireGpuTransaction,attachGpuCleanup} from './gpu-ack-retirement.js';
import {ownGpuArrays} from './gpu-owned-arrays.js';
import {numpySum} from './numpy-sum.js';
import {GHOST_NATIVE_MEAN_ERROR,ghostPaletteBoundaryCells,ghostCellCodecBlocks} from './ghost-jpeg-numeric.js';
const MiB=1024**2;let manifest;
async function shaderSource({signal}={}){
 const root=new URL('../vendor/ghost-jpeg-gpu/',import.meta.url);
 manifest??=fetch(new URL('PINNED.json',root)).then(async response=>{if(!response.ok)throw new EngineError('CODEC_UNAVAILABLE','Native Ghost JPEG manifest unavailable.');return response.json();}).catch(error=>{manifest=null;throw error;});
 const spec=(await manifest).files?.['ghost-jpeg.wgsl'];requireValue(Number.isInteger(spec?.bytes)&&spec.bytes>0&&/^[a-f0-9]{64}$/.test(spec.sha256),'Pinned native Ghost JPEG source required.');checkAbort(signal);
 const response=await fetch(new URL('ghost-jpeg.wgsl',root),{signal});if(!response.ok)throw new EngineError('CODEC_UNAVAILABLE','Native Ghost JPEG source unavailable.');const bytes=await response.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');requireValue(bytes.byteLength===spec.bytes&&hash===spec.sha256,'Native Ghost JPEG source identity differs.');checkAbort(signal);return new TextDecoder().decode(bytes);
}
// A Ghost plane exposes RGB squared errors, never encoded JPEG bytes. Preserve
// the complete native codec graph, sharing only its quality-independent FDCT.
// Keep each quality's integer numerator until the caller's f64 /768 reduction.
export class GhostJpegGpu extends ElaJpegArchiveGpu{
 constructor(budget,{acknowledgeReadback=false,...options}={}){super(budget,{loadShader:shaderSource,...options});requireValue(typeof acknowledgeReadback==='boolean','Ghost GPU readback ACK policy required.');this.acknowledgeReadback=acknowledgeReadback;}
 async run(rgb,width,height,qualities,{signal,onSubmitted,onProgress}={}){
  requireValue(rgb instanceof Uint8Array&&Number.isInteger(width)&&Number.isInteger(height)&&width>=16&&height>=16&&width<=65500&&height<=65500&&rgb.length===width*height*3,'Complete native RGB Ghost context required.');
  requireValue(Array.isArray(qualities)&&qualities.length>0&&qualities.length<=101&&qualities.every((q,i)=>Number.isInteger(q)&&q>=0&&q<=100&&(i===0||q>qualities[i-1])),'Ordered native JPEG qualities0–100 required.');
  qualities=qualities.slice();
  checkAbort(signal);if(this.closed)throw new EngineError('DISPOSED','Ghost JPEG GPU closed.');if(this.busy)throw new EngineError('BUSY','Ghost JPEG GPU already running.');this.busy=true;this.fallbackFailures=new WeakSet();
  const record=gpuTransaction(this),start=performance.now();let owned,published=false,failed=false,primary;
  const api=operation=>gpuOwnerSync(this,operation,signal),asyncApi=operation=>gpuOwnerAsync(this,operation,signal);
  try{
   if(this.pending.size>1||this.lost||this.retirementNeeded||this.orphanPipelineFees.size){this.pending.delete(record);await retireOwnedGpuDevice(this);this.pending.add(record);}
   record.lease=await getExecutionScheduler(this.budget).acquire({cpu:0,gpu:1,signal,resourceOwner:'ela',label:'ghost-native-JPEG-shared-FDCT'});await this.initialize(signal);record.device=this.device;
   const compileStart=performance.now(),prepare=await this.pipeline('ghostPrepare',signal),reconstruct=await this.pipeline('ghostReconstruct',signal),errors=await this.pipeline('ghostErrors',signal),compileMs=performance.now()-compileStart;
   const device=this.device,yCols=Math.ceil(width/8),yRows=Math.ceil(height/8),cCols=Math.ceil(width/16),cRows=Math.ceil(height/16),blocks=yCols*yRows+2*cCols*cRows,cols=Math.floor(width/16),rows=Math.floor(height/16),sourceBytes=Math.ceil(rgb.length/4)*4,bankBytes=blocks*256,resultBytes=qualities.length*cols*rows*4,quantBytes=qualities.length*512,uniformBytes=qualities.length*256,axis=device.limits.maxComputeWorkgroupsPerDimension,gx=Math.min(Math.ceil(blocks/32),axis),gy=Math.ceil(blocks/32/gx),ex=Math.min(cols*rows,axis),ey=Math.ceil(cols*rows/ex);
   if([sourceBytes,bankBytes,resultBytes,quantBytes].some(bytes=>!Number.isSafeInteger(bytes)||bytes>device.limits.maxBufferSize||bytes>device.limits.maxStorageBufferBindingSize)||uniformBytes>device.limits.maxBufferSize||gy>axis||ey>axis)throw gpuOwnerFailure(this,new EngineError('GPU_LIMIT','Native Ghost JPEG context exceeds GPU transport.'));
   // Source caller backing remains funded by that caller. Include GPU source,
   // queue upload staging, two resident component banks, mapped readback, owned
   // host result and all per-quality quantization/uniform staging here.
   const selectedPipelineBytes=['ghostReconstructSelected','ghostTermsSelected'].reduce((bytes,name)=>bytes+(this.pipelines.has(name)?0:4*MiB),0),baseWorkspace=sourceBytes*2+bankBytes*2+Math.ceil(resultBytes*5.25)+cols*rows*4+quantBytes*2+uniformBytes*2+2*MiB,remaining=this.budget.limit-this.budget.total()-baseWorkspace-selectedPipelineBytes;
   const refineCapacity=Math.min(256,cols*rows,Math.floor(device.limits.maxBufferSize/(qualities.length*1024)),Math.floor(remaining/(qualities.length*2048+1280))),refineReadBytes=qualities.length*refineCapacity*1024;
   if(refineCapacity<1)throw gpuOwnerFailure(this,new EngineError('MEMORY_LIMIT','One exact Ghost ambiguity cell cannot fit the shared GPU budget.'));
   record.workspace=gpuOwnerReserve(this,baseWorkspace+refineReadBytes*2+refineCapacity*1280);record.outputFree=record.workspace.split(resultBytes*3);
   api(()=>device.pushErrorScope('validation'));record.scopes++;api(()=>device.pushErrorScope('out-of-memory'));record.scopes++;
   const make=(size,usage,label)=>{const buffer=api(()=>device.createBuffer({size,usage})),entry={bytes:size,destroyed:false,release:null};record.buffers.set(buffer,entry);entry.release=this.budget.registerBacking?.('gpu',size,{owner:'ela',label});return buffer;};
   const source=make(sourceBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'Ghost-native-RGB'),prepared=make(bankBytes,GPUBufferUsage.STORAGE,'Ghost-shared-FDCT'),planes=make(bankBytes,GPUBufferUsage.STORAGE,'Ghost-native-components'),quant=make(quantBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'Ghost-quality-tables'),uniform=make(uniformBytes,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,'Ghost-quality-parameters'),sums=make(resultBytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'Ghost-u32-error-sums'),read=make(resultBytes,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ,'Ghost-error-readback');
   const prefix=Math.floor(rgb.length/4)*4;if(prefix)api(()=>device.queue.writeBuffer(source,0,rgb,0,prefix));if(prefix<rgb.length){const tail=new Uint8Array(4);tail.set(rgb.subarray(prefix));api(()=>device.queue.writeBuffer(source,prefix,tail));}
   const quantization=new Uint32Array(qualities.length*128),parameters=new Uint32Array(qualities.length*64);
   for(let i=0;i<qualities.length;i++){quantization.set(elaJpegQuantization(Math.max(1,qualities[i])),i*128);parameters.set([width,height,yCols,yRows,cCols,cRows,blocks,gx,i,ex,0,0],i*64);}
   api(()=>device.queue.writeBuffer(quant,0,quantization));api(()=>device.queue.writeBuffer(uniform,0,parameters));
   const bind=(pipeline,items)=>api(()=>device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:items.map(([binding,buffer,offset,size])=>({binding,resource:{buffer,...(offset===undefined?{}:{offset}),...(size===undefined?{}:{size})}}))}));
   const encoder=api(()=>device.createCommandEncoder()),kernelStart=performance.now();
   api(()=>{let pass=encoder.beginComputePass();pass.setPipeline(prepare);pass.setBindGroup(0,bind(prepare,[[0,source],[5,uniform,0,48],[10,prepared]]));pass.dispatchWorkgroups(gx,gy);pass.end();});
   for(let i=0;i<qualities.length;i++)api(()=>{let pass=encoder.beginComputePass();pass.setPipeline(reconstruct);pass.setBindGroup(0,bind(reconstruct,[[1,quant,i*512,512],[2,planes],[5,uniform,i*256,48],[10,prepared]]));pass.dispatchWorkgroups(gx,gy);pass.end();pass=encoder.beginComputePass();pass.setPipeline(errors);pass.setBindGroup(0,bind(errors,[[0,source],[2,planes],[5,uniform,i*256,48],[9,sums]]));pass.dispatchWorkgroups(ex,ey);pass.end();});
   api(()=>encoder.copyBufferToBuffer(sums,0,read,0,resultBytes));checkAbort(signal);api(()=>device.queue.submit([encoder.finish()]));onSubmitted?.({phase:'ghost-jpeg-gpu-submitted',qualities:qualities.length,blocks});
   if(!this.acknowledgeReadback){await asyncApi(()=>device.queue.onSubmittedWorkDone());record.drained=true;while(record.scopes){const error=await asyncApi(()=>device.popErrorScope());record.scopes--;if(error)throw gpuOwnerFailure(this,new EngineError('GPU_FAILED',error.message));}}
   checkAbort(signal);await asyncApi(()=>read.mapAsync(GPUMapMode.READ));record.mapping={buffer:read,mapped:true,release:null};checkAbort(signal);
   if(this.acknowledgeReadback){while(record.scopes){const error=await asyncApi(()=>device.popErrorScope());record.scopes--;if(error)throw gpuOwnerFailure(this,new EngineError('GPU_FAILED',error.message));}record.drained=true;}
   const kernelMs=performance.now()-kernelStart,mapped=api(()=>read.getMappedRange());record.mapping.release=this.budget.registerBacking?.('gpu-mapped',resultBytes,{owner:'ela',label:'Ghost-error-mapping',identity:mapped});const host=copyTypedArray(new Uint32Array(mapped),{label:'Ghost-native-error-sums'});onProgress?.(1);api(()=>read.unmap());record.mapping.mapped=false;await record.mapping.release?.();record.mapping=null;checkAbort(signal);
   const means=new Float64Array(host.length),fractional=new Uint8Array(host.length);
   for(let i=0;i<host.length;i++){fractional[i]=host[i]>>>31;host[i]&=0x7fffffff;means[i]=host[i]/768;}
   const ambiguous=ghostPaletteBoundaryCells(means,fractional,qualities.length,cols*rows),refinementStart=performance.now();let refinedBlocks=0,refinementReadbackBytes=0;
   if(ambiguous.length){
    const selectedReconstruct=await this.pipeline('ghostReconstructSelected',signal),selectedTerms=await this.pipeline('ghostTermsSelected',signal),indexBuffer=make(refineCapacity*22*4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'Ghost-ambiguous-codec-blocks'),cellBuffer=make(refineCapacity*4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'Ghost-ambiguous-cells'),parametersBuffer=make(48,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,'Ghost-ambiguity-parameters'),termsBuffer=make(refineCapacity*1024,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'Ghost-ambiguous-pixel-numerators'),refineRead=make(refineReadBytes,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ,'Ghost-ambiguous-readback'),nativeTerms=new Float64Array(256);
    for(let lo=0;lo<ambiguous.length;lo+=refineCapacity){
     checkAbort(signal);const cells=ambiguous.slice(lo,lo+refineCapacity),indices=ghostCellCodecBlocks(cells,width,height),selectedGroups=Math.ceil(indices.length/32),selectedX=Math.min(selectedGroups,axis),selectedY=Math.ceil(selectedGroups/selectedX),termBytes=cells.length*1024;
     requireValue(indices.length<=refineCapacity*22,'Native Ghost selected block bound exceeded.');refinedBlocks+=indices.length;
     record.drained=false;api(()=>device.queue.writeBuffer(indexBuffer,0,indices));api(()=>device.queue.writeBuffer(cellBuffer,0,cells));api(()=>device.queue.writeBuffer(parametersBuffer,0,Uint32Array.of(width,height,yCols,yRows,cCols,cRows,blocks,selectedX,0,cells.length,cells.length,0)));
     api(()=>device.pushErrorScope('validation'));record.scopes++;api(()=>device.pushErrorScope('out-of-memory'));record.scopes++;
     const replay=api(()=>device.createCommandEncoder());
     for(let q=0;q<qualities.length;q++)api(()=>{let pass=replay.beginComputePass();pass.setPipeline(selectedReconstruct);pass.setBindGroup(0,bind(selectedReconstruct,[[1,quant,q*512,512],[2,planes],[5,parametersBuffer,0,48],[10,prepared],[11,indexBuffer,0,indices.byteLength]]));pass.dispatchWorkgroups(selectedX,selectedY);pass.end();pass=replay.beginComputePass();pass.setPipeline(selectedTerms);pass.setBindGroup(0,bind(selectedTerms,[[0,source],[2,planes],[5,parametersBuffer,0,48],[12,termsBuffer],[13,cellBuffer,0,cells.length*4]]));pass.dispatchWorkgroups(cells.length);pass.end();replay.copyBufferToBuffer(termsBuffer,0,refineRead,q*termBytes,termBytes);});
     checkAbort(signal);record.drained=false;api(()=>device.queue.submit([replay.finish()]));
     if(!this.acknowledgeReadback){await asyncApi(()=>device.queue.onSubmittedWorkDone());record.drained=true;while(record.scopes){const error=await asyncApi(()=>device.popErrorScope());record.scopes--;if(error)throw gpuOwnerFailure(this,new EngineError('GPU_FAILED',error.message));}}
     checkAbort(signal);await asyncApi(()=>refineRead.mapAsync(GPUMapMode.READ));record.mapping={buffer:refineRead,mapped:true,release:null};checkAbort(signal);
     if(this.acknowledgeReadback){while(record.scopes){const error=await asyncApi(()=>device.popErrorScope());record.scopes--;if(error)throw gpuOwnerFailure(this,new EngineError('GPU_FAILED',error.message));}record.drained=true;}
     const mappedTerms=api(()=>refineRead.getMappedRange());record.mapping.release=this.budget.registerBacking?.('gpu-mapped',refineReadBytes,{owner:'ela',label:'Ghost-ambiguity-mapping',identity:mappedTerms});const numerators=new Uint32Array(mappedTerms,0,qualities.length*cells.length*256);
     for(let q=0;q<qualities.length;q++){checkAbort(signal);for(let i=0;i<cells.length;i++){for(let pixel=0;pixel<256;pixel++)nativeTerms[pixel]=numerators[(q*cells.length+i)*256+pixel]/3;means[q*cols*rows+cells[i]]=numpySum(nativeTerms)/256;}}
     api(()=>refineRead.unmap());record.mapping.mapped=false;await record.mapping.release?.();record.mapping=null;refinementReadbackBytes+=qualities.length*termBytes;checkAbort(signal);
    }
   }
   const owners=[];owned=ownGpuArrays({sums:host,means},record.outputFree,owners,this.budget,{width,height,cols,rows,qualities:[...qualities],runtime:{backend:'webgpu-native-ISLOW420',kernel:'native-RGB-ghost-shared-FDCT-integer-reduction',compileMs,kernelMs,refinementMs:performance.now()-refinementStart,totalMs:performance.now()-start,blocks,sourceUploads:1,dctPreparations:1,rgbReadbackBytes:0,readbackBytes:resultBytes,refinedCells:ambiguous.length,refinedBlocks,refinementReadbackBytes,unrefinedMeanErrorBound:GHOST_NATIVE_MEAN_ERROR,acknowledgement:this.acknowledgeReadback?'final-dependent-readback-and-valid-scopes':'queue-fence-and-readback'}},this.pendingResults);record.outputFree=null;this.pendingResults.add(owned);for(const array of [host,means])owners.push({bytes:array.byteLength,release:this.budget.registerBacking?.('array-buffer',array.byteLength,{owner:'ela',label:'Ghost-native-error-output',identity:array.buffer})});published=true;return owned;
  }catch(error){failed=true;primary=error;throw error;}
  finally{let cleanupFailed=false,cleanup;try{await retireGpuTransaction(this,record);}catch(error){cleanupFailed=true;cleanup=error;}try{if(owned&&(!published||failed||cleanupFailed))await owned.release();else if(owned)this.pendingResults.delete(owned);}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanup=error;}}this.busy=false;if(cleanupFailed){if(failed)attachGpuCleanup(primary,cleanup);else throw cleanup;}}
 }
}
