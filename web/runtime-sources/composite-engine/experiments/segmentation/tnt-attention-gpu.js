import {requireValue,checkAbort,controlCheckpoint} from '../../src/errors.js';

// Each attention head is an independent grouped1x1 convolution. Partition heads
// only, never a dot product: every reduction keeps native zero-initialized FMA
// order. Softmax, scaling, head layout and residuals remain in the existing path.
export async function tntAttentionMatmul({gpu,budget,a,b,batch,rows,k,n,transposed},{signal,onProgress}={}){
  requireValue((batch===1024&&rows===16&&((k===10&&n===16&&transposed===true)||(k===16&&n===10&&transposed===false)))||(batch===10&&rows===257&&((k===64&&n===257&&transposed===true)||(k===257&&n===64&&transposed===false))),'Pinned TNT attention geometry');
  requireValue(a instanceof Float32Array&&a.length===batch*rows*k&&b instanceof Float32Array&&b.length===batch*k*n,'TNT attention tensors');checkAbort(signal);
  let release,complete=false,writeBytes=0,readBytes=0,peakBufferBytes=0,allocations=0;
  try{
    release=budget.reserve(batch*rows*n*4);const data=new Float32Array(batch*rows*n),headsPerJob=Math.floor(4096/Math.max(k,n));
    for(let first=0;first<batch;first+=headsPerJob){
      checkAbort(signal);const count=Math.min(headsPerJob,batch-first),inputBytes=count*rows*k*4,weightBytes=count*k*n*4,biasBytes=count*n*4,outputBytes=count*rows*n*4;
      const staging=budget.reserve(inputBytes+(transposed?0:weightBytes)+biasBytes);let result,stamp=performance.now();
      try{
        const input=new Float32Array(count*rows*k),weights=transposed?b.subarray(first*k*n,(first+count)*k*n):new Float32Array(count*k*n),bias=new Float32Array(count*n);
        for(let h=0;h<count;h++){
          for(let q=0;q<k;q++)for(let i=0;i<rows;i++)input[(h*k+q)*rows+i]=a[((first+h)*rows+i)*k+q];
          if(!transposed)for(let j=0;j<n;j++)for(let q=0;q<k;q++)weights[(h*n+j)*k+q]=b[((first+h)*k+q)*n+j];
          if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}
        }
        const bufferBytes=inputBytes+weightBytes+biasBytes+2*outputBytes+72;requireValue(bufferBytes<=64*1024**2,'TNT attention explicit GPU buffer ceiling');
        result=await gpu.run({input,weights,bias,channels:count*k,height:1,width:rows,outChannels:count*n,kernel:1,groups:count,hasBias:true},{signal,onSubmitted:()=>onProgress?.({phase:'tnt-attention-gpu',completed:first,total:batch})});
        checkAbort(signal);stamp=performance.now();for(let h=0;h<count;h++){
          for(let i=0;i<rows;i++)for(let j=0;j<n;j++)data[((first+h)*rows+i)*n+j]=result.data[(h*n+j)*rows+i];
          if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}
        }
        writeBytes+=inputBytes+weightBytes+biasBytes+72;readBytes+=outputBytes;peakBufferBytes=Math.max(peakBufferBytes,bufferBytes);allocations+=7;
      }finally{result?.release();staging();}
    }
    checkAbort(signal);complete=true;
    return{data,gpu:{devices:1,allocations,peakAccountedBytes:peakBufferBytes,accounting:'explicit GPU buffers; shared device with linear layers, excludes driver/compiler residency',errors:[]},timings:{gpuWriteBytes:writeBytes,gpuReadBytes:readBytes},release};
  }finally{if(!complete)release?.();}
}
