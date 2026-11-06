import {serializeEngineError} from './errors.js';
import {medianBlockFeatures} from './median-features.js';
self.onmessage=async({data:{blocks,featureCount}})=>{
 try{
  const count=blocks.length/4096,features=new Float64Array(count*featureCount),variances=new Float64Array(count);
  for(let i=0;i<count;i++){const result=await medianBlockFeatures(blocks.subarray(i*4096,(i+1)*4096),featureCount);features.set(result.features,i*featureCount);variances[i]=result.variance;}
  self.postMessage({features,variances},[features.buffer,variances.buffer]);
 }catch(error){self.postMessage({error:serializeEngineError(error,'WORKER_FAILED')});}
};
