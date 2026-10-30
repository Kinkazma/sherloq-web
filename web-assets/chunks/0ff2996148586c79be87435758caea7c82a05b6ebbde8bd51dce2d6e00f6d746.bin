import "../../runtime-context.js?v=0.30.0";
import {copyTypedArray} from './allocation.js';
import {checkAbort,EngineError} from './errors.js';
export const nativeWeightsShaderSuffix=`
fn csr_add_ordered(a:f32,b:f32)->f32{return fma(1.0,a,b);}
@compute @workgroup_size(64) fn dotOrdered(@builtin(global_invocation_id) id:vec3<u32>){let e=id.x;let h=id.y;if(e>=p.edges||h>=p.heads){return;}let a=(h*p.rows+queries[e])*p.dim;let b=(h*p.keys+targets[e])*p.dim;var s=0.0;for(var d=0u;d<p.dim;d++){let product=q[a+d]*k[b+d];s=csr_add_ordered(s,product);}logits[h*p.edges+e]=s;}
@compute @workgroup_size(64) fn accumulateWeights(@builtin(global_invocation_id) id:vec3<u32>){let at=id.x;let h=id.y;if(at>=p.rows*p.dim||h>=p.heads){return;}let r=at/p.dim;let d=at%p.dim;var sum=0.0;for(var e=offsets[r];e<offsets[r+1u];e++){let product=logits[h*p.edges+e]*v[(h*p.keys+targets[e])*p.dim+d];sum=csr_add_ordered(sum,product);}context[h*p.rows*p.dim+at]=sum;}`;
export function rememberNativeWeightsCleanup(owner,error){
 const errors=owner.weightsCleanupErrors??=[];if(errors.length<64&&!errors.some(value=>Object.is(value,error)))errors.push(error);
}
export async function retireNativeWeightPointers(owner,records=owner.weightsPointers){
 let failed=false,primary;for(const record of [...(records??[])])try{
  if(record.ptr)await record.module._free(record.ptr);
  owner.weightsPointers?.delete(record);records?.delete(record);
 }catch(error){rememberNativeWeightsCleanup(owner,error);if(!failed){failed=true;primary=error;}}
 if(failed)throw primary;
}
// Original CSR edge order and complete Native normalization. No dot is replayed
// on CPU; its extra module is separately owned inside the prepaid Worker extent.
export async function nativeWeightsGpuPage(owner,q,k,v,offset,target,queries,rows,keys,heads,dim,onlyDot=false){
 checkAbort(owner.signal);if(owner.lost)throw new EngineError('LEARNED_INFERENCE_FAILED',owner.lost);const device=owner.device,e=target.length;
 if(!e)return new Float32Array(onlyDot?0:rows*heads*dim);
 const buffers=[],pointers=new Set(),module=owner.weightsCpu;owner.weightsPointers??=new Set();
 const make=(data,usage)=>{const size=Math.max(4,typeof data==='number'?data:data.byteLength),buffer=device.createBuffer({size,usage});buffers.push(buffer);if(typeof data!=='number')device.queue.writeBuffer(buffer,0,data);return buffer;};
 const malloc=(data,integer=false)=>{const n=typeof data==='number'?data:data.length,record={module,ptr:0};owner.weightsPointers.add(record);pointers.add(record);const ptr=module._malloc(Math.max(8,n*4));record.ptr=ptr;if(!ptr)throw new EngineError('MEMORY_ALLOCATION','Native CSR weight allocation refused');if(typeof data!=='number')(integer?module.HEAP32:module.HEAPF32).set(data,ptr/4);return ptr;};
 let scopes=0,mapping,read,submitted=false,hasPrimary=false,primary,scopeUncertain=false,scopeFailure;
 const drainScopes=async()=>{
  if(scopeUncertain)throw scopeFailure;
  let failed=false,first;while(scopes){const kind=scopes===2?'out-of-memory':'validation';let error;
   try{error=await device.popErrorScope();scopes--;}
   catch(cause){scopeUncertain=true;scopeFailure=cause;rememberNativeWeightsCleanup(owner,cause);if(!failed){failed=true;first=cause;}break;}
   if(error){const failure=new EngineError(kind==='out-of-memory'?'MEMORY_ALLOCATION':'LEARNED_INFERENCE_FAILED',error.message);rememberNativeWeightsCleanup(owner,failure);if(!failed){failed=true;first=failure;}}
  }
  if(failed)throw first;
 };
 try{
  device.pushErrorScope('validation');scopes++;device.pushErrorScope('out-of-memory');scopes++;
  const storage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC,all=[make(q,storage),make(k,storage),make(v,storage),make(target,storage),make(queries,storage),make(offset,storage),make(e*heads*4,storage),make(4,storage),make(rows*heads*dim*4,storage),make(new Uint32Array([rows,keys,heads,dim,e,0,0,0]),GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST)];
  read=make(Math.max(e*heads,rows*heads*dim)*4,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
  const execute=async(name,used,count,index)=>{
   checkAbort(owner.signal);const pipeline=owner.pipelines[name],encoder=device.createCommandEncoder(),group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:used.map(binding=>({binding,resource:{buffer:all[binding]}}))}),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil((name==='dotOrdered'?e:rows*dim)/64),heads);pass.end();encoder.copyBufferToBuffer(all[index],0,read,0,count*4);device.queue.submit([encoder.finish()]);submitted=true;mapping=read.mapAsync(GPUMapMode.READ,0,count*4);await mapping;let result;try{result=copyTypedArray(new Float32Array(read.getMappedRange(0,count*4)),{label:'native-CSR-GPU-transport'});}finally{read.unmap();mapping=null;}checkAbort(owner.signal);return result;
  };
  const logits=await execute('dotOrdered',[0,1,3,4,6,9],e*heads,6);if(onlyDot){await drainScopes();return logits;}
  const lp=malloc(logits),op=malloc(offset,true),wp=malloc(e*heads);module._glue_attention_weights(lp,op,rows,e,heads,wp);checkAbort(owner.signal);device.queue.writeBuffer(all[6],0,module.HEAPF32.buffer,wp,e*heads*4);
  const context=await execute('accumulateWeights',[2,3,5,6,8,9],rows*heads*dim,8);await drainScopes();return context;
 }catch(error){hasPrimary=true;primary=error;throw error;}
 finally{
  const failures=[],attempt=async work=>{try{await work();}catch(error){rememberNativeWeightsCleanup(owner,error);failures.push(error);}};
  if(mapping)await attempt(()=>mapping);
  if(read?.mapState==='mapped')await attempt(()=>read.unmap());
  await attempt(()=>retireNativeWeightPointers(owner,pointers));
  for(const buffer of buffers)await attempt(()=>buffer.destroy());
  if(scopes)await attempt(drainScopes);
  if(failures.length&&!hasPrimary)throw failures[0];
 }
}
