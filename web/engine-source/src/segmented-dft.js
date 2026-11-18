import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {frequencyStreamMath,frequencyStreamHeapBytes} from './frequency-stream-math.js';
import {createComplexPlane,createDftMagnitudePlane} from './segmented-complex-plane.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {withRetirementOwner} from './owner-retirement-error.js';
// A real or complex global plane is read in complete axes. Forward Hermitian
// completion and inverse scaling use full-image dimensions, never strip sizes.
export async function segmentedDft(input,{inverse=false,inverseMagnitude=null,budget,signal,onProgress,blockPixels=262144,pool,cooperate,...storage}={}){
 const {width,height}=input;requireValue(Number.isSafeInteger(blockPixels)&&blockPixels>0&&blockPixels<=262144,'Invalid DFT strip size.');
 requireValue(!inverseMagnitude||inverse&&[inverseMagnitude.width,inverseMagnitude.height].every(Number.isSafeInteger)&&inverseMagnitude.width>0&&inverseMagnitude.height>0&&inverseMagnitude.width<=width&&inverseMagnitude.height<=height,'Invalid inverse magnitude domain.');
 requireValue(cooperate===undefined||typeof cooperate==='function','Invalid DFT cooperator.');const checkpoint=cooperate?async()=>{checkAbort(signal);await cooperate(signal);checkAbort(signal);}:()=>controlCheckpoint(signal);
 const heap=Math.max(8*1024**2,frequencyStreamHeapBytes()),room=budget.limit-budget.retained-budget.active,block=Math.min(blockPixels,Math.floor((room-Math.max(heap,Math.min(24*1024**2,room/2))-4*1024**2)/128));if(block<Math.max(width,height))throw new EngineError('MEMORY_LIMIT','One full DFT axis must fit.');
 const release=budget.reserve(heap+block*128),options={...storage,budget,signal,chunkBytes:Math.max(8192,block*8),rowSlabBytes:storage.rowSlabBytes??0,temporaryTileSize:storage.temporaryTileSize??128};let rows,output,done=false,failed=false,primary;
 const progress=(phase,completed,total)=>onProgress?.({phase,completed,total});
 const execute=options=>pool?pool.run(options):(async()=>{for(let i=0;i<options.count;i++){checkAbort(signal);await options.consume(await options.local(await options.prepare(i)),i);}})();
 try{
  const math=await frequencyStreamMath();rows=await createComplexPlane(width,height,options);output=await (inverseMagnitude?createDftMagnitudePlane:createComplexPlane)(width,height,options);
  if(inverseMagnitude){output.magnitudeStats={minimum:Infinity,maximum:-Infinity};output.magnitudeStripJobs=0;}
  if(width===1&&!inverse){const values=Float32Array.from(await input.read(0,0,1,height,{signal,cooperate})),r=math.axis(values,height,1,1,0);for(let y=Math.floor(height/2)+1;y<height;y++){r[y*2]=r[(height-y)*2];r[y*2+1]=-r[(height-y)*2+1];}await output.write(r,0,0,1,height,{signal,cooperate});}
  else{
   const step=Math.max(1,Math.floor(block/width));
   let completed=0;await execute({count:Math.ceil(height/step),pixels:Math.min(step,height)*width,key:`dft-rows/${inverse}/${width}/${step}`,signal,
    prepare:async i=>{await checkpoint();const y=i*step,h=Math.min(step,height-y),values=await input.read(0,y,width,h,{signal,cooperate});return {op:'axis',values:values instanceof Float32Array?values:Float32Array.from(values),length:width,lines:h,globalCount:height,mode:inverse?2:0};},
    local:j=>({values:math.axis(j.values,j.length,j.lines,j.globalCount,j.mode)}),consume:async(r,i)=>{const y=i*step,h=Math.min(step,height-y);await rows.write(r.values,0,y,width,h,{signal,cooperate});completed+=h;progress('dft-rows',completed,height);}
   });
   const total=inverse?width:Math.floor(width/2)+1,stepX=Math.max(1,Math.floor(block/height));
   completed=0;await execute({count:Math.ceil(total/stepX),pixels:Math.min(stepX,total)*height,key:`dft-columns/${inverse}/${height}/${stepX}`,signal,
    prepare:async i=>{await checkpoint();const x=i*stepX,w=Math.min(stepX,total-x),values=await rows.read(x,0,w,height,{signal,cooperate}),columns=new Float32Array(values.length);for(let xx=0;xx<w;xx++)for(let y=0;y<height;y++){const a=(y*w+xx)*2,b=(xx*height+y)*2;columns[b]=values[a];columns[b+1]=values[a+1];}return {op:inverseMagnitude?'axis-magnitude':'axis',values:columns,length:height,lines:w,globalCount:width,mode:inverse?3:1,offset:x,crop:inverseMagnitude};},
    local:j=>inverseMagnitude?math.axisMagnitude(j.values,j.length,j.lines,j.globalCount,j.offset,j.crop):{values:math.axis(j.values,j.length,j.lines,j.globalCount,j.mode)},consume:async(r,i)=>{const x=i*stepX,w=Math.min(stepX,total-x),components=inverseMagnitude?1:2,values=new Float32Array(r.values.length);for(let xx=0;xx<w;xx++)for(let y=0;y<height;y++){const a=(y*w+xx)*components,b=(xx*height+y)*components;values[a]=r.values[b];if(components===2)values[a+1]=r.values[b+1];}await output.write(values,x,0,w,height,{signal,cooperate});completed+=w;progress('dft-columns',completed,total);if(inverseMagnitude){output.magnitudeStats.minimum=Math.min(output.magnitudeStats.minimum,r.minimum);output.magnitudeStats.maximum=Math.max(output.magnitudeStats.maximum,r.maximum);output.magnitudeStripJobs++;progress('frequency-reconstruction',completed,total);}}
   });
   if(!inverse&&total<width){
    // y=0 mirrors itself; all other source rows form contiguous, reversed
    // bands. Bound both arrays by the already-admitted strip workspace.
    const missing=width-total,stepY=Math.max(1,Math.floor(block/missing));
    progress('dft-hermitian',0,height);
    for(let y=0;y<height;){
     await checkpoint();const h=y===0?1:Math.min(stepY,height-y),top=y===0?0:height-y-h+1,values=await output.read(1,top,missing,h,{signal,cooperate}),tail=new Float32Array(values.length);
     for(let row=0;row<h;row++)for(let x=0;x<missing;x++){const a=(row*missing+x)*2,b=((y===0?0:h-1-row)*missing+missing-1-x)*2;tail[a]=values[b];tail[a+1]=-values[b+1];}
     await output.write(tail,total,y,missing,h,{signal,cooperate});y+=h;progress('dft-hermitian',y,height);
    }
   }
  }
  progress('dft-flush',0,1);await output.store.flush();checkAbort(signal);progress('dft-flush',1,1);done=true;return output;
 }catch(error){failed=true;primary=error;throw error;}
 finally{
  let refused=false,failure;
  try{await retireCompositeOwners([()=>rows?.dispose(),...(!done?[()=>output?.dispose()]:[])],failed?{primary,requireAck:true}:{requireAck:true});}
  catch(error){refused=true;failure=error;}
  if(refused&&done){
   // A result cannot be handed back when an intermediate refused retirement.
   // Retire that unreturned output independently, keeping both retry owners.
   try{await retireCompositeOwners([()=>output?.dispose()],{primary:failure,requireAck:true});}
   catch(error){failure=error;}
  }
  if(!refused)release();
  else{
   const pending=failure.cleanupOwner;let flight,released=false;
   const owner={dispose(){if(flight)return flight;const task=(async()=>{try{await pending.dispose();if(!released){release();released=true;}}catch(error){throw withRetirementOwner(error,owner,error);}})();flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;}};
   throw withRetirementOwner(failure,owner,failure);
  }
 }
}
