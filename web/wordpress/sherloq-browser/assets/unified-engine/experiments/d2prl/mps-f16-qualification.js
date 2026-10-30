import {D2PRL_HALF_QUALIFICATION_WGSL,D2PRL_HALF_QUALIFICATION_CASES} from './half-conversion-gpu.js';
import {requireValue,checkAbort} from '../../src/errors.js';
import {getExecutionScheduler} from '../../src/execution-scheduler.js';
import {preserveConvolutionPrimary} from './convolution-retirement.js';
const BASE=65536+D2PRL_HALF_QUALIFICATION_CASES.round,PATTERNS=31*6*2,POSITIONS=PATTERNS*16,FINITE_PAIRS=POSITIONS-4;
export const MPS_F16_RUNTIME_CASES=Object.freeze({patterns:PATTERNS,positions:POSITIONS,finitePairs:FINITE_PAIRS,base:BASE});
const base=D2PRL_HALF_QUALIFICATION_WGSL.replace('failures:array<atomic<u32>,4>','failures:array<atomic<u32>,8>').replace('@compute @workgroup_size(128) fn main(@builtin(global_invocation_id) gid:vec3<u32>)','fn halfCompatibility(gid:vec3<u32>)');
export const MPS_F16_QUALIFICATION_WGSL='enable f16;\n'+base+String.raw`
fn f16RuntimePartner(a:u32,k:u32)->u32{
 let e=(a>>10u)&31u;var middle=0u;if(e>=12u){middle=(e-11u)<<10u;}else if(e>=2u){middle=1u<<(e-2u);}
 switch(k){case 0u:{return 0u;}case 1u:{return 32768u;}case 2u:{return 1u;}case 3u:{return 32769u;}case 4u:{return a;}case 5u:{return a^32768u;}case 6u:{return(a+1u)&65535u;}case 7u:{return(a-1u)&65535u;}case 8u:{return 15360u;}case 9u:{return 48128u;}case 10u:{return 31743u;}case 11u:{return 64511u;}case 12u:{return middle;}case 13u:{return middle^32768u;}case 14u:{return select(0u,middle-1u,middle>0u);}default:{return min(31743u,middle+1u);}}
}
@compute @workgroup_size(128) fn main(@builtin(global_invocation_id) gid:vec3<u32>){
 let i=gid.x;if(i<${BASE}u){halfCompatibility(gid);return;}let index=i-${BASE}u;if(index>=${POSITIONS}u){return;}
 let at=index/16u;let exponent=(at/6u)%31u;let mantissas=array<u32,6>(0u,1u,511u,512u,1022u,1023u);let a=(exponent<<10u)|mantissas[at%6u]|select(0u,32768u,at>=186u);let b=f16RuntimePartner(a,index%16u);
 let x=decodeManual(a);if(index%16u==0u){atomicAdd(&failures[7],1u);if(bitcast<u32>(f32(f16(x)))!=bitcast<u32>(x)){atomicAdd(&failures[6],1u);}}
 if((b&31744u)==31744u){return;}atomicAdd(&failures[5],1u);let y=decodeManual(b);let expected=abs(halfManual(x-y));let actual=f32(abs(f16(x)-f16(y)));if(bitcast<u32>(expected)!=bitcast<u32>(actual)){atomicAdd(&failures[4],1u);}
}
`;
const direct=(_label,work)=>work();
// Strong temporary owner for the combined correctness pass. The legacy helper
// and all non-f16 callers retain their current contract and shader bytes.
export async function qualifyMpsF16(device,{budget,adoptOwner,signal,operation=direct}={}){
 requireValue(budget?.reserve&&typeof adoptOwner==='function','F16 compatibility owner before admission');
 const life=new AbortController(),selected=signal?AbortSignal.any([signal,life.signal]):life.signal,resources=new Set();let pipelineFee,stageFee,mappedBacking,hostBacking,counts,mapping,read,queued=false,ack=false,lost=false,scopes=0,scopeUnknown,scopeUnknownFailed=false,lease,retired=false,closing,finish;
 const running=new Promise(resolve=>finish=resolve);void device.lost.then(()=>{lost=true;});
 const popScope=async()=>{try{const value=await device.popErrorScope();scopes--;return value;}catch(error){scopeUnknownFailed=true;scopeUnknown=error;throw error;}};
 const errors=[];
 const retainError=error=>{if(!errors.some(previous=>Object.is(previous,error))&&errors.length<16)errors.push(error);};
 const disposeRecord=async record=>{if(record.phase===0){record.buffer?.destroy();record.phase=1;}if(record.phase===1){await record.backing?.();record.phase=2;}if(record.phase===2){await record.fee?.();record.phase=3;}resources.delete(record);record.buffer=null;};
 const owner={get retirementErrors(){return[...errors];},dispose(){if(retired)return Promise.resolve();if(closing)return closing;life.abort();const task=(async()=>{await running;
  if(mapping){try{await mapping;ack=true;}catch{}mapping=null;}if(queued&&!ack&&!lost){await device.queue.onSubmittedWorkDone();ack=true;}
  if(!lost){if(scopeUnknownFailed)throw scopeUnknown;while(scopes)await popScope();}else scopes=0;
  if(read?.mapState==='mapped')read.unmap();let failed=false,primary;const attempt=async work=>{try{await work();}catch(error){retainError(error);if(!failed){failed=true;primary=error;}else preserveConvolutionPrimary(primary,error);}};
  if(mappedBacking)await attempt(async()=>{await mappedBacking();mappedBacking=null;});if(hostBacking)await attempt(async()=>{await hostBacking();hostBacking=null;});
  for(const record of [...resources])await attempt(()=>disposeRecord(record));if(failed)throw primary;
  if(stageFee){await stageFee();stageFee=null;}if(pipelineFee){await pipelineFee();pipelineFee=null;}counts=null;read=null;if(lease){lease.release();lease=null;}retired=true;
 })();closing=task;void task.catch(retainError);void task.finally(()=>{if(closing===task)closing=null;}).catch(()=>{});return task;}};
 const allocate=(label,size,usage)=>{const record={phase:0,fee:null,buffer:null,backing:null};resources.add(record);record.fee=budget.reserve(size);record.buffer=device.createBuffer({label,size,usage});record.backing=budget.registerBacking?.('gpu',size,{owner:'d2prl',label});return record.buffer;};
 let primary,failed=false,result;
 try{
  adoptOwner(owner);checkAbort(selected);pipelineFee=budget.reserve(2*1024**2);stageFee=budget.reserve(64);device.pushErrorScope('validation');scopes++;device.pushErrorScope('out-of-memory');scopes++;
  const module=device.createShaderModule({code:MPS_F16_QUALIFICATION_WGSL}),info=await module.getCompilationInfo();checkAbort(selected);
  if(info.messages.some(message=>message.type==='error'))result={f16:false,baseAvailable:false,reason:'f16-qualification-shader-unavailable'};
  else{
   let pipeline;try{pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main',constants:{d2prlBuiltinDecode:0,d2prlBuiltinHalf:0}}});}catch(error){if(globalThis.GPUPipelineError&&error instanceof GPUPipelineError&&error.reason==='validation')result={f16:false,baseAvailable:false,reason:'f16-qualification-pipeline-unavailable'};else throw error;}checkAbort(selected);
   if(pipeline){
    const output=allocate('d2prl-f16-half-selfqual-output',32,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC);read=allocate('d2prl-f16-half-selfqual-readback',32,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
    lease=await getExecutionScheduler(budget).acquire({cpu:0,gpu:1,signal:selected,resourceOwner:'d2prl',label:'d2prl-f16-half-selfqual'});
    {checkAbort(selected);const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:output}}]}));pass.dispatchWorkgroups(Math.ceil((BASE+POSITIONS)/128));pass.end();encoder.copyBufferToBuffer(output,0,read,0,32);checkAbort(selected);queued=true;ack=false;device.queue.submit([encoder.finish()]);await operation('d2prl-f16-half-selfqual:readback',()=>{if(!mapping){mapping=read.mapAsync(GPUMapMode.READ,0,32);void mapping.catch(()=>{});}return mapping;},{bytes:32});requireValue(mapping,'Actual f16 readback required');await mapping;ack=true;checkAbort(selected);
     mappedBacking=budget.registerBacking?.('gpu-mapped',32,{owner:'d2prl',label:'d2prl-f16-half-selfqual-mapped'});counts=new Uint32Array(read.getMappedRange(0,32)).slice();hostBacking=budget.registerBacking?.('array-buffer',32,{owner:'d2prl',label:'d2prl-f16-half-selfqual-counts',identity:counts.buffer});read.unmap();mapping=null;
     const oom=await popScope();const validation=await popScope();checkAbort(selected);
     const complete=counts[2]===65536&&counts[3]===D2PRL_HALF_QUALIFICATION_CASES.round&&counts[5]===FINITE_PAIRS&&counts[7]===PATTERNS;
     result={baseAvailable:!oom&&!validation&&complete,f16:!oom&&!validation&&complete&&counts[4]===0&&counts[6]===0,reason:oom||validation?'f16-qualification-device-refusal':!complete?'f16-qualification-incomplete':'f16-device-comparison',differentF16Difference:counts[4],differentF16Storage:counts[6],cases:MPS_F16_RUNTIME_CASES,half:{decode:!oom&&!validation&&complete&&counts[0]===0,round:!oom&&!validation&&complete&&counts[1]===0,mode:'device-qualified',reason:'combined-f16-device-comparison',differentDecode:counts[0],differentRound:counts[1],cases:D2PRL_HALF_QUALIFICATION_CASES}};
    }
   }
  }
 }catch(error){failed=true;primary=error;}
 finally{finish();try{await owner.dispose();}catch(cleanup){if(failed)preserveConvolutionPrimary(primary,cleanup);else{failed=true;primary=cleanup;}}}
 if(failed)throw primary;return result;
}
