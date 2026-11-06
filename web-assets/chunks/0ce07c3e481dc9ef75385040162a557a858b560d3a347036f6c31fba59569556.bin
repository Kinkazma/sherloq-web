import "../../runtime-context.js?v=0.33.0";
import {cropFor,sampleGrid} from './trufor-mini-geometry.js';
import {truforQueryPlan} from './trufor-query-plan.js';
import {createNeuralTensor,neuralChannelStatistics,noteNeuralTensorTaskYield} from './neural-tensor-store.js';
import {executionSummary} from './neural-execution-summary.js';
import {requireValue,checkAbort,createCooperator} from './errors.js';
const MiB=1024**2;
/** Independently retire every partially allocated local output before a
 * fallback. A refused acknowledgement remains visible and retryable.
 */
export async function retireMiniPartialTargets(targets,drop){
 const outcomes=await Promise.allSettled(targets.map(target=>Promise.resolve().then(()=>drop(target)))),failure=outcomes.find(value=>value.status==='rejected');
 return failure?{failed:true,reason:failure.reason}:{failed:false};
}
export function miniFusionMemoryFallbackAllowed(error,{signal,cleanupConfirmed=true}={}){
 if(!cleanupConfirmed||!['MEMORY_LIMIT','MEMORY_ALLOCATION','GPU_OUT_OF_MEMORY'].includes(error?.code))return false;
 checkAbort(signal);return true;
}
/** Capture the same ordered float64 channel sum/float32 maximum while the
 * final normalization readback is already live. No second feature-bank copy.
 */
export function createMiniChannelStatistics(channels,{budget}={}){
 requireValue(Number.isSafeInteger(channels)&&channels>0,'Invalid Mini channel statistics.');
 const lease=budget.reserve(channels*20);let closed=false;
 try{
  const sum=new Float64Array(channels),max=new Float32Array(channels).fill(-Infinity),mean=new Float32Array(channels);let count=0;
  return {mean,max,async add(data,{signal}={}){
   requireValue(!closed&&data instanceof Float32Array&&data.length>0&&data.length%channels===0,'Invalid Mini channel readback.');
   const n=data.length/channels,cooperate=createCooperator(signal);count+=n;requireValue(Number.isSafeInteger(count),'Mini statistics population exceeds safe range.');
   for(let c=0;c<channels;c++){if(c%16===0)await cooperate();for(let i=0;i<n;i++){const value=data[c*n+i];requireValue(Number.isFinite(value),'Nonfinite Mini feature.');sum[c]+=value;max[c]=Math.max(max[c],value);}}checkAbort(signal);
  },finish(expectedCount){requireValue(!closed&&Number.isSafeInteger(expectedCount)&&expectedCount>0&&count===expectedCount,'Incomplete Mini channel statistics.');for(let c=0;c<channels;c++)mean[c]=sum[c]/count;return this;},release(){if(!closed){closed=true;lease();}}};
 }catch(error){lease();throw error;}
}
/** Frozen Mini dual encoder over lossless feature banks. Learned operators execute in
 * the usual neural pool. Only local receptive fields are windowed; all attention keys, FRM statistics and FFM contexts span the complete image.
 * Only the noise-query averaging documented in the frozen Mini is approximate.
 * Inputs are already native-preprocessed NCHW stores and remain caller-owned.
 */
