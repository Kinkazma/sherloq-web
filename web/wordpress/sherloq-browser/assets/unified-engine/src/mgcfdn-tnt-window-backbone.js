import "../../runtime-context.js?v=0.25.0";
import nativeMathFactory from'../vendor/segmentation/tnt-math.js';
import{validateTntBackbone}from'../experiments/segmentation/tnt-backbone.js';
import{createTntWindowLinearCpu}from'./mgcfdn-tnt-window-linear-cpu.js';
import{createTntWindowGpu}from'./mgcfdn-tnt-window-gpu.js';
import{createTntWindowMath,TNT_NATIVE_MATH_HEAP}from'./mgcfdn-tnt-window-math.js';
import{requireValue,checkAbort,controlCheckpoint,EngineError}from'./errors.js';
import{retireCompositeOwners}from'./composite-owner-release.js';
const STAGING=96*1024**2;
// Conservative named JS liveness bounds, separate from the unchanged native
// math/GPU64MiB and staging96MiB baseline. Pool outputs/copies/workers receive
// their own original Budget credits. No M-dependent native hardcap is raised.
export function planTntWindowBackboneMemory(contextCells){
 requireValue(Number.isSafeInteger(contextCells)&&contextCells>=256&&contextCells%256===0&&contextCells+1<=4096,'TNT contextual bank exceeds native dimension limits');
 const M=contextCells,T=M+1,F=M/256,inner=M*640,outer=T*640,rgba=F*3*256**2;
 const phaseFloats={patchAndInitialProjection:rgba+8*inner+2*outer+257*640+16*40,
  innerAttention:rgba+12*inner+outer+2*M*1024,
  innerMlp:rgba+16*inner+outer,
  outerAttention:rgba+inner+8*outer+4*T*64+2*T*T,
  outerMlp:rgba+inner+16*outer,
  finalNormAndLayout:rgba+inner+4*outer+2*inner};
 const phaseBytes=Object.freeze(Object.fromEntries(Object.entries(phaseFloats).map(([k,v])=>[k,v*4]))),liveUpperBytes=Math.max(...Object.values(phaseBytes)),stagingBytes=Math.max(STAGING,liveUpperBytes),outputBytes=M*640*4;
 return Object.freeze({contextCells:M,outerCells:T,contexts:F,mathHeapBytes:TNT_NATIVE_MATH_HEAP,nativeGpuMaximumBytes:64*1024**2,nativeStagingBaselineBytes:STAGING,phaseBytes,liveUpperBytes,stagingBytes,outputBytes,baseOwnedBytes:TNT_NATIVE_MATH_HEAP+stagingBytes+outputBytes,ownership:'JS bound only; pool parameter copies/output/device/worker credits are separate'});
}
const transpose=(x,rows,columns)=>{const y=new Float32Array(x.length);for(let r=0;r<rows;r++)for(let c=0;c<columns;c++)y[c*rows+r]=x[r*columns+c];return y;};
const add=(a,b,offset=0)=>{requireValue(a.length-offset===b.length,'TNT residual shape');const out=a.slice();for(let i=0;i<b.length;i++)out[offset+i]=Math.fround(a[offset+i]+b[i]);return out;};
export function initializeTntWindowOuter(projected,clsToken,positions){
 requireValue(projected instanceof Float32Array&&projected.length>=256*640&&projected.length%(256*640)===0&&clsToken instanceof Float32Array&&clsToken.length===640&&positions instanceof Float32Array&&positions.length===257*640,'TNT exact native local position tables required');const M=projected.length/640,outer=new Float32Array((M+1)*640);outer.set(clsToken);outer.set(projected,640);for(let c=0;c<640;c++)outer[c]=Math.fround(outer[c]+positions[c]);for(let t=0;t<M;t++)for(let c=0;c<640;c++)outer[(t+1)*640+c]=Math.fround(outer[(t+1)*640+c]+positions[(t%256+1)*640+c]);return outer;
}

