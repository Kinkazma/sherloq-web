import {truforQueryPlan} from './trufor-query-plan.js';
import {createNeuralTensor,neuralChannelStatistics} from './neural-tensor-store.js';
import {executionSummary} from './neural-execution-summary.js';
import {requireValue,checkAbort} from './errors.js';
const MiB=1024**2;
/** Full dual encoder over lossless feature banks. Learned operators execute in
 * the usual neural pool. Only local receptive fields are windowed; attention
 * keys, FRM means/maxima and FFM contexts always span the complete image.
 * Inputs are already native-preprocessed NCHW stores and remain caller-owned.
 */
export async function truforSegmentedBackbone(rgb,npp,{manifest,pool,budget,getTemporarySession,signal,onProgress,backend='auto',windowBytes=32*MiB,attentionBytes=Math.min(256*MiB,Math.floor(budget.limit/8)),storage='auto'}={}){
 requireValue(rgb.channels===3&&npp.channels===3&&rgb.width===npp.width&&rgb.height===npp.height,'TruFor modality shapes differ.');
 requireValue(Number.isSafeInteger(windowBytes)&&windowBytes>0&&Number.isSafeInteger(attentionBytes)&&attentionBytes>0,'Invalid encoder workspace window.');
 const owned=new Set(),executions=executionSummary();
 const make=async(c,h,w)=>{checkAbort(signal);const chosen=storage==='auto'?(c*h*w*4>Math.min(budget.limit/12,(budget.limit-budget.total())/4)?'temporary':'memory'):storage,t=await createNeuralTensor(c,h,w,{budget,signal,storage:chosen,getTemporarySession});owned.add(t);return t;};
 const drop=async t=>{if(owned.delete(t))await t.dispose();};
 const run=async(name,inputs,workspaceBytes,outputBytes,extra={})=>{const output=await pool.run(name,inputs,{backend,signal,onProgress,...extra,workspaceBytes:Math.ceil(workspaceBytes)+16*MiB,outputBytes});executions.add(name,output.metrics);return output;};
 const rowsFor=(tensor,factor=20)=>Math.max(1,Math.min(tensor.height,Math.floor(windowBytes/(tensor.width*tensor.channels*4*factor))));
 async function coreWrite(target,top,rows,source,sourceRows,cropTop){
  requireValue(source.length===target.channels*sourceRows*target.width,'Encoder output shape mismatch.');
  if(sourceRows===rows&&cropTop===0)return target.writeRows(top,rows,source,{signal});
  const size=target.channels*rows*target.width,release=budget.reserve(size*4);
  try{const data=new Float32Array(size);for(let c=0;c<target.channels;c++)data.set(source.subarray((c*sourceRows+cropTop)*target.width,(c*sourceRows+cropTop+rows)*target.width),c*rows*target.width);await target.writeRows(top,rows,data,{signal});}finally{release();}
 }
 async function patch(input,stage,name){
  const {stride,radius,channels}=stage,h=Math.ceil(input.height/stride),w=Math.ceil(input.width/stride),target=await make(channels,h,w),step=Math.max(1,Math.floor(windowBytes/(input.width*Math.max(input.channels,channels)*4*20)));
  for(let top=0;top<h;top+=step){const rows=Math.min(step,h-top),lo=top*stride-radius,hi=(top+rows-1)*stride+radius+1,start=Math.max(0,lo),stop=Math.min(input.height,hi),part=await input.readRows(start,stop-start,{signal});let release,output;
   try{const count=input.channels*(hi-lo)*input.width;release=budget.reserve(count*4);const data=new Float32Array(count);for(let c=0;c<input.channels;c++)data.set(part.data.subarray(c*(stop-start)*input.width,(c+1)*(stop-start)*input.width),(c*(hi-lo)+start-lo)*input.width);
    output=await run(name,{x:{data,dims:[1,input.channels,hi-lo,input.width]}},count*4+rows*w*channels*32,rows*w*channels*4);await coreWrite(target,top,rows,output.result.result.data,rows,0);
   }finally{output?.release();release?.();part.release();}
  }return target;
 }
 async function local(name,inputs,{halo=0,extra={},outputs=['result'],factor=20}={}){
  const first=Object.values(inputs)[0],targets=[],step=rowsFor(first,factor);for(const name of outputs)targets.push(await make(first.channels,first.height,first.width));
  for(let top=0;top<first.height;top+=step){const rows=Math.min(step,first.height-top),lo=Math.max(0,top-halo),hi=Math.min(first.height,top+rows+halo),parts=[],feeds={...extra};let output;
   try{for(const [key,tensor]of Object.entries(inputs)){const part=await tensor.readRows(lo,hi-lo,{signal});parts.push(part);feeds[key]={data:part.data,dims:part.dims};}
    const bytes=first.channels*(hi-lo)*first.width*4;output=await run(name,feeds,bytes*factor,bytes*outputs.length);for(let i=0;i<outputs.length;i++)await coreWrite(targets[i],top,rows,output.result[outputs[i]].data,hi-lo,top-lo);
   }finally{output?.release();for(const part of parts)part.release();}
  }return targets;
 }
 async function attention(input,block){
  const sr=block.sr,kh=Math.floor(input.height/sr),kw=Math.floor(input.width/sr),bank=await make(input.channels*2,kh,kw),step=Math.max(1,Math.floor(rowsFor(input,8)/sr));
  for(let y=0;y<kh;y+=step){const rows=Math.min(step,kh-y),part=await input.readRows(y*sr,rows*sr,{signal});let output;
   try{output=await run(block.kv,{x:{data:part.data,dims:part.dims}},part.data.byteLength*10,2*input.channels*rows*kw*4);await bank.writeRows(y,rows,output.result.result.data,{signal});}finally{output?.release();part.release();}
  }
  const keys=kh*kw,channels=input.channels,headDim=channels/block.heads,bankBytes=keys*channels*8,releaseBank=budget.reserve(bankBytes),bankIdentity=crypto.randomUUID();
  let target;try{const keyData=new Float32Array(channels*keys),valueData=new Float32Array(channels*keys);await bank.readInto(keyData,0,{signal});
   const releaseRow=budget.reserve(keys*4);try{const row=new Float32Array(keys);for(let c=0;c<channels;c++){await bank.readInto(row,(channels+c)*keys,{signal});const head=Math.floor(c/headDim),within=c%headDim;for(let k=0;k<keys;k++)valueData[(head*keys+k)*headDim+within]=row[k];}}finally{releaseRow();}
   const allKey={data:keyData,dims:[1,block.heads,headDim,keys]},allValue={data:valueData,dims:[1,block.heads,keys,headDim]},tokens=input.height*input.width,plan=truforQueryPlan(block,keys,channels,attentionBytes,{backend,cpuOnly:pool.cpuOnly}),initialQueries=plan.queries;target=await make(input.channels,input.height,input.width);
  let queries=initialQueries;
  // Each score tensor stays below64MiB at the default bound (portable128MiB
  // storage binding). Retry smaller REAL query windows only after memory failure.
  for(let offset=0;offset<tokens;){const count=Math.min(queries,tokens-offset);let part,output;
    try{part=await input.readTokens(offset,count,{signal});output=await run(plan.name,{x:{data:part.data,dims:part.dims},key:allKey,value:allValue},plan.workspaceBytes(count),part.data.byteLength,{onProgress:e=>{if(e.phase!=='inference')onProgress?.(e);},reusableInputs:{key:bankIdentity+'/key',value:bankIdentity+'/value'},gpuWasmWorkspaceBytes:32*MiB+part.data.byteLength*20});await target.writeTokens(offset,count,output.result.result.data,{signal});if(offset===0||offset+count===tokens||Math.floor((offset+count)*1000/tokens)!==Math.floor(offset*1000/tokens))onProgress?.({phase:'trufor-global-attention',model:plan.name,completed:offset+count,total:tokens});offset+=count;}catch(error){if(!['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error.code)||count===1)throw error;queries=Math.max(1,Math.floor(count/2));onProgress?.({phase:'trufor-query-memory-retry',model:plan.name,queries,completed:offset,total:tokens});}finally{output?.release();part?.release();}
   }
  }finally{releaseBank();await drop(bank);}return target;
 }
 async function stream(input,stage,description){
  let x=await patch(input,stage,description.patch);
  for(const block of description.blocks){let next=await attention(x,block);await drop(x);x=next;[next]=await local(block.mlp,{x},{halo:1});await drop(x);x=next;}
  const [normal]=await local(description.norm,{x},{factor:8});await drop(x);return normal;
 }
 async function rectify(a,b,stage){
  let left,right,output,release;try{
   left=await neuralChannelStatistics(a,{budget,signal,windowBytes});right=await neuralChannelStatistics(b,{budget,signal,windowBytes});release=budget.reserve(a.channels*16);const stats=new Float32Array(a.channels*4);stats.set(left.mean);stats.set(right.mean,a.channels);stats.set(left.max,a.channels*2);stats.set(right.max,a.channels*3);
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
   const [aa]=await local(stage.fusion[0].apply,{x:a},{extra:{context:{data:bc.data,dims:bc.dims}},factor:16});
   const [bb]=await local(stage.fusion[1].apply,{x:b},{extra:{context:{data:ac.data,dims:ac.dims}},factor:16});
   const [fused]=await local(stage.channel,{a:aa,b:bb},{halo:1,factor:16});await drop(aa);await drop(bb);return fused;
  }finally{ac?.release();bc?.release();}
 }
 try{
  let a=rgb,b=npp;const features=[];
  for(let i=0;i<manifest.stages.length;i++){
   const stage=manifest.stages[i],left=await stream(a,stage,stage.streams[0]),right=await stream(b,stage,stage.streams[1]);await drop(a);await drop(b);
   [a,b]=await rectify(left,right,stage);await drop(left);await drop(right);features.push(await fusion(a,b,stage));onProgress?.({phase:'trufor-encoder-stage',completed:i+1,total:manifest.stages.length});
  }await drop(a);await drop(b);checkAbort(signal);
  return {features,executions:executions.values(),async release(){for(const t of [...owned])await drop(t);}};
 }catch(e){for(const t of [...owned])await drop(t);throw e;}
}
