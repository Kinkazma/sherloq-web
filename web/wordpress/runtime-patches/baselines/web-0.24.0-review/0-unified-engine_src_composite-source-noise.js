import {createNeuralTensor} from './neural-tensor-store.js';
import {requireValue,checkAbort} from './errors.js';
import {executionSummary} from './neural-execution-summary.js';
const MiB=1024**2,tensor=(data,dims)=>({data,dims});
export async function compositeSourceGray(surface,{budget,statistics,getTemporarySession,signal,onProgress,storage='auto',quality=0}={}){
 const {width,height}=surface.descriptor,n=width*height,gray=await createNeuralTensor(1,height,width,{budget,signal,storage:storage==='auto'?(n*4>budget.limit/12?'temporary':'memory'):storage,getTemporarySession});let curve,model=quality;
 try{
  const step=Math.max(1,Math.min(128,Math.floor(16*MiB/(width*32))));
  for(let top=0;top<height;top+=step){const rows=Math.min(step,height-top),part=await surface.readWindow({x:0,y:top,width,height:rows},{signal});let result;
   try{result=await statistics.run('prepare',{rgb:tensor(part.pixels.data,[rows,width,3])},{signal,onProgress,workspaceBytes:32*rows*width,outputBytes:4*rows*width+8192});await gray.writeRows(top,rows,result.result.gray.data,{signal});}finally{result?.release();part.release();}onProgress?.({phase:'composite-gray',completed:top+rows,total:height});
  }
  if(quality===0){
   const release=budget.reserve(n);let result;try{const bytes=new Uint8Array(n);for(let top=0;top<height;top+=step){const rows=Math.min(step,height-top),part=await gray.readRows(top,rows,{signal});try{for(let i=0;i<part.data.length;i++)bytes[top*width+i]=Math.round(part.data[i]*255);}finally{part.release();}}
    result=await statistics.run('bank:quality',{gray:tensor(bytes,[height,width])},{signal,onProgress,workspaceBytes:n*8+32*MiB,outputBytes:8192});model=result.result.model.data[0];curve=result.result.curve.data;
   }finally{result?.release();release();}
  }
  return {gray,model,curve};
 }catch(e){await gray.dispose();throw e;}
}
export async function noiseprintSurface(gray,quality,{budget,pool,getTemporarySession,signal,onProgress,backend='auto',storage='auto'}={}){
 const {width,height}=gray;requireValue(Number.isInteger(quality)&&quality>=51&&quality<=101,'Noiseprint quality must be 51–101.');
 const noise=await createNeuralTensor(1,height,width,{budget,signal,storage:storage==='auto'?(width*height*4>budget.limit/12?'temporary':'memory'):storage,getTemporarySession}),executions=executionSummary();let completed=0,subdivisions=0;
 const workers=Math.max(1,Math.min(pool.profile.maxWorkers,Math.floor((budget.limit-budget.total())/(256*MiB)))),perWorker=(budget.limit-budget.total())/workers,step=Math.max(32,Math.min(1024,Math.floor(Math.sqrt(Math.max(32**2,(perWorker-160*MiB)/9000)))-68));
 async function tile(x,y,w,h){
  checkAbort(signal);const x0=Math.max(0,x-34),y0=Math.max(0,y-34),x1=Math.min(width,x+w+34),y1=Math.min(height,y+h+34),tw=x1-x0,th=y1-y0,release=budget.reserve((tw*th+w*h)*4);let output;
  try{const input=new Float32Array(tw*th);for(let row=0;row<th;row++)await gray.readInto(input.subarray(row*tw,(row+1)*tw),(y0+row)*width+x0,{signal});
   output=await pool.run(String(quality),{gray:tensor(input,[1,1,th,tw])},{signal,onProgress,backend,workspaceBytes:tw*th*4096,outputBytes:tw*th*4});executions.add(String(quality),output.metrics);const values=output.result.noise.data,core=new Float32Array(w*h);requireValue(values.length===tw*th,'Invalid Noiseprint output geometry.');
   for(let row=0;row<h;row++){const source=(y-y0+row)*tw+x-x0;core.set(values.subarray(source,source+w),row*w);}for(const v of core)requireValue(Number.isFinite(v),'Nonfinite Noiseprint output.');await noise.writeWindow({x,y,width:w,height:h},core,{signal});completed+=w*h;onProgress?.({phase:'noiseprint',completed,total:width*height});
  }catch(e){
   if(!['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(e.code)||Math.max(w,h)<=32)throw e;output?.release();output=null;release();subdivisions++;if(w>=h){const a=Math.floor(w/2);await tile(x,y,a,h);await tile(x+a,y,w-a,h);}else{const a=Math.floor(h/2);await tile(x,y,w,a);await tile(x,y+a,w,h-a);}
  }finally{output?.release();release();}
 }
 try{
  const jobs=[];for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step)jobs.push([x,y,Math.min(step,width-x),Math.min(step,height-y)]);let at=0,failure;
  await Promise.all(Array.from({length:Math.min(workers,jobs.length)},async()=>{while(at<jobs.length&&!failure){const j=jobs[at++];try{await tile(...j);}catch(e){failure=e;}}}));if(failure)throw failure;checkAbort(signal);return {noise,executions:executions.values(),subdivisions,step,workers};
 }catch(e){await noise.dispose();throw e;}
}
