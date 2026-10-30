import "../../runtime-context.js?v=0.30.0";
import {createNeuralTensor,noteNeuralTensorTaskYield} from './neural-tensor-store.js';
import {executionSummary} from './neural-execution-summary.js';
import {ritaQueryPlan,ritaAttentionBytes} from './rita-query-plan.js';
import {requireValue,checkAbort} from './errors.js';
import {runWithResourceRecovery} from './resource-recovery.js';
const MiB=1024**2,f=Math.fround;
const invariantSources=new WeakMap();let invariantSourceSerial=0;
/** Retry only an uncommitted native row window. Successful rows stay in their
 * exact feature bank; normal admission keeps the original aggressive width. */
export async function ritaAdaptiveRows(height,initialRows,work,{signal,onProgress,operation='rita-rows'}={}){
 let step=initialRows;for(let top=0;top<height;){checkAbort(signal);const rows=Math.min(step,height-top);try{await work(top,rows);top+=rows;}catch(error){if(!['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error.code)||rows===1)throw error;step=Math.max(1,Math.floor(rows/2));onProgress?.({phase:'rita-row-memory-retry',operation,completed:top,total:height,rows:step,sourceGeometryUnchanged:true});}}
}
/** Exact native RITA step over lossless NCHW feature banks. RGB/mask tokens
 * form ONE height-concatenated field: attention and MLP halos cross that seam.
 * Independent image tiles are never substituted for this global network. */
export async function ritaSegmentedNetwork(rgb,mask,iteration,{manifest,pool,budget,getTemporarySession,signal,onProgress,backend='auto',windowBytes=32*MiB,attentionBytes,storage='auto',invariantFeatures}={}){
 requireValue(rgb.channels===3&&mask.channels===1&&rgb.width===mask.width&&rgb.height===mask.height&&rgb.width%32===0&&rgb.height%32===0&&Number.isInteger(iteration)&&iteration>=0&&iteration<256,'Invalid native RITA step.');
 requireValue(manifest.stages?.length===4&&Number.isSafeInteger(windowBytes)&&windowBytes>0,'Invalid RITA segmented manifest/window.');
 requireValue(invariantFeatures===undefined||invariantFeatures instanceof Map,'Invalid RITA invariant feature owner.');
 requireValue(attentionBytes===undefined||Number.isSafeInteger(attentionBytes)&&attentionBytes>0,'Invalid RITA attention window.');
 const owned=new Set(),executions=executionSummary(),executionResources={requestedWorkers:pool.profile?.maxWorkers??null,maximumCpuGranted:0,maximumGpuGranted:0,maximumWasmThreads:0,sessionCacheHits:0,maximumSessionCacheBytes:0,gpuBufferLedgerObserved:false,maximumWorkerGpuBufferBytes:0,maximumWorkerGpuAdmissionBytes:0,unmeasuredGpuTextureStorage:false,queryTransportJobs:0,queryLogicalExecutions:0};
 const make=async(c,h,w)=>{checkAbort(signal);const choice=storage==='auto'?(c*h*w*4>Math.min(budget.limit/12,Math.max(0,budget.limit-budget.total())/4)?'temporary':'memory'):storage,t=await createNeuralTensor(c,h,w,{budget,signal,storage:choice,cooperation:'bounded',getTemporarySession,owner:'rita',label:'rita-feature-bank'});owned.add(t);return t;};
 const drop=async t=>{if(owned.delete(t))await t.dispose();};
 const run=async(name,feeds,workspace,outputBytes,extra={})=>{const {ritaQueryTransport=false,...graphOptions}=extra;const output=await runWithResourceRecovery(({resourceOperation})=>pool.run(name,feeds,{backend,signal,onProgress,...graphOptions,resourceOperation,workspaceBytes:Math.ceil(workspace)+16*MiB,outputBytes}),{budget,signal,owner:'rita',operation:name,onRecovery:onProgress,onReclaim:onProgress});noteNeuralTensorTaskYield(budget);const logical=output.metrics.logicalExecutions??1;for(let i=0;i<logical;i++)executions.add(name,{...output.metrics,milliseconds:output.metrics.milliseconds/logical,reusedInputBytes:(output.metrics.reusedInputBytes??0)/logical,workerReused:i>0||output.metrics.workerReused});if(ritaQueryTransport){executionResources.queryTransportJobs++;executionResources.queryLogicalExecutions+=logical;}const gpuMemory=output.metrics.gpuMemory;if(gpuMemory){executionResources.gpuBufferLedgerObserved=true;executionResources.maximumWorkerGpuBufferBytes=Math.max(executionResources.maximumWorkerGpuBufferBytes,gpuMemory.peakBufferBytes??0);executionResources.maximumWorkerGpuAdmissionBytes=Math.max(executionResources.maximumWorkerGpuAdmissionBytes,gpuMemory.maximumBytes??0);executionResources.unmeasuredGpuTextureStorage||=!!gpuMemory.unmeasuredTextureStorage;}executionResources.sessionCacheHits+=Number(output.metrics.modelCacheHit===true);executionResources.maximumSessionCacheBytes=Math.max(executionResources.maximumSessionCacheBytes,output.metrics.sessionCacheBytes??0);executionResources.maximumCpuGranted=Math.max(executionResources.maximumCpuGranted,output.metrics.cpuGranted??0);executionResources.maximumGpuGranted=Math.max(executionResources.maximumGpuGranted,output.metrics.gpuGranted??0);if(output.metrics.provider==='wasm')executionResources.maximumWasmThreads=Math.max(executionResources.maximumWasmThreads,output.metrics.threads??0);return output;};
 const rowsFor=(t,factor=20)=>Math.max(1,Math.min(t.height,Math.floor(windowBytes/(t.width*t.channels*4*factor))));
 async function writeCore(target,top,rows,data,sourceRows,cropTop=0){
  requireValue(data instanceof Float32Array&&data.length===target.channels*sourceRows*target.width,'RITA graph output geometry differs from its contract.');
  if(rows===sourceRows&&cropTop===0)return target.writeRows(top,rows,data,{signal});
  const release=budget.reserve(target.channels*rows*target.width*4);try{const core=new Float32Array(target.channels*rows*target.width);for(let c=0;c<target.channels;c++)core.set(data.subarray((c*sourceRows+cropTop)*target.width,(c*sourceRows+cropTop+rows)*target.width),c*rows*target.width);await target.writeRows(top,rows,core,{signal});}finally{release();}
 }
 async function patch(input,stage,name,extra={}){
  const {stride,radius,channels}=stage,height=Math.ceil(input.height/stride),width=Math.ceil(input.width/stride),target=await make(channels,height,width),step=Math.max(1,Math.floor(windowBytes/(input.width*Math.max(input.channels,channels)*80)));
  await ritaAdaptiveRows(height,step,async(top,rows)=>{
   checkAbort(signal);const low=top*stride-radius,high=(top+rows-1)*stride+radius+1,start=Math.max(0,low),stop=Math.min(input.height,high),part=await input.readRows(start,stop-start,{signal});let release,output;
   try{const count=input.channels*(high-low)*input.width;release=budget.reserve(count*4);const data=new Float32Array(count);for(let c=0;c<input.channels;c++)data.set(part.data.subarray(c*(stop-start)*input.width,(c+1)*(stop-start)*input.width),(c*(high-low)+start-low)*input.width);output=await run(name,{x:{data,dims:[1,input.channels,high-low,input.width]},...extra},count*4+rows*width*channels*32,rows*width*channels*4);await writeCore(target,top,rows,output.result.result.data,rows);
   }finally{output?.release();release?.();part.release();}
  },{signal,onProgress,operation:name});target.markCold?.();return target;
 }
 async function concatenate(a,b){
  requireValue(a.width===b.width&&a.height===b.height&&a.channels===b.channels,'RITA modalities differ.');const target=await make(a.channels,a.height*2,a.width),step=rowsFor(a,4);
  for(let top=0;top<a.height;top+=step){const rows=Math.min(step,a.height-top);for(const [input,offset]of [[a,0],[b,a.height]]){const part=await input.readRows(top,rows,{signal});try{await target.writeRows(top+offset,rows,part.data,{signal});}finally{part.release();}}}target.markCold?.();return target;
 }
 async function split(input){
  requireValue(input.height%2===0,'RITA combined token height must be even.');const height=input.height/2,a=await make(input.channels,height,input.width),b=await make(input.channels,height,input.width),step=Math.min(height,rowsFor(input,4));
  for(let top=0;top<height;top+=step){const rows=Math.min(step,height-top);for(const [target,offset]of [[a,0],[b,height]]){const part=await input.readRows(top+offset,rows,{signal});try{await target.writeRows(top,rows,part.data,{signal});}finally{part.release();}}}a.markCold?.();b.markCold?.();return [a,b];
 }
 async function local(name,inputs,{halo=0,channels=Object.values(inputs)[0].channels,factor=20}={}){
  const first=Object.values(inputs)[0],target=await make(channels,first.height,first.width),step=rowsFor(first,factor);
  await ritaAdaptiveRows(first.height,step,async(top,rows)=>{const lo=Math.max(0,top-halo),hi=Math.min(first.height,top+rows+halo),parts=[],feeds={};let output;
   try{for(const[key,t]of Object.entries(inputs)){const part=await t.readRows(lo,hi-lo,{signal});parts.push(part);feeds[key]={data:part.data,dims:part.dims};}output=await run(name,feeds,parts.reduce((sum,p)=>sum+p.data.byteLength,0)*factor,channels*(hi-lo)*first.width*4);await writeCore(target,top,rows,output.result.result.data,hi-lo,top-lo);
   }finally{output?.release();for(const p of parts)p.release();}
  },{signal,onProgress,operation:name});target.markCold?.();return target;
 }
 async function attention(input,block){
  const kh=Math.floor(input.height/block.sr),kw=Math.floor(input.width/block.sr),step=Math.max(1,Math.floor(rowsFor(input,8)/block.sr)),keys=kh*kw,channels=input.channels,headDim=channels/block.heads,bankBytes=keys*channels*8,release=budget.reserve(bankBytes);let target;
  try{
   const key=new Float32Array(keys*channels),value=new Float32Array(keys*channels),bankId=crypto.randomUUID();
   // Copy each completed KV window directly into the immutable query inputs.
   // This is the original NCHW-to-heads permutation, with the same Float32
   // assignments; no intermediate tensor bank or storage round trip is needed.
   await ritaAdaptiveRows(kh,step,async(y,rows)=>{const part=await input.readRows(y*block.sr,rows*block.sr,{signal});let output;
    try{output=await run(block.kv,{x:{data:part.data,dims:part.dims}},part.data.byteLength*10,2*channels*rows*kw*4);checkAbort(signal);const packed=output.result.result.data,count=rows*kw;
     requireValue(packed instanceof Float32Array&&packed.length===2*channels*count,'RITA KV graph output geometry differs from its contract.');
     for(let c=0;c<channels;c++){key.set(packed.subarray(c*count,(c+1)*count),c*keys+y*kw);const source=(channels+c)*count,head=Math.floor(c/headDim),dimension=c%headDim;for(let k=0;k<count;k++)value[(head*keys+y*kw+k)*headDim+dimension]=packed[source+k];}
    }finally{output?.release();part.release();}
   },{signal,onProgress,operation:block.kv});
   const historicalAttentionBytes=Math.max(1,Math.min(256*MiB,Math.floor(budget.limit/8))),tokens=input.height*input.width;let effectiveAttentionBytes=attentionBytes??ritaAttentionBytes(budget.limit,{backend,cpuOnly:pool.cpuOnly,gpuDeviceLimits:pool.gpuDeviceLimits}),plan=ritaQueryPlan(block,keys,channels,effectiveAttentionBytes,{backend,cpuOnly:pool.cpuOnly}),forceCpu=false;target=await make(channels,input.height,input.width);let queries=plan.queries,batchSize=Math.max(1,Math.min(16,Math.floor(2*MiB/(channels*Math.min(queries,tokens)*4))));
   for(let offset=0;offset<tokens;){
    checkAbort(signal);const counts=[];let totalCount=0;for(let i=0;i<batchSize&&offset+totalCount<tokens;i++){const count=Math.min(queries,tokens-offset-totalCount);counts.push(count);totalCount+=count;}const maximumCount=counts[0];let part,output;
    try{
     // Only transport/storage windows are grouped. The worker still executes
     // one unchanged graph for each original query count, in the same order.
     part=await input.readTokens(offset,totalCount,{signal});output=await run(plan.name,{x:{data:part.data,dims:part.dims},key:{data:key,dims:[1,block.heads,headDim,keys]},value:{data:value,dims:[1,block.heads,keys,headDim]}},plan.workspaceBytes(maximumCount),part.data.byteLength,{ritaQueryTransport:true,...(forceCpu?{backend:'cpu'}:{}),...(counts.length>1?{queryBatch:{input:'x',output:'result',counts}}:{}),reusableInputs:{key:bankId+'/key',value:bankId+'/value'},gpuWasmWorkspaceBytes:32*MiB+channels*maximumCount*4*20});if(attentionBytes===undefined&&output.metrics.provider==='wasm'&&effectiveAttentionBytes!==historicalAttentionBytes){
      // A provider fallback must never commit CPU results computed with the
      // enlarged GPU GEMM shape. Replan using the
      // historical CPU partition and its ordinary (non split-value) graph.
      // Restart the complete block so its final CPU tail has the same shape;
      // overwrite the existing target rather than allocating another bank.
      const discardedGpuPrefix=offset;offset=0;forceCpu=true;effectiveAttentionBytes=historicalAttentionBytes;plan=ritaQueryPlan(block,keys,channels,effectiveAttentionBytes,{backend:'cpu',cpuOnly:true});queries=plan.queries;batchSize=Math.max(1,Math.min(16,Math.floor(2*MiB/(channels*Math.min(queries,tokens)*4))));onProgress?.({phase:'rita-query-provider-replan',model:plan.name,completed:offset,total:tokens,provider:'wasm',discardedGpuPrefix,uncommittedResultDiscarded:true});continue;
     }await target.writeTokens(offset,totalCount,output.result.result.data,{signal});offset+=totalCount;onProgress?.({phase:'rita-global-attention',model:plan.name,iteration,completed:offset,total:tokens});
    }catch(error){
     if(!['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error.code))throw error;
     if(counts.length>1){batchSize=Math.max(1,Math.floor(counts.length/2));onProgress?.({phase:'rita-query-batch-memory-retry',model:plan.name,iteration,windows:batchSize,queries,completed:offset,total:tokens});}
     else{if(maximumCount===1)throw error;queries=Math.max(1,Math.floor(maximumCount/2));onProgress?.({phase:'rita-query-memory-retry',model:plan.name,iteration,queries,completed:offset,total:tokens});}
    }finally{output?.release();part?.release();}
   }
  }finally{release();}target.markCold?.();return target;
 }
 async function upsample(input,name,scale,halo){
  if(scale===1)return input;const target=await make(64,input.height*scale,input.width*scale),step=rowsFor(input,32);
  await ritaAdaptiveRows(input.height,step,async(top,rows)=>{const lo=Math.max(0,top-halo),hi=Math.min(input.height,top+rows+halo),part=await input.readRows(lo,hi-lo,{signal});let output;
   try{output=await run(name,{x:{data:part.data,dims:part.dims}},part.data.byteLength*64,(hi-lo)*scale*target.width*64*4);await writeCore(target,top*scale,rows*scale,output.result.result.data,(hi-lo)*scale,(top-lo)*scale);}finally{output?.release();part.release();}
  },{signal,onProgress,operation:name});target.markCold?.();return target;
 }
 async function decode(features){
  const branches=[];for(let i=0;i<4;i++){const [x,g]=features[i],stage=manifest.stages[i],fused=await local(stage.fuse,{x,g},{factor:12});branches[i]=await upsample(fused,stage.upFused,2**i,i===1?1:2);if(branches[i]!==fused)await drop(fused);branches[i+4]=await upsample(g,stage.upMask,2**i,i===1?1:2);await drop(x);if(branches[i+4]!==g)await drop(g);}
  const first=branches[0],logits=await make(4,first.height,first.width),step=rowsFor(first,48);
  await ritaAdaptiveRows(first.height,step,async(top,rows)=>{const parts=[],feeds={};let output;try{for(let i=0;i<8;i++){const part=await branches[i].readRows(top,rows,{signal});parts.push(part);feeds['c'+(i+1)]={data:part.data,dims:part.dims};}output=await run(manifest.decode,feeds,rows*first.width*512*16,rows*first.width*16);await logits.writeRows(top,rows,output.result.result.data,{signal});}finally{output?.release();for(const part of parts)part.release();}},{signal,onProgress,operation:manifest.decode});
  for(const t of branches)await drop(t);logits.markCold?.();return logits;
 }
 async function resize(logits){
  const width=rgb.width,height=rgb.height,target=await make(4,height,width),step=Math.max(1,Math.floor(windowBytes/(width*4*32)));
  await ritaAdaptiveRows(height,step,async(top,rows)=>{checkAbort(signal);const sy=y=>f((height===1?0:f(y*f((logits.height-1)/(height-1))))),start=Math.floor(sy(top)),stop=Math.min(logits.height,Math.floor(sy(top+rows-1))+2),part=await logits.readRows(start,stop-start,{signal});let release,output;
   try{release=budget.reserve(rows*width*8);const grid=new Float32Array(rows*width*2);for(let y=0;y<rows;y++){const gy=stop-start===1?0:f(f(f(sy(top+y)-start)*f(2/(stop-start-1)))-1);for(let x=0;x<width;x++){const at=(y*width+x)*2;grid[at]=width===1?0:f(f(x*f(2/(width-1)))-1);grid[at+1]=gy;}}output=await run(manifest.final,{pred:{data:part.data,dims:part.dims},grid:{data:grid,dims:[1,rows,width,2]}},rows*width*4*32,rows*width*16);await target.writeRows(top,rows,output.result.result.data,{signal});}finally{output?.release();release?.();part.release();}
  },{signal,onProgress,operation:manifest.final});target.markCold?.();return target;
 }
 try{
  let image=rgb,previous=mask;const features=[];
  for(let i=0;i<4;i++){
   const stage=manifest.stages[i],extra=i===0?{iteration:{data:BigInt64Array.of(BigInt(iteration)),dims:[1],type:'int64'}}:{};let left;
   if(i===0&&invariantFeatures){
    // Only this projection depends exclusively on the immutable RGB source.
    // Every later image feature already mixes the current feedback mask.
    if(!invariantSources.has(rgb))invariantSources.set(rgb,++invariantSourceSerial);
    const asset=manifest.assets?.[stage.patchImage],cpuOnly=!!pool.cpuOnly,key=JSON.stringify([invariantSources.get(rgb),manifest.checkpointSha256??manifest.checkpoint_sha256??null,stage.patchImage,asset?.sha256??null,asset?.graphTransform??null,rgb.channels,rgb.height,rgb.width,stage.channels,stage.stride,stage.radius,windowBytes,backend,cpuOnly,pool.profile?.maxWorkers??null]);
    left=invariantFeatures.get(key);
    if(!left){left=await patch(image,stage,stage.patchImage);if(cpuOnly===!!pool.cpuOnly){invariantFeatures.set(key,left);owned.delete(left);}}
   }else left=await patch(image,stage,stage.patchImage);
   const right=await patch(previous,stage,stage.patchMask,extra);let combined=await concatenate(left,right);await drop(left);await drop(right);
   for(const block of stage.blocks){let next=await attention(combined,block);await drop(combined);combined=next;next=await local(block.mlp,{x:combined},{halo:1});await drop(combined);combined=next;}
   const normal=await local(stage.norm,{x:combined},{factor:8});await drop(combined);[image,previous]=await split(normal);await drop(normal);features.push([image,previous]);onProgress?.({phase:'rita-encoder-stage',iteration,completed:i+1,total:4});
  }
  const low=await decode(features),logits=await resize(low);await drop(low);checkAbort(signal);
  return {logits,executions:executions.values(),executionResources,async release(){for(const t of [...owned])await drop(t);}};
 }catch(error){for(const t of [...owned])await drop(t);throw error;}
}