// The owner is published synchronously before factory/parameter awaits. Every
// context contributes patch words and native local positions, then all12 real
// TNT blocks operate on one window bank, with exactly one class token.
export async function createTntWindowBackbone({budget,graph,read,contextCells,maxWorkers=1,backend='cpu',onOwner,mathFactory=nativeMathFactory,cpuFactory=createTntWindowLinearCpu,gpuFactory=createTntWindowGpu}){
 requireValue(['cpu','webgpu'].includes(backend)&&budget?.reserve&&typeof read==='function'&&typeof onOwner==='function'&&Number.isInteger(maxWorkers)&&maxWorkers>=1&&maxWorkers<=32,'TNT native bank backend/parent/Maximum required');validateTntBackbone(graph);const admission=planTntWindowBackboneMemory(contextCells),M=contextCells,T=M+1;
 const children=new Set(),outputs=new Set(),heldJobs=new Set(),controller=new AbortController();let module,freeHeap,pool,initializing,running,closing,retiring=false,closed=false,needsRetry=false;
 const current=signal=>{checkAbort(controller.signal);checkAbort(signal);requireValue(!retiring&&!closed,'TNT contextual backbone retired');};
 async function retirePools(){await retireCompositeOwners([...children].map(child=>async()=>{await(child.dispose??child.release).call(child);children.delete(child);}));if(!children.size)pool=undefined;}
 const freeHeld=()=>{if(children.size)return;for(const job of[...heldJobs]){job.output?.release();job.staging?.();heldJobs.delete(job);}};
 async function retireResources(){await retireCompositeOwners([()=>retirePools(),()=>{for(const output of[...outputs])output.release();},()=>{module=undefined;freeHeap?.();freeHeap=undefined;},()=>freeHeld()]);}
 const owner={release(){if(closing)return closing;if(closed)return;retiring=true;controller.abort();closing=(async()=>{try{await initializing;}catch{}try{await running;}catch{}await retireResources();requireValue(!children.size&&!heldJobs.size,'TNT native producers still await retirement ACK');closed=true;})().finally(()=>closing=undefined);return closing;}};
 onOwner(owner);current();
 const childOwner=child=>{requireValue(typeof(child?.dispose??child?.release)==='function','Native TNT child owner required');children.add(child);};
 async function createPool(){const before=children.size,value=await(backend==='webgpu'?gpuFactory:cpuFactory)({budget,contextCells:M,maxWorkers,onOwner:childOwner});requireValue(children.size>before&&typeof value?.run==='function','TNT pool must publish its owner before construction returns');pool=value;return value;}
 initializing=Promise.resolve().then(async()=>{current();await createPool();current();freeHeap=budget.reserve(TNT_NATIVE_MATH_HEAP);module=await mathFactory();requireValue(module.HEAPU8.length===TNT_NATIVE_MATH_HEAP,'TNT bounded native heap');current();});
 try{await initializing;}catch(primary){await retireCompositeOwners([()=>retireResources()],{primary});throw primary;}
 async function work(inputs,{signal,onProgress}={}){
  current(signal);if(needsRetry){await retirePools();freeHeld();current(signal);await createPool();needsRetry=false;}current(signal);
  requireValue(Array.isArray(inputs)&&inputs.length===M/256&&inputs.every(x=>x instanceof Float32Array&&x.length===3*256**2&&x.every(Number.isFinite)),'Prepared admitted TNT literal-context RGB inputs');
  const job={staging:undefined,output:undefined};heldJobs.add(job);let complete=false,stamp=performance.now(),parameterLoadMs=0,attentionMatmulMs=0,workers=0,gpuWriteBytes=0,gpuReadBytes=0,gpuPeakBufferBytes=0,gpuAllocations=0;const began=stamp,f=Math.fround;
  const checkpoint=async()=>{current(signal);if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}};
  const math=createTntWindowMath({module,signal,checkpoint});
  const param=async name=>{current(signal);const spec=graph.parameters[name],start=performance.now();let bytes;try{bytes=await read(spec,{signal});}finally{parameterLoadMs+=performance.now()-start;}current(signal);requireValue(bytes instanceof Uint8Array&&bytes.byteLength===spec.bytes&&bytes.byteOffset%4===0,'Verified TNT parameter bytes');const values=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);requireValue(values.every(Number.isFinite),'Finite TNT parameters');return values;};
  const norm=async(name,x,width)=>math.norm(x,await param(name+'.weight'),await param(name+'.bias'),width);
  const linear=async(name,x,ci)=>{const co=graph.parameters[name+'.weight'].shape[0],weight=await param(name+'.weight'),hasBias=!!graph.parameters[name+'.bias'],bias=hasBias?await param(name+'.bias'):new Float32Array(co),rows=x.length/ci;let result,failed=false,primary;try{result=await pool.run({input:transpose(x,rows,ci),weight,bias,rows,ci,co,hasBias},{signal,onProgress:progress=>onProgress?.({...progress,layer:name})});current(signal);workers=Math.max(workers,result.workers??0);gpuWriteBytes+=result.timings?.gpuWriteBytes??0;gpuReadBytes+=result.timings?.gpuReadBytes??0;gpuPeakBufferBytes=Math.max(gpuPeakBufferBytes,result.gpu?.peakAccountedBytes??0);gpuAllocations+=result.gpu?.allocations??0;return transpose(result.data,co,rows);}catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners(result?[()=>result.release()]:[],failed?{primary}:{});}};
  const matmul=async(a,b,batch,rows,k,n,transposed,headFirst=0)=>{const start=performance.now();try{
   if(backend==='webgpu'&&batch<=10&&rows===T){let result,failed=false,primary;try{result=await pool.matmul({a,b,batch,rows,k,n,transposed,headFirst},{signal,onProgress});current(signal);gpuWriteBytes+=result.timings.gpuWriteBytes;gpuReadBytes+=result.timings.gpuReadBytes;gpuPeakBufferBytes=Math.max(gpuPeakBufferBytes,result.gpu.peakAccountedBytes);gpuAllocations+=result.gpu.allocations;return result.data;}catch(error){failed=true;primary=error;throw error;}finally{await retireCompositeOwners(result?[()=>result.release()]:[],failed?{primary}:{});}}
   return await math.matmul(a,b,batch,rows,k,n,transposed);
  }finally{attentionMatmulMs+=performance.now()-start;}};
  const attention=async(name,x,batch,n,channels,heads)=>{
   const d=channels/heads;let qk=await linear(name+'.qk',x,channels),vLinear=await linear(name+'.v',x,channels);const y=new Float32Array(x.length),scale=f(d**-.5);
   if(channels===640){
    // Full ordered dots and full-row softmax, one outer head at a time. This
    // removes only simultaneous head scratch; all heads/relations are retained.
    for(let h=0;h<heads;h++){current(signal);let q=new Float32Array(n*d),k=new Float32Array(n*d),v=new Float32Array(n*d);for(let t=0;t<n;t++)for(let c=0;c<d;c++){const dst=t*d+c;q[dst]=qk[t*channels*2+h*d+c];k[dst]=qk[t*channels*2+channels+h*d+c];v[dst]=vLinear[t*channels+h*d+c];}
     let scores=await matmul(q,k,1,n,d,n,true,h);q=k=undefined;for(let i=0;i<scores.length;i++)scores[i]=f(scores[i]*scale);const probability=await math.softmax(scores,n);scores=undefined;const context=await matmul(probability,v,1,n,n,d,false,h);for(let t=0;t<n;t++)for(let c=0;c<d;c++)y[t*channels+h*d+c]=context[t*d+c];await checkpoint();
    }
   }else{
    const q=new Float32Array(x.length),k=new Float32Array(x.length),v=new Float32Array(x.length);for(let b=0;b<batch;b++)for(let h=0;h<heads;h++)for(let t=0;t<n;t++)for(let c=0;c<d;c++){const dst=((b*heads+h)*n+t)*d+c,src=(b*n+t)*channels+h*d+c;q[dst]=qk[(b*n+t)*channels*2+h*d+c];k[dst]=qk[(b*n+t)*channels*2+channels+h*d+c];v[dst]=vLinear[src];}
    const scores=await matmul(q,k,batch*heads,n,d,n,true);for(let i=0;i<scores.length;i++)scores[i]=f(scores[i]*scale);const probability=await math.softmax(scores,n),context=await matmul(probability,v,batch*heads,n,n,d,false);for(let b=0;b<batch;b++)for(let h=0;h<heads;h++)for(let t=0;t<n;t++)for(let c=0;c<d;c++)y[(b*n+t)*channels+h*d+c]=context[((b*heads+h)*n+t)*d+c];
   }
   qk=vLinear=undefined;return linear(name+'.proj',y,channels);
  };
  const mlp=async(name,x,c)=>linear(name+'.fc2',await math.gelu(await linear(name+'.fc1',x,c)),c*4);
  try{
   job.staging=budget.reserve(admission.stagingBytes);let free=budget.reserve(admission.outputBytes),data;const output={get data(){return data;},shape:[1,640,1,M],contextShape:[1,640,16,16],contextCells:M,outerCells:T,positions:'native-local-indices-repeated-per-context;one-cls',admission,release(){if(!free)return;free();free=undefined;data=undefined;outputs.delete(output);}};job.output=output;outputs.add(output);
   let inner=new Float32Array(M*640);const patchWeight=await param('patch_embed.proj.weight'),patchBias=await param('patch_embed.proj.bias');for(let c=0;c<inputs.length;c++){const local=await math.patch(inputs[c],patchWeight,patchBias);inner.set(local,c*256*640);await checkpoint();}
   const innerPos=await param('inner_pos');for(let i=0;i<inner.length;i++)inner[i]=f(inner[i]+innerPos[i%640]);
   let projected=await norm('proj_norm2',await linear('proj',await norm('proj_norm1',inner,640),640),640),outer=initializeTntWindowOuter(projected,await param('cls_token'),await param('outer_pos'));projected=undefined;
   for(let i=0;i<12;i++){const name='blocks.'+i;inner=add(inner,await attention(name+'.inner_attn',await norm(name+'.inner_norm1',inner,40),M,16,40,4));inner=add(inner,await mlp(name+'.inner_mlp',await norm(name+'.inner_norm2',inner,40),40));outer=add(outer,await norm(name+'.proj_norm2',await linear(name+'.proj',await norm(name+'.proj_norm1',inner,640),640),640),640);outer=add(outer,await attention(name+'.outer_attn',await norm(name+'.outer_norm1',outer,640),1,T,640,10));outer=add(outer,await mlp(name+'.outer_mlp',await norm(name+'.outer_norm2',outer,640),640));onProgress?.({phase:'tnt-window-backbone',completed:i+1,total:12,contextCells:M,outerCells:T});await checkpoint();}
   const final=await norm('norm',outer,640);data=transpose(final.subarray(640),M,640);requireValue(data.every(Number.isFinite),'Finite contextual TNT backbone');current(signal);output.workers=workers;output.timings={parameterLoadMs,attentionMatmulMs,executionMs:performance.now()-began-parameterLoadMs,gpuWriteBytes,gpuReadBytes};if(backend==='webgpu')output.gpu={devices:1,allocations:gpuAllocations,peakAccountedBytes:gpuPeakBufferBytes,accounting:'same explicit GPU buffers; excludes driver/compiler residency',errors:[]};complete=true;job.staging();heldJobs.delete(job);return output;
  }catch(primary){needsRetry=true;await retireCompositeOwners([()=>retirePools()],{primary});if(!children.size)freeHeld();throw primary;}
  finally{if(!complete&&!children.size)freeHeld();}
 }
 function run(inputs,hooks={}){requireValue(!running&&!retiring&&!closed,'One native TNT window at a time');const signal=AbortSignal.any([controller.signal,...(hooks.signal?[hooks.signal]:[])]),task=Promise.resolve().then(()=>work(inputs,{...hooks,signal}));running=task;task.then(()=>{if(running===task)running=undefined;},()=>{if(running===task)running=undefined;});return task;}
 return Object.freeze({run,release:owner.release,dispose:owner.release,admission,backend,maximumWorkers:maxWorkers,get pendingACKs(){return children.size+heldJobs.size;}});
}
