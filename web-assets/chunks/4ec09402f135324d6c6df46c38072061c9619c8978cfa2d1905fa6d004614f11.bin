import {createConvolutionGeneralGpu} from '../d2prl/convolution-general-gpu.js';
import {requireValue,checkAbort} from '../../src/errors.js';
import {vigDistanceGpu} from './vig-distance-gpu.js';

// Same ordered float32 FMA reduction as the CPU VIG pool. Graph dot products
// share this device; TopK, GELU, weights, resolution and thresholds are unchanged.
export async function createVigConvolutionGpu({budget}) {
  const gpu=await createConvolutionGeneralGpu({budget});let busy=false,disposed=false;
  return {
    async run({input,weight,bias,geometry},{signal,onProgress}={}) {
      requireValue(!busy&&!disposed,'VIG GPU convolution unavailable');
      const known=[[3,256,256,80,3,1,2,1],[80,128,128,160,3,1,2,1],[160,64,64,320,3,1,2,1],[320,32,32,640,3,1,2,1],[640,16,16,640,3,1,1,1],[640,16,16,640,1,0,1,1],[1280,16,16,1280,1,0,1,4],[1280,16,16,640,1,0,1,1],[640,16,16,2560,1,0,1,1],[2560,16,16,640,1,0,1,1]];
      requireValue(Array.isArray(geometry)&&known.some(g=>JSON.stringify(g)===JSON.stringify(geometry)),'Pinned VIG GPU geometry');
      const[channels,height,width,outChannels,kernel,padding,stride,groups]=geometry,oh=Math.floor((height+2*padding-kernel)/stride)+1,ow=Math.floor((width+2*padding-kernel)/stride)+1,plane=oh*ow,products=channels/groups*kernel*kernel;
      requireValue(input instanceof Float32Array&&input.length===channels*height*width&&weight instanceof Float32Array&&weight.length===products*outChannels&&bias instanceof Float32Array&&bias.length===outChannels,'VIG GPU tensors');
      checkAbort(signal);busy=true;let release,complete=false,writeBytes=0,readBytes=0,peakBufferBytes=0,allocations=0;
      const part=async(first,count,biasAfterRanges=[])=>{
        const weights=weight.subarray(first*products,(first+count)*products),biasPart=bias.subarray(first,first+count),outputBytes=count*plane*4,layoutBytes=Math.max(8,biasAfterRanges.length*8);
        const bufferBytes=input.byteLength+weights.byteLength+biasPart.byteLength+2*outputBytes+64+layoutBytes;
        requireValue(bufferBytes<=64*1024**2,'VIG GPU explicit buffer ceiling');
        const value=await gpu.run({input,weights,bias:biasPart,channels,height,width,outChannels:count,kernel,padding,stride,groups,referenceLayout:{inputShape:[1,channels,height,width],weightShape:[count,channels/groups,kernel,kernel],padding,stride,groups,biasAfterRanges}}, {signal,onSubmitted:()=>onProgress?.({phase:'vig-convolution-gpu',completed:first,total:outChannels})});
        // These seven buffers are explicitly allocated together by the ordered
        // convolution helper, then destroyed before it returns. Driver/compiler
        // residency is not inferred from these known capacities.
        writeBytes+=input.byteLength+weights.byteLength+biasPart.byteLength+64+layoutBytes;readBytes+=outputBytes;peakBufferBytes=Math.max(peakBufferBytes,bufferBytes);allocations+=7;
        return value;
      };
      try {
        let output;
        if(channels===3){
          // Native stem output channels64..79 add bias after the ordered sum
          // only in two spatial domains. Splitting output channels changes no
          // reduction order or receptive field.
          release=budget.reserve(outChannels*plane*4);output=new Float32Array(outChannels*plane);
          for(const[first,count,ranges]of [[0,64,[]],[64,16,[[0,16],[16336,16384]]]]){
            const value=await part(first,count,ranges);try{output.set(value.data,first*plane);}finally{value.release();}
          }
        } else {const value=await part(0,outChannels);output=value.data;release=value.release;}
        checkAbort(signal);onProgress?.({phase:'vig-convolution-gpu',completed:outChannels,total:outChannels});complete=true;
        return{data:output,workers:0,gpu:{devices:1,allocations,peakAccountedBytes:peakBufferBytes,accounting:'explicit GPU buffers; excludes driver/compiler residency',errors:[]},timings:{gpuWriteBytes:writeBytes,gpuReadBytes:readBytes},release};
      } finally {if(!complete)release?.();busy=false;}
    },
    async distance(inputs,options){
      requireValue(!busy&&!disposed,'VIG GPU distance unavailable');busy=true;
      try{return await vigDistanceGpu({...inputs,gpu,budget},options);}finally{busy=false;}
    },
    dispose(){requireValue(!busy,'VIG GPU convolution busy');if(disposed)return;disposed=true;gpu.dispose();}
  };
}
