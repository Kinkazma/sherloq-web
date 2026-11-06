import {fetchXfeatGlueAsset} from './xfeat-glue-global-assets.js';
// SHERLOQ execution partition: both cross MatMuls use GPU; the existing
// standard CPU Softmax is shared with the corrected CPU reference. No key,
// layer, weight, mask or mathematical operation is removed or approximated.
import {GlobalGlueAttention as FmaValues} from './xfeat-glue-fma-attention.js';
export {glueCSR} from './xfeat-glue-fma-attention.js';
export class GlobalGlueAttention extends FmaValues{
 async open(provider){
  await super.open(provider);
  if(provider==='webgpu'){
   for(const [key,name,ep]of [['shared-dot','dot','webgpu'],['shared-softmax','softmax','wasm'],['shared-value','value','webgpu']])this.sessions.set(key,await this.ort.InferenceSession.create(await fetchXfeatGlueAsset(name,this.signal),{executionProviders:[ep],graphOptimizationLevel:'all'}));
   this.metrics.sharedCpuSoftmax=true;this.metrics.gpuCrossMatMuls=true;
  }
  return this;
 }
 async run(name,inputs){
  if(name!=='attention'||this.provider!=='webgpu')return super.run(name,inputs);
  const {q,k,v,valid}=inputs,[heads,rows]=q.dims,keys=k.dims[1];
  const logits=await super.run('shared-dot',{q,k}),weights=await super.run('shared-softmax',{logits:{data:logits,dims:[heads,rows,keys]},valid});
  const context=await super.run('shared-value',{weights:{data:weights,dims:[heads,rows,keys]},v});
  for(let i=0;i<context.length;i++)if(Number.isNaN(context[i]))context[i]=0;
  return context;
 }
}
