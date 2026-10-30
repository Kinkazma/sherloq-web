import {checkAbort} from '../../src/errors.js';
import {getExecutionScheduler} from '../../src/execution-scheduler.js';

// Manual conversion is authoritative; native builtins are a device-qualified optimization.
export const D2PRL_HALF_WGSL=String.raw`override d2prlBuiltinDecode:bool=false;
override d2prlBuiltinHalf:bool=false;
fn decodeManual(bits:u32)->f32 {
 let sign=(bits&32768u)<<16u;let exponent=(bits>>10u)&31u;var mantissa=bits&1023u;
 if(exponent==0u){if(mantissa==0u){return bitcast<f32>(sign);}var e=-14;
  while((mantissa&1024u)==0u){mantissa=mantissa<<1u;e=e-1;}
  return bitcast<f32>(sign|(u32(e+127)<<23u)|((mantissa&1023u)<<13u));}
 if(exponent==31u){return bitcast<f32>(sign|2139095040u|(mantissa<<13u));}
 return bitcast<f32>(sign|((exponent+112u)<<23u)|(mantissa<<13u));
}
fn halfManual(x:f32)->f32 {
 let bits=bitcast<u32>(x);let sign=(bits>>16u)&32768u;let exponent=(bits>>23u)&255u;var mantissa=bits&8388607u;let e=i32(exponent)-112;
 if(exponent==255u){return decodeManual(sign|31744u|select(0u,512u,mantissa!=0u));}
 if(e>=31){return decodeManual(sign|31744u);}if(e<=0){if(e< -10){return decodeManual(sign);}mantissa=mantissa|8388608u;
  let shift=u32(14-e);var q=mantissa>>shift;let r=mantissa&((1u<<shift)-1u);let middle=1u<<(shift-1u);
  q=q+select(0u,1u,r>middle||(r==middle&&(q&1u)!=0u));return decodeManual(sign|q);}
 var q=(u32(e)<<10u)|(mantissa>>13u);let r=mantissa&8191u;q=q+select(0u,1u,r>4096u||(r==4096u&&(q&1u)!=0u));return decodeManual(sign|q);
}
fn decodeNative(bits:u32)->f32 {
 // Preserve NaN payload/sign and infinity behavior instead of relying on casts.
 if((bits&31744u)==31744u){return decodeManual(bits);}
 return unpack2x16float(bits).x;
}
fn halfNative(x:f32)->f32 {
 let magnitude=bitcast<u32>(x)&2147483647u;
 // Guard all subnormal results and every value outside finite binary16 range.
 // The normal-range builtin is enabled only after device RTE qualification.
 if(magnitude<947912704u||magnitude>1199562752u){return halfManual(x);}
 return unpack2x16float(pack2x16float(vec2<f32>(x,0.0))).x;
}
fn decode(bits:u32)->f32 {if(d2prlBuiltinDecode){return decodeNative(bits);}return decodeManual(bits);}
fn half(x:f32)->f32 {if(d2prlBuiltinHalf){return halfNative(x);}return halfManual(x);}
`;

// Exact half endpoints and adjacent-half midpoints are representable in f32.
// The neighboring bit patterns exercise both rounding directions and RTE ties.
const DECODE_CASES=65536,ENDPOINT_CASES=2*31744,MIDPOINT_CASES=2*31743*3;
const EDGE_BITS=[0,0x80000000,1,0x80000001,0x007fffff,0x807fffff,
 0x32ffffff,0x33000000,0x33000001,0xb2ffffff,0xb3000000,0xb3000001,
 0x387fffff,0x38800000,0x38800001,0xb87fffff,0xb8800000,0xb8800001,
 0x477fdfff,0x477fe000,0x477fe001,0x477fefff,0x477ff000,0x477ff001,
 0xc77fdfff,0xc77fe000,0xc77fe001,0xc77fefff,0xc77ff000,0xc77ff001,
 0x7f7fffff,0xff7fffff,0x7f800000,0xff800000,0x7fc00000,0xffc00000,
 0x7f800001,0xff800001,0x7fffffff,0xffffffff];