export async function truforMiniBackbone(rgb,npp,{manifest,pool,budget,getTemporarySession,signal,onProgress,backend='auto',windowBytes=32*MiB,attentionBytes=Math.min(256*MiB,Math.floor(budget.limit/8)),storage='auto',parallelStreams=true}={}){
 requireValue(rgb.channels===3&&npp.channels===3&&rgb.width===npp.width&&rgb.height===npp.height,'TruFor modality shapes differ.');
 requireValue(Number.isSafeInteger(windowBytes)&&windowBytes>0&&Number.isSafeInteger(attentionBytes)&&attentionBytes>0,'Invalid encoder workspace window.');
 requireValue(typeof parallelStreams==='boolean','Invalid Mini stream scheduling policy.');
 const upstreamSignal=signal,controller=new AbortController(),abort=()=>controller.abort();upstreamSignal?.addEventListener('abort',abort,{once:true});if(upstreamSignal?.aborted)abort();signal=controller.signal;
 const owned=new Set(),statisticsByTensor=new Map(),failedLocalRetirements=new WeakSet(),executions=executionSummary();
 const make=async(c,h,w)=>{checkAbort(signal);const chosen=storage==='auto'?(c*h*w*4>Math.min(budget.limit/12,(budget.limit-budget.total())/4)?'temporary':'memory'):storage,t=await createNeuralTensor(c,h,w,{budget,signal,storage:chosen,cooperation:'bounded',getTemporarySession});owned.add(t);return t;};
 const drop=async t=>{if(owned.has(t)){await t.dispose();owned.delete(t);statisticsByTensor.get(t)?.release();statisticsByTensor.delete(t);}};
 const releaseAll=async()=>{const settled=await Promise.allSettled([...owned].map(drop)),failed=settled.find(value=>value.status==='rejected');if(failed)throw failed.reason;};
 const run=async(name,inputs,workspaceBytes,outputBytes,extra={})=>{const output=await pool.run(name,inputs,{backend,signal,onProgress,...extra,workspaceBytes:Math.ceil(workspaceBytes)+16*MiB,outputBytes});noteNeuralTensorTaskYield(budget);executions.add(name,output.metrics);return output;};
 const rowsFor=(tensor,factor=20)=>Math.max(1,Math.min(tensor.height,Math.floor(windowBytes/(tensor.width*tensor.channels*4*factor))));
 async function coreWrite(target,top,rows,source,sourceRows,cropTop){
  requireValue(source.length===target.channels*sourceRows*target.width,'Encoder output shape mismatch.');
  if(sourceRows===rows&&cropTop===0)return target.writeRows(top,rows,source,{signal});
  const size=target.channels*rows*target.width,release=budget.reserve(size*4);
  try{const data=new Float32Array(size);for(let c=0;c<target.channels;c++)data.set(source.subarray((c*sourceRows+cropTop)*target.width,(c*sourceRows+cropTop+rows)*target.width),c*rows*target.width);await target.writeRows(top,rows,data,{signal});}finally{release();}
 }
 async function patch(input,stage,name){
  const {stride,radius,channels}=stage,h=Math.ceil(input.height/stride),w=Math.ceil(input.width/stride),target=await make(channels,h,w);
  // Bound the actual patch workspace in output rows. A stride-four RGB
  // patch reads three input channels, rather than 64 channels at full input
  // width. Account for its fixed halo and retain the same window byte limit.
  const haloBytes=input.width*input.channels*4*(2*radius+1-stride),bytesPerRow=input.width*input.channels*4*stride+w*channels*32,step=Math.max(1,Math.min(h,Math.floor(Math.max(0,windowBytes-haloBytes)/bytesPerRow)));
  for(let top=0;top<h;top+=step){const rows=Math.min(step,h-top),lo=top*stride-radius,hi=(top+rows-1)*stride+radius+1,start=Math.max(0,lo),stop=Math.min(input.height,hi),part=await input.readRows(start,stop-start,{signal});let release,output;
   try{const count=input.channels*(hi-lo)*input.width;release=budget.reserve(count*4);const data=new Float32Array(count);for(let c=0;c<input.channels;c++)data.set(part.data.subarray(c*(stop-start)*input.width,(c+1)*(stop-start)*input.width),(c*(hi-lo)+start-lo)*input.width);
    output=await run(name,{x:{data,dims:[1,input.channels,hi-lo,input.width]}},count*4+rows*w*channels*32,rows*w*channels*4);await coreWrite(target,top,rows,output.result.result.data,rows,0);
   }finally{output?.release();release?.();part.release();}
  }return target;
 }
 async function local(name,inputs,{halo=0,extra={},outputs=['result'],factor=20,channels,captureStatistics=false,reusableInputs}={}){
  const first=Object.values(inputs)[0],targets=[],step=rowsFor(first,factor);
  try{for(const name of outputs)targets.push(await make(channels??first.channels,first.height,first.width));
  let statistics;if(captureStatistics){requireValue(halo===0&&outputs.length===1&&(channels===undefined||channels===first.channels),'Mini statistics require an unchanged pointwise normalization grid.');statistics=createMiniChannelStatistics(first.channels,{budget});statisticsByTensor.set(targets[0],statistics);}
  for(let top=0;top<first.height;top+=step){const rows=Math.min(step,first.height-top),lo=Math.max(0,top-halo),hi=Math.min(first.height,top+rows+halo),parts=[],feeds={...extra};let output;
   try{for(const [key,tensor]of Object.entries(inputs)){const part=await tensor.readRows(lo,hi-lo,{signal});parts.push(part);feeds[key]={data:part.data,dims:part.dims};}
    const bytes=first.channels*(hi-lo)*first.width*4,outputBytes=(channels??first.channels)*(hi-lo)*first.width*4*outputs.length;output=await run(name,feeds,bytes*factor,outputBytes,reusableInputs?{reusableInputs}:{});for(let i=0;i<outputs.length;i++)await coreWrite(targets[i],top,rows,output.result[outputs[i]].data,hi-lo,top-lo);if(statistics)await statistics.add(output.result[outputs[0]].data,{signal});
   }finally{output?.release();for(const part of parts)part.release();}
  }statistics?.finish(first.height*first.width);return targets;
  }catch(error){
   const cleanup=await retireMiniPartialTargets(targets,drop);
   if(cleanup.failed&&error&&typeof error==='object'){
    failedLocalRetirements.add(error);if(Object.isExtensible(error))error.cleanupError=cleanup.reason;
   }
   throw error;
  }
 }
 async function poolQueries(input,mode){
  const global=mode==='global',stride=global?null:Number(mode.slice(4));requireValue(global||stride===2,'Unknown frozen Mini attention policy.');
  const h=global?1:Math.ceil(input.height/stride),w=global?1:Math.ceil(input.width/stride),target=await make(input.channels,h,w);
  if(global){const release=budget.reserve(input.channels*12);try{const sum=new Float64Array(input.channels),data=new Float32Array(input.channels),step=rowsFor(input,4);
   for(let y=0;y<input.height;y+=step){const count=Math.min(step,input.height-y),part=await input.readRows(y,count,{signal});try{const n=count*input.width;for(let c=0;c<input.channels;c++)for(let j=0;j<n;j++)sum[c]+=part.data[c*n+j];}finally{part.release();}}
   for(let c=0;c<input.channels;c++)data[c]=sum[c]/(input.width*input.height);await target.writeRows(0,1,data,{signal});
  }finally{release();}}else for(let y=0;y<h;y++){const count=Math.min(stride,input.height-y*stride),part=await input.readRows(y*stride,count,{signal}),release=budget.reserve(input.channels*w*4);try{const data=new Float32Array(input.channels*w);
   for(let c=0;c<input.channels;c++)for(let x=0;x<w;x++){let sum=0;const columns=Math.min(stride,input.width-x*stride);for(let yy=0;yy<count;yy++)for(let xx=0;xx<columns;xx++)sum=Math.fround(sum+part.data[(c*count+yy)*input.width+x*stride+xx]);data[c*w+x]=sum/(count*columns);}await target.writeRows(y,1,data,{signal});
  }finally{release();part.release();}}return target;
 }
 async function expandMessage(input,message,joined){
  if(joined)requireValue(joined.halo===1&&typeof joined.name==='string'&&manifest.assets[joined.name],'Invalid joined Mini message/MLP operator.');
  const halo=joined?1:0,factor=joined?24:12,target=await make(input.channels,input.height,input.width),step=joined?Math.max(1,Math.min(input.height,Math.floor(windowBytes/(input.channels*input.width*4*factor))-2*halo)):rowsFor(input,factor);
  for(let top=0;top<input.height;top+=step){const rows=Math.min(step,input.height-top),lo=Math.max(0,top-halo),hi=Math.min(input.height,top+rows+halo),{start,stop}=cropFor(message.height,input.height,lo,hi-lo),x=await input.readRows(lo,hi-lo,{signal});let part,grid,output;
   try{part=await message.readRows(start,stop-start,{signal});grid=sampleGrid(message.height,message.width,input.height,input.width,lo,hi-lo,start,stop,budget);output=await run(joined?.name??manifest.messageAdd,{x:{data:x.data,dims:x.dims},message:{data:part.data,dims:part.dims},grid:{data:grid.data,dims:grid.dims}},x.data.byteLength*factor,x.data.byteLength);await coreWrite(target,top,rows,output.result.result.data,hi-lo,top-lo);}finally{output?.release();grid?.release();part?.release();x.release();}
  }return target;
 }
 async function attention(input,block){
  const approximate=block.approximation&&block.approximation!=='exact',shared=Boolean(approximate&&block.querySource);let normalized,queryInput=input;
  if(approximate){
   if(shared){
    requireValue(block.querySource.output==='query_source'&&block.querySource.mode===block.approximation&&['pool2','global'].includes(block.approximation),'Invalid shared Mini query source.');
    const global=block.approximation==='global';queryInput=await make(input.channels,global?1:Math.ceil(input.height/2),global?1:Math.ceil(input.width/2));
   }else{[normalized]=await local(block.queryNorm,{x:input},{factor:8});queryInput=await poolQueries(normalized,block.approximation);await drop(normalized);normalized=null;}
  }
  const sr=block.sr,kh=Math.floor(input.height/sr),kw=Math.floor(input.width/sr),bank=await make(input.channels*2,kh,kw),step=Math.max(1,Math.floor(rowsFor(input,8)/sr));
  let querySum,releaseSum;
  try{
   if(shared&&block.approximation==='global'){releaseSum=budget.reserve(input.channels*12);querySum=new Float64Array(input.channels);}
   for(let y=0;y<kh;y+=step){
    const rows=Math.min(step,kh-y),last=y+rows===kh,inputRows=rows*sr+(shared&&last?input.height-kh*sr:0),part=await input.readRows(y*sr,inputRows,{signal});let output;
    try{
     const queryRows=shared?(querySum?1:Math.ceil(inputRows/2)):0,queryWidth=shared?queryInput.width:0,queryBytes=input.channels*queryRows*queryWidth*4;
     output=await run(block.kv,{x:{data:part.data,dims:part.dims}},part.data.byteLength*10+queryBytes,2*input.channels*rows*kw*4+queryBytes);await bank.writeRows(y,rows,output.result.result.data,{signal});
     if(shared){
      const source=output.result.query_source?.data;requireValue(source instanceof Float32Array&&source.length===input.channels*queryRows*queryWidth,'Invalid shared Mini query payload.');
      if(querySum){for(let c=0;c<input.channels;c++)querySum[c]+=source[c];}
      else await queryInput.writeRows(y*sr/2,queryRows,source,{signal});
     }
    }finally{output?.release();part.release();}
   }
   if(querySum){const mean=new Float32Array(input.channels),count=input.height*input.width;for(let c=0;c<input.channels;c++)mean[c]=querySum[c]/count;await queryInput.writeRows(0,1,mean,{signal});}
  }finally{releaseSum?.();}
  const keys=kh*kw,channels=input.channels,headDim=channels/block.heads,bankBytes=keys*channels*8,releaseBank=budget.reserve(bankBytes),bankIdentity=crypto.randomUUID();
  let target,mlpApplied=false;try{const keyData=new Float32Array(channels*keys),valueData=new Float32Array(channels*keys);await bank.readInto(keyData,0,{signal});
   const releaseRow=budget.reserve(keys*4);try{const row=new Float32Array(keys);for(let c=0;c<channels;c++){await bank.readInto(row,(channels+c)*keys,{signal});const head=Math.floor(c/headDim),within=c%headDim;for(let k=0;k<keys;k++)valueData[(head*keys+k)*headDim+within]=row[k];}}finally{releaseRow();}
   const allKey={data:keyData,dims:[1,block.heads,headDim,keys]},allValue={data:valueData,dims:[1,block.heads,keys,headDim]},tokens=queryInput.height*queryInput.width,plan=truforQueryPlan(block,keys,channels,attentionBytes,{backend,cpuOnly:pool.cpuOnly}),initialQueries=plan.queries;
   const joined=!approximate&&block.queryMlp;
   if(joined)requireValue(joined.halo===1&&typeof joined.name==='string'&&manifest.assets[joined.name],'Invalid joined Mini query/MLP operator.');
   const joinedRows=joined?Math.min(Math.floor(plan.queries/input.width),Math.floor(windowBytes/(input.width*channels*4*24))):0;
   if(joined&&!plan.splitValue&&joinedRows>=Math.min(input.height,3)){
    target=await make(channels,input.height,input.width);let rowStep=joinedRows>=input.height?input.height:Math.max(1,joinedRows-2),fallback=false;
    for(let top=0;top<input.height;){
     // Native image edges need only one halo row. Spend the same admitted
     // source-row capacity on useful output instead of a fictitious outer halo.
     checkAbort(signal);const lo=Math.max(0,top-1),hi=Math.min(input.height,lo+rowStep+2),rows=hi-top-(hi<input.height?1:0),count=(hi-lo)*input.width;let part,output;
     try{
      part=await input.readRows(lo,hi-lo,{signal});
      output=await run(joined.name,{x:{data:part.data,dims:part.dims},key:allKey,value:allValue},plan.workspaceBytes(count)+part.data.byteLength*24,part.data.byteLength,{onProgress:e=>{if(e.phase!=='inference')onProgress?.(e);},reusableInputs:{key:bankIdentity+'/key',value:bankIdentity+'/value'},gpuWasmWorkspaceBytes:32*MiB+part.data.byteLength*28});
      await coreWrite(target,top,rows,output.result.result.data,hi-lo,top-lo);top+=rows;onProgress?.({phase:'trufor-global-attention',model:joined.name,completed:top*input.width,total:tokens});
     }catch(error){
      if(!['MEMORY_LIMIT','MEMORY_ALLOCATION','GPU_OUT_OF_MEMORY'].includes(error.code))throw error;
      if(rowStep>1){rowStep=Math.max(1,Math.floor(rowStep/2));onProgress?.({phase:'trufor-query-memory-retry',model:joined.name,rows:rowStep,completed:top*input.width,total:tokens});}
      else{fallback=true;onProgress?.({phase:'trufor-mini-query-mlp-fallback',model:joined.name,reason:error.code});break;}
     }finally{output?.release();part?.release();}
    }
    if(fallback){await drop(target);target=null;}else mlpApplied=true;
   }
   if(!target){target=await make(input.channels,queryInput.height,queryInput.width);
  let queries=initialQueries;
  // Each score tensor stays below64MiB at the default bound (portable128MiB
  // storage binding). Retry smaller REAL query windows only after memory failure.
  for(let offset=0;offset<tokens;){const count=Math.min(queries,tokens-offset);let part,output;
    try{part=await queryInput.readTokens(offset,count,{signal});output=await run(plan.name,{x:{data:part.data,dims:part.dims},key:allKey,value:allValue},plan.workspaceBytes(count),part.data.byteLength,{onProgress:e=>{if(e.phase!=='inference')onProgress?.(e);},reusableInputs:{key:bankIdentity+'/key',value:bankIdentity+'/value'},gpuWasmWorkspaceBytes:32*MiB+part.data.byteLength*20});await target.writeTokens(offset,count,output.result.result.data,{signal});if(offset===0||offset+count===tokens||Math.floor((offset+count)*1000/tokens)!==Math.floor(offset*1000/tokens))onProgress?.({phase:'trufor-global-attention',model:plan.name,completed:offset+count,total:tokens});offset+=count;}catch(error){if(!['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error.code)||count===1)throw error;queries=Math.max(1,Math.floor(count/2));onProgress?.({phase:'trufor-query-memory-retry',model:plan.name,queries,completed:offset,total:tokens});}finally{output?.release();part?.release();}
   }}
  }finally{releaseBank();await drop(bank);}if(approximate){const expanded=await expandMessage(input,target,block.messageMlp);await drop(target);await drop(queryInput);return {tensor:expanded,mlpApplied:Boolean(block.messageMlp)};}return {tensor:target,mlpApplied};
 }
 async function stream(input,stage,description){
  let x=await patch(input,stage,description.patch);
  for(const block of description.blocks){const attended=await attention(x,block);let next=attended.tensor;await drop(x);x=next;if(!attended.mlpApplied){[next]=await local(block.mlp,{x},{halo:1});await drop(x);x=next;}}
  const [normal]=await local(description.norm,{x},{factor:8,captureStatistics:true});await drop(x);return normal;
 }
 async function rectify(a,b,stage){
  let left,right,output,release;try{
   left=statisticsByTensor.get(a);if(left)statisticsByTensor.delete(a);else left=await neuralChannelStatistics(a,{budget,signal,windowBytes});right=statisticsByTensor.get(b);if(right)statisticsByTensor.delete(b);else right=await neuralChannelStatistics(b,{budget,signal,windowBytes});release=budget.reserve(a.channels*16);const stats=new Float32Array(a.channels*4);stats.set(left.mean);stats.set(right.mean,a.channels);stats.set(left.max,a.channels*2);stats.set(right.max,a.channels*3);
   output=await run(stage.rectifyWeights,{stats:{data:stats,dims:[1,a.channels*4]}},a.channels*64,a.channels*8);
   return await local(stage.rectify,{a,b},{outputs:['left','right'],extra:{channel:output.result.result},factor:12});
  }finally{output?.release();release?.();left?.release();right?.release();}
 }
 async function context(u,description,stage){
  const d=u.channels/stage.fusionHeads,n=stage.fusionHeads*d*d,release=budget.reserve(n*12),sum=new Float64Array(n),step=rowsFor(u,8);let data;
  try{
   for(let y=0;y<u.height;y+=step){const part=await u.readRows(y,Math.min(step,u.height-y),{signal});let output;try{output=await run(description.context,{x:{data:part.data,dims:part.dims}},part.data.byteLength*16+n*8,n*4);for(let i=0;i<n;i++)sum[i]+=output.result.result.data[i];}finally{output?.release();part.release();}}
   data=new Float32Array(n);for(let h=0;h<stage.fusionHeads;h++)for(let j=0;j<d;j++){let max=-Infinity;for(let i=0;i<d;i++)max=Math.max(max,Math.fround(sum[(h*d+i)*d+j]*stage.fusionScale));let total=0;for(let i=0;i<d;i++)total+=Math.exp(Math.fround(sum[(h*d+i)*d+j]*stage.fusionScale)-max);for(let i=0;i<d;i++)data[(h*d+i)*d+j]=Math.exp(Math.fround(sum[(h*d+i)*d+j]*stage.fusionScale)-max)/total;}
   return {data,dims:[1,stage.fusionHeads,d,d],release};
  }catch(e){release();throw e;}
 }
 async function fusion(a,b,stage){
  let ac,bc;
  try{
   // Recompute pointwise channel projections in each pass, instead of retaining
   // four full feature banks solely to reuse this inexpensive local operation.
   ac=await context(a,stage.fusion[0],stage);bc=await context(b,stage.fusion[1],stage);
   if(stage.fusionJoint){
    const joined=stage.fusionJoint;requireValue(joined.halo===1&&typeof joined.name==='string'&&manifest.assets[joined.name]&&stage.fusionOutputChannels===8,'Invalid joined Mini fusion operator.');
    // Both contexts still cover the complete native feature grid. The joined
    // local graph exchanges them between the two branches, then immediately
    // emits the existing eight projected channels. One halo preserves its
    // depthwise 3x3 operator without two C-channel intermediate banks.
    try{
     const identity=crypto.randomUUID(),[fused]=await local(joined.name,{a,b},{halo:1,extra:{contexta:{data:ac.data,dims:ac.dims},contextb:{data:bc.data,dims:bc.dims}},factor:32,channels:8,reusableInputs:{contexta:identity+'/a',contextb:identity+'/b'}});
     return fused;
    }catch(error){
     if(!miniFusionMemoryFallbackAllowed(error,{signal,cleanupConfirmed:!failedLocalRetirements.has(error)}))throw error;
     onProgress?.({phase:'trufor-mini-fusion-fallback',model:joined.name,reason:error.code});checkAbort(signal);
     // local() acknowledged retirement of its partial eight-channel output.
     // Reuse the same complete-image contexts and untouched native inputs.
    }
   }
   const [aa]=await local(stage.fusion[0].apply,{x:a},{extra:{context:{data:bc.data,dims:bc.dims}},factor:16});
   const [bb]=await local(stage.fusion[1].apply,{x:b},{extra:{context:{data:ac.data,dims:ac.dims}},factor:16});
   const [fused]=await local(stage.channel,{a:aa,b:bb},{halo:1,factor:16,channels:stage.fusionOutputChannels});await drop(aa);await drop(bb);return fused;
  }finally{ac?.release();bc?.release();}
 }
 try{
  let a=rgb,b=npp;const features=[];
  for(let i=0;i<manifest.stages.length;i++){
   const stage=manifest.stages[i],nextBankBytes=Math.ceil(a.height/stage.stride)*Math.ceil(a.width/stage.stride)*stage.channels*4;
   // Branches have no dependency before FRM. Under a small remaining budget
   // keep the serial path; otherwise the normal broker still finances every
   // job, worker and tensor against the unchanged global limits.
   const concurrent=parallelStreams&&pool.profile.maxWorkers>=2&&budget.limit-budget.total()>=512*MiB+2*windowBytes+8*nextBankBytes;
   let left,right;
   if(concurrent){
    let failed=false,primary;const runStream=async(input,description)=>{try{return await stream(input,stage,description);}catch(error){if(!failed){failed=true;primary=error;}controller.abort();throw error;}};
    const outcomes=await Promise.allSettled([runStream(a,stage.streams[0]),runStream(b,stage.streams[1])]);if(failed)throw primary;
    [left,right]=outcomes.map(value=>value.value);
   }else{left=await stream(a,stage,stage.streams[0]);right=await stream(b,stage,stage.streams[1]);}
   await drop(a);await drop(b);
   [a,b]=await rectify(left,right,stage);await drop(left);await drop(right);features.push(await fusion(a,b,stage));onProgress?.({phase:'trufor-encoder-stage',completed:i+1,total:manifest.stages.length});
  }await drop(a);await drop(b);checkAbort(signal);
  return {features,executions:executions.values(),release:releaseAll};
 }catch(e){try{await releaseAll();}catch(cleanup){if(e&&typeof e==='object'&&Object.isExtensible(e))e.cleanupError=cleanup;}throw e;}finally{upstreamSignal?.removeEventListener('abort',abort);}
}
