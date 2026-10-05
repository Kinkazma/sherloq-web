import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,controlCheckpoint,checkAbort} from './errors.js';
import {resamplingStreamMath,resamplingStreamHeapBytes} from './resampling-stream-math.js';
import {createComplexPlane} from './segmented-complex-plane.js';
export async function segmentedResamplingFft(input,{budget,signal,onProgress,blockPixels=65536,pool,...storage}={}){
 const {width,height}=input;requireValue(width<=16384&&height<=16384,'Resampling FFT exceeds the native adapter axis limit.');
 const heap=Math.max(12*1024**2,resamplingStreamHeapBytes()),room=budget.limit-budget.retained-budget.active,block=Math.min(blockPixels,Math.floor((room-heap-2*1024**2)/128));if(block<Math.max(width,height))throw new EngineError('MEMORY_LIMIT','One full resampling FFT axis must fit.');
 const release=budget.reserve(heap+block*128);let output,done=false;
 const execute=options=>pool?pool.run(options):(async()=>{for(let i=0;i<options.count;i++){checkAbort(signal);await options.consume(await options.local(await options.prepare(i)),i);}})();
 try{const math=await resamplingStreamMath();output=await createComplexPlane(width,height,{...storage,budget,signal,ArrayType:Float64Array,chunkBytes:Math.max(8192,block*16)});
  for(const axis of [1,0]){const length=axis?width:height,total=axis?height:width,step=Math.max(1,Math.floor(block/length));let completed=0;
   await execute({count:Math.ceil(total/step),pixels:Math.min(step,total)*length,key:`resampling-fft/${axis}/${length}/${step}`,signal,
    prepare:async i=>{await controlCheckpoint(signal);const at=i*step,n=Math.min(step,total-at);let values;if(axis)values=await input.read(0,at,width,n,{signal});else{const source=await output.read(at,0,n,height,{signal});values=new Float64Array(source.length);for(let x=0;x<n;x++)for(let y=0;y<height;y++){const a=(y*n+x)*2,b=(x*height+y)*2;values[b]=source[a];values[b+1]=source[a+1];}}return {op:'axis',values,length,lines:n,real:!!axis};},
    local:j=>({values:math.axis(j.values,j.length,j.lines,j.real)}),consume:async(r,i)=>{const at=i*step,n=Math.min(step,total-at);if(axis)await output.write(r.values,0,at,width,n,{signal});else{const values=new Float64Array(r.values.length);for(let x=0;x<n;x++)for(let y=0;y<height;y++){const a=(y*n+x)*2,b=(x*height+y)*2;values[a]=r.values[b];values[a+1]=r.values[b+1];}await output.write(values,at,0,n,height,{signal});}completed+=n;onProgress?.({phase:axis?'resampling-fft-rows':'resampling-fft-columns',completed,total});}
   });
  }await output.store.flush();checkAbort(signal);done=true;return output;
 }finally{if(!done)await output?.dispose();release();}
}
