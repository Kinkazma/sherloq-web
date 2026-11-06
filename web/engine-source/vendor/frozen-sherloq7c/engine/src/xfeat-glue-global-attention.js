import {fetchXfeatGlueAsset} from './xfeat-glue-global-assets.js';
import {GlobalGlueAttention as Shared} from './xfeat-glue-shared-softmax.js';
export {glueCSR} from './xfeat-glue-shared-softmax.js';
export class GlobalGlueAttention extends Shared{
 async open(provider){
  await super.open(provider);if(provider==='webgpu'){
   this.cpuOrt=this.ort.privateCpuOrt;if(!this.cpuOrt)throw Error('Explicit original CPU artifact required.');
   await this.sessions.get('shared-softmax').release();this.cpuSoftmax=await this.cpuOrt.InferenceSession.create(await fetchXfeatGlueAsset('softmax',this.signal),{executionProviders:['wasm'],graphOptimizationLevel:'all'});this.sessions.set('shared-softmax',this.cpuSoftmax);this.metrics.originalCpuArtifactSoftmax=true;
  }return this;
 }
 async run(name,inputs){
  if(name!=='attention'||this.provider!=='webgpu')return super.run(name,inputs);
  const{q,k,v,valid}=inputs,[heads,rows]=q.dims,keys=k.dims[1],logits=await super.run('shared-dot',{q,k}),tensors=[],feeds={};let outputs,weights;
  try{for(const[key,value]of Object.entries({logits:{data:logits,dims:[heads,rows,keys]},valid})){const tensor=new this.cpuOrt.Tensor(value.type??'float32',value.data,value.dims);tensors.push(tensor);feeds[key]=tensor;}outputs=await this.cpuSoftmax.run(feeds);weights=Object.values(outputs)[0].data.slice();}
  finally{for(const tensor of tensors)tensor.dispose();if(outputs)for(const tensor of Object.values(outputs))tensor.dispose();}
  const context=await super.run('shared-value',{weights:{data:weights,dims:[heads,rows,keys]},v});for(let i=0;i<context.length;i++)if(Number.isNaN(context[i]))context[i]=0;return context;
 }
}
