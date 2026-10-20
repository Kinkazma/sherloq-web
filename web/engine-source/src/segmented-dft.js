import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {frequencyStreamMath,frequencyStreamHeapBytes} from './frequency-stream-math.js';
import {createComplexPlane} from './segmented-complex-plane.js';
// A real or complex global plane is read in complete axes. Forward Hermitian
// completion and inverse scaling use full-image dimensions, never strip sizes.
export async function segmentedDft(input,{inverse=false,budget,signal,onProgress,blockPixels=262144,pool,...storage}={}){
 const {width,height}=input;requireValue(Number.isSafeInteger(blockPixels)&&blockPixels>0&&blockPixels<=262144,'Invalid DFT strip size.');
 const heap=Math.max(8*1024**2,frequencyStreamHeapBytes()),room=budget.limit-budget.retained-budget.active,block=Math.min(blockPixels,Math.floor((room-Math.max(heap,Math.min(24*1024**2,room/2))-4*1024**2)/128));if(block<Math.max(width,height))throw new EngineError('MEMORY_LIMIT','One full DFT axis must fit.');
 const release=budget.reserve(heap+block*128),options={...storage,budget,signal,chunkBytes:Math.max(8192,block*8)};let rows,output,done=false;
 const progress=(phase,completed,total)=>onProgress?.({phase,completed,total});
 const execute=options=>pool?pool.run(options):(async()=>{for(let i=0;i<options.count;i++){checkAbort(signal);await options.consume(await options.local(await options.prepare(i)),i);}})();
 try{
  const math=await frequencyStreamMath();rows=await createComplexPlane(width,height,options);output=await createComplexPlane(width,height,options);
  if(width===1&&!inverse){const values=Float32Array.from(await input.read(0,0,1,height,{signal})),r=math.axis(values,height,1,1,0);for(let y=Math.floor(height/2)+1;y<height;y++){r[y*2]=r[(height-y)*2];r[y*2+1]=-r[(height-y)*2+1];}await output.write(r,0,0,1,height,{signal});}
  else{
   const step=Math.max(1,Math.floor(block/width));
   let completed=0;await execute({count:Math.ceil(height/step),pixels:Math.min(step,height)*width,key:`dft-rows/${inverse}/${width}/${step}`,signal,
    prepare:async i=>{await controlCheckpoint(signal);const y=i*step,h=Math.min(step,height-y);return {op:'axis',values:Float32Array.from(await input.read(0,y,width,h,{signal})),length:width,lines:h,globalCount:height,mode:inverse?2:0};},
    local:j=>({values:math.axis(j.values,j.length,j.lines,j.globalCount,j.mode)}),consume:async(r,i)=>{const y=i*step,h=Math.min(step,height-y);await rows.write(r.values,0,y,width,h,{signal});completed+=h;progress('dft-rows',completed,height);}
   });
   const total=inverse?width:Math.floor(width/2)+1,stepX=Math.max(1,Math.floor(block/height));
   completed=0;await execute({count:Math.ceil(total/stepX),pixels:Math.min(stepX,total)*height,key:`dft-columns/${inverse}/${height}/${stepX}`,signal,
    prepare:async i=>{await controlCheckpoint(signal);const x=i*stepX,w=Math.min(stepX,total-x),values=await rows.read(x,0,w,height,{signal}),columns=new Float32Array(values.length);for(let xx=0;xx<w;xx++)for(let y=0;y<height;y++){const a=(y*w+xx)*2,b=(xx*height+y)*2;columns[b]=values[a];columns[b+1]=values[a+1];}return {op:'axis',values:columns,length:height,lines:w,globalCount:width,mode:inverse?3:1};},
    local:j=>({values:math.axis(j.values,j.length,j.lines,j.globalCount,j.mode)}),consume:async(r,i)=>{const x=i*stepX,w=Math.min(stepX,total-x),values=new Float32Array(r.values.length);for(let xx=0;xx<w;xx++)for(let y=0;y<height;y++){const a=(y*w+xx)*2,b=(xx*height+y)*2;values[a]=r.values[b];values[a+1]=r.values[b+1];}await output.write(values,x,0,w,height,{signal});completed+=w;progress('dft-columns',completed,total);}
   });
   if(!inverse&&total<width){
    // y=0 mirrors itself; all other source rows form contiguous, reversed
    // bands. Bound both arrays by the already-admitted strip workspace.
    const missing=width-total,stepY=Math.max(1,Math.floor(block/missing));
    progress('dft-hermitian',0,height);
    for(let y=0;y<height;){
     await controlCheckpoint(signal);const h=y===0?1:Math.min(stepY,height-y),top=y===0?0:height-y-h+1,values=await output.read(1,top,missing,h,{signal}),tail=new Float32Array(values.length);
     for(let row=0;row<h;row++)for(let x=0;x<missing;x++){const a=(row*missing+x)*2,b=((y===0?0:h-1-row)*missing+missing-1-x)*2;tail[a]=values[b];tail[a+1]=-values[b+1];}
     await output.write(tail,total,y,missing,h,{signal});y+=h;progress('dft-hermitian',y,height);
    }
   }
  }
  progress('dft-flush',0,1);await output.store.flush();checkAbort(signal);progress('dft-flush',1,1);done=true;return output;
 }finally{await rows?.dispose();if(!done)await output?.dispose();release();}
}