export const D2PRL_HALF_QUALIFICATION_CASES=Object.freeze({decode:DECODE_CASES,round:ENDPOINT_CASES+MIDPOINT_CASES+EDGE_BITS.length});
export const D2PRL_HALF_QUALIFICATION_WGSL=D2PRL_HALF_WGSL+String.raw`
// D2PRL half device selfqualification; no model/corpus assets.
@group(0) @binding(0) var<storage,read_write> failures:array<atomic<u32>,4>;
const edgeBits=array<u32,${EDGE_BITS.length}>(${EDGE_BITS.map(n=>n+'u').join(',')});
@compute @workgroup_size(128) fn main(@builtin(global_invocation_id) gid:vec3<u32>){
 let index=gid.x;
 if(index<65536u){if((index&127u)==0u){atomicAdd(&failures[2],min(128u,65536u-index));}let expected=bitcast<u32>(decodeManual(index));let actual=bitcast<u32>(decodeNative(index));if(expected!=actual){atomicAdd(&failures[0],1u);}return;}
 let at=index-65536u;if(at>=${D2PRL_HALF_QUALIFICATION_CASES.round}u){return;}if((at&127u)==0u){atomicAdd(&failures[3],min(128u,${D2PRL_HALF_QUALIFICATION_CASES.round}u-at));}var bits=0u;
 if(at<63488u){let sign=select(0u,32768u,at>=31744u);bits=bitcast<u32>(decodeManual((at%31744u)|sign));}
 else if(at<253946u){let point=at-63488u;let perSign=95229u;let local=point%perSign;let h=local/3u;let middle=(decodeManual(h)+decodeManual(h+1u))*0.5;let midBits=bitcast<u32>(middle);bits=select(select(midBits-1u,midBits,local%3u==1u),midBits+1u,local%3u==2u)|select(0u,2147483648u,point>=perSign);}
 else{let edge=at-253946u;if(edge>=${EDGE_BITS.length}u){return;}bits=edgeBits[edge];}
 let x=bitcast<f32>(bits);if(bitcast<u32>(halfManual(x))!=bitcast<u32>(halfNative(x))){atomicAdd(&failures[1],1u);}
}
`;

const manual=(reason,detail={})=>({decode:false,round:false,mode:'manual',reason,...detail});

/** Small correctness self-test on this device, not a startup speed benchmark.
 * A refusal or unsupported conversion keeps the existing manual functions.
 * Every temporary GPU allocation remains owned until its queue has settled. */
export async function qualifyD2prlHalfBuiltins(device,{budget,operation=(_label,work)=>work(),signal}={}){
 let pipelineRelease,stagingRelease,result,lease,submitted=false,scopes=0;const owned=[];
 const allocate=(size,usage,label)=>{const release=budget.reserve(size);let buffer,backing;try{buffer=device.createBuffer({size,usage,label});backing=budget.registerBacking?.('gpu',size,{owner:'d2prl',label});owned.push({buffer,backing,release,size});return buffer;}catch(error){buffer?.destroy();backing?.();release();throw error;}};
 try{
  checkAbort(signal);pipelineRelease=budget.reserve(2*1024**2);
  device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');scopes=2;
  const module=device.createShaderModule({code:D2PRL_HALF_QUALIFICATION_WGSL}),info=await module.getCompilationInfo();checkAbort(signal);
  if(info.messages.some(message=>message.type==='error'))return manual('qualification-shader-unavailable');
  const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});checkAbort(signal);
  lease=await getExecutionScheduler(budget).acquire({cpu:0,gpu:1,signal,resourceOwner:'d2prl',label:'d2prl-half-selfqual'});checkAbort(signal);
  const output=allocate(16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,'d2prl-half-selfqual-output'),read=allocate(16,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST,'d2prl-half-selfqual-readback');
  stagingRelease=budget.reserve(16);const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:output}}]}));pass.dispatchWorkgroups(Math.ceil((DECODE_CASES+D2PRL_HALF_QUALIFICATION_CASES.round)/128));pass.end();encoder.copyBufferToBuffer(output,0,read,0,16);checkAbort(signal);device.queue.submit([encoder.finish()]);submitted=true;
  await operation('d2prl-half-selfqual:readback',()=>read.mapAsync(GPUMapMode.READ,0,16),{bytes:16});let counts;
  try{checkAbort(signal);counts=new Uint32Array(read.getMappedRange(0,16)).slice();}finally{read.unmap();}
  const oom=await device.popErrorScope();scopes--;const validation=await device.popErrorScope();scopes--;
  if(oom||validation)return manual('qualification-device-refusal');
  if(counts[2]!==DECODE_CASES||counts[3]!==D2PRL_HALF_QUALIFICATION_CASES.round)return manual('incomplete-qualification');
  result={decode:counts[0]===0,round:counts[1]===0,mode:counts[0]===0||counts[1]===0?'device-qualified':'manual',reason:'device-comparison',differentDecode:counts[0],differentRound:counts[1],cases:D2PRL_HALF_QUALIFICATION_CASES};return result;
 }catch(error){checkAbort(signal);return manual('qualification-unavailable',{errorCode:error?.code??null});}
 finally{
  // A rejected readback/cancellation still drains any submitted qualification.
  try{
   if(submitted)await device.queue.onSubmittedWorkDone().catch(()=>{});
   while(scopes-->0)await device.popErrorScope().catch(()=>{});
   for(const owner of owned.reverse()){owner.buffer.destroy();owner.backing?.();owner.release();budget.notifyBackingRelease?.('gpu',owner.size);}
   stagingRelease?.();pipelineRelease?.();
  }finally{lease?.release();}
 }
}
