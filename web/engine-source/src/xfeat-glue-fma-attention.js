import {fetchXfeatGlueAsset} from './xfeat-glue-global-assets.js';
// SHERLOQ: correct both unfused CPU cross-attention MatMuls, with a native fmaf anchor.
// GPU graphs and the complete scientific attention/assignment domains are kept.
import {GlobalGlueAttention as Original} from './xfeat-glue-operator-attention.js';
import {createCrossDotFma} from './xfeat-glue-cpu-dot.js';
export {glueCSR} from './xfeat-glue-operator-attention.js';
export class GlobalGlueAttention extends Original{
 async open(provider){
  await super.open(provider);
  if(provider==='wasm'){
   this.dot=await createCrossDotFma(null,{signal:this.signal});
   for(const name of ['softmax','value'])this.sessions.set('fma-'+name,await this.ort.InferenceSession.create(await fetchXfeatGlueAsset(name,this.signal),{executionProviders:['wasm'],graphOptimizationLevel:'all'}));
   this.metrics.cpuDotFma={qualification:this.dot.qualification,method:'float32 fmaf K ascending for QK and weights-times-values, independent outputs, same complete keys',outputs:0,valueOutputs:0,strictVsHardwareDifferences:0,strictVerifiedOutputs:0,perDotStrictVerification:true,heapBytes:0};
  }
  return this;
 }
 async run(name,inputs){
  if(name!=='attention'||this.provider!=='wasm')return super.run(name,inputs);
  const {q,k,v,valid}=inputs,[heads,rows,dim]=q.dims,keys=k.dims[1],logits=new Float32Array(heads*rows*keys);
  for(let head=0;head<heads;head++){
   const result=this.dot.dot(q.data.subarray(head*rows*dim,(head+1)*rows*dim),k.data.subarray(head*keys*dim,(head+1)*keys*dim),rows,keys,dim,{hardware:this.dot.qualification.qualified,compareHardware:this.verifyFmaEveryDot!==false});
   if(result.hardwareDifferences)throw Error('Hardware FMA differs from the strict native fmaf anchor on actual learned tensors');
   logits.set(result.output,head*rows*keys);this.metrics.cpuDotFma.outputs+=result.output.length;this.metrics.cpuDotFma.strictVsHardwareDifferences+=result.hardwareDifferences??0;this.metrics.cpuDotFma.perDotStrictVerification=this.verifyFmaEveryDot!==false;if(result.hardwareDifferences!==null)this.metrics.cpuDotFma.strictVerifiedOutputs+=result.output.length;this.metrics.cpuDotFma.heapBytes=Math.max(this.metrics.cpuDotFma.heapBytes,result.heapBytes);
  }
  const weights=await super.run('fma-softmax',{logits:{data:logits,dims:[heads,rows,keys]},valid});
  const context=new Float32Array(heads*rows*dim);
  for(let head=0;head<heads;head++){
   const transposed=new Float32Array(dim*keys);for(let d=0;d<dim;d++)for(let key=0;key<keys;key++)transposed[d*keys+key]=v.data[(head*keys+key)*dim+d];
   const result=this.dot.dot(weights.subarray(head*rows*keys,(head+1)*rows*keys),transposed,rows,dim,keys,{hardware:this.dot.qualification.qualified,compareHardware:this.verifyFmaEveryDot!==false});
   if(result.hardwareDifferences)throw Error('Hardware value MatMul differs from strict native fmaf on actual learned tensors');
   context.set(result.output,head*rows*dim);this.metrics.cpuDotFma.valueOutputs+=result.output.length;this.metrics.cpuDotFma.strictVsHardwareDifferences+=result.hardwareDifferences??0;this.metrics.cpuDotFma.perDotStrictVerification=this.verifyFmaEveryDot!==false;if(result.hardwareDifferences!==null)this.metrics.cpuDotFma.strictVerifiedOutputs+=result.output.length;this.metrics.cpuDotFma.heapBytes=Math.max(this.metrics.cpuDotFma.heapBytes,result.heapBytes);
  }
  // The author's masked CrossBlock applies nan_to_num for an empty key row.
  for(let i=0;i<context.length;i++)if(Number.isNaN(context[i]))context[i]=0;
  return context;
 }
 async dispose(){try{await super.dispose();}finally{this.dot=null;}}
}
