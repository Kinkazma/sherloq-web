import {requireValue,checkAbort,controlCheckpoint} from '../../src/errors.js';

// Dot products only: normalization, norm sums, TopK (including tie order),
// dilation and max-relative gather retain the existing native WASM arithmetic.
export async function vigDistanceGpu({gpu,budget,normal,sums},{signal,onProgress}={}){
  requireValue(normal instanceof Float32Array&&normal.length===640*256&&sums instanceof Float32Array&&sums.length===256&&sums.every(Number.isFinite),'Pinned VIG distance tensors');checkAbort(signal);
  let staging,release,result,complete=false;
  try{
    staging=budget.reserve((640*256+256)*4);release=budget.reserve(256**2*4);
    const weights=new Float32Array(256*640),bias=new Float32Array(256),data=new Float32Array(256**2);let stamp=performance.now();
    for(let j=0;j<256;j++){
      for(let c=0;c<640;c++)weights[j*640+c]=normal[c*256+j];
      if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}
    }
    // The existing 640/1 pipeline is shared with VIG convolutions. Zero bias
    // plus hasBias:true retains all 640 zero-initialized, ordered FMA steps.
    result=await gpu.run({input:normal,weights,bias,channels:640,height:16,width:16,outChannels:256,kernel:1,hasBias:true},{signal,onSubmitted:()=>onProgress?.({phase:'vig-distance-gpu',completed:0,total:256})});
    checkAbort(signal);stamp=performance.now();
    for(let i=0;i<256;i++){
      for(let j=0;j<256;j++){
        let value=Math.fround(result.data[j*256+i]*-2);
        value=Math.fround(sums[i]+value);value=Math.fround(value+sums[j]);
        data[i*256+j]=-value;
      }
      if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}
    }
    checkAbort(signal);complete=true;
    return{data,gpu:{devices:1,allocations:7,peakAccountedBytes:1836104,accounting:'explicit GPU buffers; shared device with convolutions, excludes driver/compiler residency',errors:[]},timings:{gpuWriteBytes:1311816,gpuReadBytes:262144},release};
  }finally{result?.release();staging?.();if(!complete)release?.();}
}
