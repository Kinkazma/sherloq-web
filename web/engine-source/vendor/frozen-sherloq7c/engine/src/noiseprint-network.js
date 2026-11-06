import {EngineError,checkAbort,requireValue} from './errors.js';
/** Every output pixel uses the original 17-layer receptive field. Memory
 * subdivision retains the native 34-pixel halo and source-image boundaries. */
export async function noiseprintResidual(gray,width,height,quality,{budget,pool,signal,onProgress,backend='auto'}={}){
 requireValue(gray instanceof Float32Array&&gray.length===width*height,'Invalid Noiseprint gray image.');
 requireValue(Number.isInteger(quality)&&quality>=51&&quality<=101,'Noiseprint quality must be 51–101.');
 const release=budget.reserve(width*height*4),result=new Float32Array(width*height);let done=0,subdivisions=0;
 async function tile(x,y,w,h){
  checkAbort(signal);const x0=Math.max(0,x-34),y0=Math.max(0,y-34),x1=Math.min(width,x+w+34),y1=Math.min(height,y+h+34),tw=x1-x0,th=y1-y0;
  let inputLease,output;
  try{
   inputLease=budget.reserve(tw*th*4);const data=new Float32Array(tw*th);
   for(let row=0;row<th;row++)data.set(gray.subarray((y0+row)*width+x0,(y0+row)*width+x1),row*tw);
   output=await pool.run(String(quality),{gray:{data,dims:[1,1,th,tw]}},{signal,onProgress,backend,workspaceBytes:tw*th*4096,outputBytes:tw*th*4});
   const values=output.result.noise.data;requireValue(values instanceof Float32Array&&values.length===tw*th,'Invalid Noiseprint output.');
   for(let row=0;row<h;row++){
    const source=(y-y0+row)*tw+x-x0;
    for(let col=0;col<w;col++)requireValue(Number.isFinite(values[source+col]),'Noiseprint returned nonfinite values.');
    result.set(values.subarray(source,source+w),(y+row)*width+x);
   }
   done+=w*h;onProgress?.({phase:'noiseprint',completed:done,total:width*height,fraction:done/(width*height)});
  }catch(error){
   if(!['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error.code)||Math.max(w,h)<=32)throw error;
   output?.release();output=null;inputLease?.();inputLease=null;subdivisions++;
   // Sequential fallback avoids retaining two failed large preparations.
   // Independent native tiles are already scheduled concurrently below.
   if(w>=h){const half=Math.floor(w/2);await tile(x,y,half,h);await tile(x+half,y,w-half,h);}
   else{const half=Math.floor(h/2);await tile(x,y,w,half);await tile(x,y+half,w,h-half);}
  }finally{output?.release();inputLease?.();}
 }
 try{
  const step=width*height>1050000?1024:Math.max(width,height),jobs=[];
  for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step)jobs.push([x,y,Math.min(step,width-x),Math.min(step,height-y)]);
  let next=0,error;await Promise.all(Array.from({length:Math.min(jobs.length,pool.profile.maxWorkers)},async()=>{while(next<jobs.length&&!error){const job=jobs[next++];try{await tile(...job);}catch(e){error=e;}}}));
  if(error)throw error;checkAbort(signal);return {data:result,width,height,subdivisions,release};
 }catch(e){release();throw e;}
}
