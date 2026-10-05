import {createConvolutionGeneralGpu} from '../d2prl/convolution-general-gpu.js';
import {requireValue,checkAbort} from '../../src/errors.js';
import {tntAttentionMatmul} from './tnt-attention-gpu.js';

// A 1x1 convolution over the existing channel-major rows preserves the CPU
// linear reduction order. Attention matrices share this device and ordered
// primitive; no dot-product partition or normalization change.
export async function createTntLinearGpu({budget}){
  const gpu=await createConvolutionGeneralGpu({budget});let busy=false,disposed=false;
  return{
    async run({input,weight,bias,rows,ci,co,hasBias},{signal,onProgress}={}){
      requireValue(!busy&&!disposed,'TNT GPU linear unavailable');
      requireValue([256,257,4096].includes(rows)&&[40,160,640,2560].includes(ci)&&[40,80,160,640,1280,2560].includes(co)&&typeof hasBias==='boolean','Pinned TNT linear geometry');
      requireValue(input instanceof Float32Array&&input.length===rows*ci&&weight instanceof Float32Array&&weight.length===ci*co&&bias instanceof Float32Array&&bias.length===co&&(hasBias||bias.every(v=>v===0)),'TNT GPU linear tensors');
      checkAbort(signal);busy=true;
      const height=rows===4096?64:1,width=rows/height;
      let release,complete=false,writeBytes=0,readBytes=0,peakBufferBytes=0,allocations=0;
      const part=async(first,count,biasAfter)=>{
        const weights=weight.subarray(first*ci,(first+count)*ci),b=bias.subarray(first,first+count),outputBytes=count*rows*4;
        const bufferBytes=input.byteLength+weights.byteLength+b.byteLength+2*outputBytes+72;
        requireValue(bufferBytes<=64*1024**2,'TNT explicit GPU buffer ceiling');
        // Even a biasless native linear starts with zero and FMA, so keep
        // hasBias:true with a verified zero tensor instead of first-product mode.
        const value=await gpu.run({input,weights,bias:b,channels:ci,height,width,outChannels:count,kernel:1,hasBias:true,referenceLayout:{inputShape:[1,ci,height,width],weightShape:[count,ci,1,1],padding:0,stride:1,groups:1,biasAfterRanges:biasAfter?[[0,rows]]:[]}},{signal,onSubmitted:()=>onProgress?.({phase:'tnt-linear-gpu',completed:first,total:co})});
        writeBytes+=input.byteLength+weights.byteLength+b.byteLength+72;readBytes+=outputBytes;peakBufferBytes=Math.max(peakBufferBytes,bufferBytes);allocations+=7;
        return value;
      };
      try{
        let data;
        if(hasBias&&co%32){
          release=budget.reserve(co*rows*4);data=new Float32Array(co*rows);const first=co-co%32;
          for(const[start,count,after]of [[0,first,false],[first,co-first,true]]){
            const value=await part(start,count,after);try{data.set(value.data,start*rows);}finally{value.release();}
          }
        }else{const value=await part(0,co,false);data=value.data;release=value.release;}
        checkAbort(signal);complete=true;
        return{data,workers:0,gpu:{devices:1,allocations,peakAccountedBytes:peakBufferBytes,accounting:'explicit GPU buffers; excludes driver/compiler residency',errors:[]},timings:{gpuWriteBytes:writeBytes,gpuReadBytes:readBytes},release};
      }finally{if(!complete)release?.();busy=false;}
    },
    async matmul(inputs,options){
      requireValue(!busy&&!disposed,'TNT GPU attention unavailable');busy=true;
      try{return await tntAttentionMatmul({...inputs,gpu,budget},options);}finally{busy=false;}
    },
    dispose(){requireValue(!busy,'TNT GPU linear busy');if(disposed)return;disposed=true;gpu.dispose();}
  };
}
