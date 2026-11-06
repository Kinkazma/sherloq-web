import {EngineError,requireValue,createCooperator,checkAbort} from './errors.js';
import {WaveletStripPool,retireWaveletPlans,appendWaveletCleanup} from './wavelet-strip-pool.js';
import {prnuPaddedLength} from './prnu.js';
import {prnuStreamMath,prnuStreamHeapBytes} from './prnu-stream-math.js';
import {createComplexPlane} from './segmented-complex-plane.js';
import {createFloatPlane} from './segmented-float-plane.js';
// SciPy's global real FFT convolution with the 3x3 all-ones kernel. The
// packed half spectrum is stored globally; all transforms span complete axes.
// accountedHeapBytes is a live caller reservation for this same native runtime.
// Its credit changes neither native dimensions nor arithmetic or sample order.
export async function segmentedPrnuCorrelation(input,{budget,signal,onProgress,blockPixels=65536,pool,accountedHeapBytes=0,...storage}={}){
 const cooperate=createCooperator(signal);
 const {width:sw,height:sh}=input,width=prnuPaddedLength(sw+2),height=prnuPaddedLength(sh+2),cw=Math.floor(width/2)+1;
 requireValue(Number.isSafeInteger(blockPixels)&&blockPixels>0&&blockPixels<=262144,'Invalid PRNU strip size.');
 requireValue(Number.isSafeInteger(accountedHeapBytes)&&accountedHeapBytes>=0,'Invalid admitted PRNU heap credit.');
 const heap=Math.max(24*1024**2,prnuStreamHeapBytes()),credit=Math.min(heap,accountedHeapBytes),room=budget.limit-budget.retained-budget.active+credit,block=Math.min(blockPixels,Math.floor((room-heap-2*1024**2)/160));if(block<2*Math.max(width,height))throw new EngineError('MEMORY_LIMIT','Two complete PRNU axes must fit.');
 const options={...storage,budget,signal,ArrayType:Float64Array,rowSlabBytes:1024**2,chunkBytes:Math.max(8192,block*16)};
 const owned=new Set(),cleanupPool=typeof pool?.ownCleanup==='function'?pool:new WaveletStripPool(budget,{workerFactory:null});
 let release,rows,columns,output,returning=false,retirementStarted=false,cleanupAcknowledged=false,failed=false,primary,lateFailed=false,latePrimary;
 const cleanup=async capture=>{
  let cleanupFailed=false,cleanupPrimary,outputAttempted=false;
  const remember=error=>{if(!cleanupFailed){cleanupFailed=true;cleanupPrimary=error;}else appendWaveletCleanup(cleanupPrimary,error);};
  const wasOwned=output&&owned.has(output);
  try{await retireWaveletPlans(owned,capture);}catch(error){remember(error);}
  if(wasOwned&&!owned.has(output))output=null;
  if(cleanupFailed)returning=false;
  const checkPublication=()=>{if(returning)try{checkAbort(signal);}catch(error){lateFailed=true;latePrimary=error;returning=false;}};
  const withdraw=async()=>{
   // An output already in owned was attempted by retireWaveletPlans above.
   // A success candidate is re-adopted before the first withdrawal await.
   if(returning||!output||outputAttempted||owned.has(output))return;
   outputAttempted=true;const value=output;owned.add(value);const one=new Set([value]);
   try{await retireWaveletPlans(one,capture);}catch(error){remember(error);}
   if(!one.has(value)){owned.delete(value);output=null;}
  };
  checkPublication();if(!returning)await withdraw();
  // These credits cover dependent intermediates. A refusal retains both the
  // registered callback and every remaining owner for an explicit retry.
  if(!cleanupFailed&&!owned.size&&release)try{await release();release=null;}catch(error){remember(error);returning=false;}
  checkPublication();if(!returning)await withdraw();
  if(cleanupFailed)throw cleanupPrimary;
  // Check inside this callback and again after the owner ACK resolves.
  // A late cancellation re-adopts the output before another retirement await.
 };
 let cleanupOwner=cleanupPool.ownCleanup(cleanup);
 const own=async create=>{const value=await create();owned.add(value);return value;};
 const drop=async value=>{if(owned.has(value)){await value.dispose();owned.delete(value);}};
 const progress=(phase,completed,total)=>onProgress?.({phase,completed,total}),step=n=>Math.max(2,Math.floor(block/n/2)*2);
 const execute=options=>pool?pool.run(options):(async()=>{for(let i=0;i<options.count;i++){checkAbort(signal);await options.consume(await options.local(await options.prepare(i)),i);}})();
 try{
  release=budget.reserve(heap-credit+block*160);
  const math=await prnuStreamMath({signal,cooperate});rows=await own(()=>createComplexPlane(cw,height,options));columns=await own(()=>createComplexPlane(cw,height,options));
  const stepY=step(width);let completed=0;
  await execute({count:Math.ceil(height/stepY),pixels:Math.min(stepY,height)*width,key:`prnu-real/${width}/${stepY}`,signal,
   prepare:async i=>{await cooperate();const y=i*stepY,h=Math.min(stepY,height-y),values=new Float64Array(h*width);if(y<sh){const source=await input.read(0,y,sw,Math.min(h,sh-y),{signal,cooperate});for(let yy=0;yy<Math.min(h,sh-y);yy++)values.set(source.subarray(yy*sw,(yy+1)*sw),yy*width);}return {op:'axis',values,length:width,lines:h,mode:0};},
   local:j=>({values:math.axis(j.values,j.length,j.lines,j.mode)}),consume:async(r,i)=>{const y=i*stepY,h=Math.min(stepY,height-y);await rows.write(r.values,0,y,cw,h,{signal,cooperate});completed+=h;progress('prnu-fft-rows',completed,height);}
  });
  // Kernel rows are identical for y=0,1,2 and zero elsewhere. Compute the
  // native real transform, then the actual full complex column transform.
  const kernelInput=new Float64Array(width*2);kernelInput.fill(1,0,3);kernelInput.fill(1,width,width+3);const kernelRow=math.axis(kernelInput,width,2,0).slice(0,cw*2),stepX=step(height);completed=0;
  await execute({count:Math.ceil(cw/stepX),pixels:Math.min(stepX,cw)*height,key:`prnu-convolution/${height}/${stepX}`,signal,
   prepare:async i=>{await cooperate();const x=i*stepX,w=Math.min(stepX,cw-x),source=await rows.read(x,0,w,height,{signal,cooperate}),values=new Float64Array(source.length),kernel=new Float64Array(source.length);for(let xx=0;xx<w;xx++)for(let y=0;y<height;y++){const a=(y*w+xx)*2,b=(xx*height+y)*2;values[b]=source[a];values[b+1]=source[a+1];if(y<3){kernel[b]=kernelRow[(x+xx)*2];kernel[b+1]=kernelRow[(x+xx)*2+1];}}return {op:'convolution',values,kernel,length:height,lines:w};},
   local:j=>({values:math.axis(math.multiply(math.axis(j.values,j.length,j.lines,1),math.axis(j.kernel,j.length,j.lines,1)),j.length,j.lines,2)}),consume:async(r,i)=>{const x=i*stepX,w=Math.min(stepX,cw-x),values=new Float64Array(r.values.length);for(let xx=0;xx<w;xx++)for(let y=0;y<height;y++){const a=(y*w+xx)*2,b=(xx*height+y)*2;values[a]=r.values[b];values[a+1]=r.values[b+1];}await columns.write(values,x,0,w,height,{signal,cooperate});completed+=w;progress('prnu-fft-columns',completed,cw);}
  });
  await drop(rows);rows=null;output=await own(()=>createFloatPlane(sw,sh,options));completed=0;
  await execute({count:Math.ceil(height/stepY),pixels:Math.min(stepY,height)*width,key:`prnu-inverse/${width}/${stepY}`,signal,
   prepare:async i=>{await cooperate();const y=i*stepY,h=Math.min(stepY,height-y);return {op:'axis',values:await columns.read(0,y,cw,h,{signal,cooperate}),length:width,lines:h,mode:3,factor:1/(width*height)};},
   local:j=>({values:math.axis(j.values,j.length,j.lines,j.mode,j.factor)}),consume:async(r,i)=>{const y=i*stepY,h=Math.min(stepY,height-y),start=Math.max(1,y),end=Math.min(sh+1,y+h);if(end>start){const values=new Float64Array(sw*(end-start));for(let yy=start;yy<end;yy++)values.set(r.values.subarray((yy-y)*width+1,(yy-y)*width+sw+1),(yy-start)*sw);await output.write(values,0,start-1,sw,end-start,{signal,cooperate});}completed+=h;progress('prnu-fft-inverse',completed,height);}
  });
  await output.store.flush();checkAbort(signal);returning=true;owned.delete(output);retirementStarted=true;
  await cleanupOwner.retire();cleanupAcknowledged=true;checkAbort(signal);if(lateFailed)throw latePrimary;return output;
 }catch(error){failed=true;primary=lateFailed?latePrimary:error;returning=false;if(lateFailed&&!Object.is(error,latePrimary))appendWaveletCleanup(primary,error);if(cleanupAcknowledged){cleanupOwner=cleanupPool.ownCleanup(cleanup);if(output)owned.add(output);retirementStarted=false;}throw primary;}
 finally{if(!retirementStarted){retirementStarted=true;try{await cleanupOwner.retire({endpoints:failed});}catch(cleanup){if(failed)appendWaveletCleanup(primary,cleanup);else throw cleanup;}}}
}
