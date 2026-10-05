import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {pcaParams} from './pca.js';
import {pcaStreamMath,pcaStreamHeapBytes} from './pca-stream-math.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';

// Row-major oriented traversal is part of the floating-point contract. Never
// combine per-tile covariance sums: feed each pixel to the same global sums.
export async function segmentedPca(image,params,{budget,signal,onProgress,basis:cachedBasis,blockPixels:requestedBlock=65536,storage='auto'}={}){
 const p=pcaParams(params),descriptor=image.surface.descriptor,width=descriptor.width,height=descriptor.height,n=width*height;
 requireValue(Number.isSafeInteger(n)&&n>0&&Number.isInteger(requestedBlock)&&requestedBlock>=1&&requestedBlock<=262144,'Invalid PCA surface or block size.');
 const mode=['distance','project','crossprod'].indexOf(p.mode),channels=mode===2?3:1;
 const room=budget.limit-budget.retained-budget.active,block=Math.min(requestedBlock,Math.floor((room-12*1024**2)/144));
 if(block<1)throw new EngineError('MEMORY_LIMIT','PCA minimum streaming workspace does not fit.');
 let reservation=budget.reserve(Math.max(8*1024**2,pcaStreamHeapBytes())+block*64),raw,output,planning;
 const progress=(phase,done,total)=>onProgress?.({phase,completed:done,total});
 const visit=async(fn,phase)=>{
  let done=0;
  for(let y=0;y<height;){
   const rows=Math.min(height-y,Math.max(1,Math.floor(block/width)));
   if(width<=block){
    const part=await image.surface.readWindow({x:0,y,width,height:rows},{signal});
    try{await fn(part.pixels.data,y*width);}finally{part.release();}
    y+=rows;done=y*width;progress(phase,done,n);
   }else{
    for(let x=0;x<width;x+=block){
     const part=await image.surface.readWindow({x,y,width:Math.min(block,width-x),height:1},{signal});
     try{await fn(part.pixels.data,y*width+x);}finally{part.release();}
     done=y*width+Math.min(width,x+block);progress(phase,done,n);
    }y++;
   }
   await controlCheckpoint(signal);
  }
 };
 const store=async(bytes)=>{
  // Keep room for input window/I/O after automatic storage selection.
  planning=budget.reserve(block*8+2*1024**2);
  try{return await createSegmentedBytes(bytes,{budget,chunkBytes:Math.max(24,block*channels*8),storage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});}
  finally{planning();planning=null;}
 };
 try{
  const math=await pcaStreamMath();checkAbort(signal);let basis=cachedBasis;
  if(!basis){
   let sums=new Float64Array(3);await visit(bytes=>{sums=math.mean(bytes,sums);},'mean');
   const mean=Float64Array.from(sums,v=>v*(1/n));let cov=new Float64Array(9);
   const repeats=n<3?3:1;
   for(let repeat=0;repeat<repeats;repeat++)await visit(bytes=>{cov=math.covariance(bytes,mean,cov);},'covariance');
   basis=math.finish(mean,cov,n*repeats);
  }
  requireValue(basis instanceof Float64Array&&basis.length===15&&basis.every(Number.isFinite),'Invalid PCA basis.');
  raw=await store(n*channels*8);const limits=new Float64Array(channels*2);
  for(let c=0;c<channels;c++){limits[2*c]=Infinity;limits[2*c+1]=-Infinity;}
  await visit(async(bytes,offset)=>{
   const values=math.project(bytes,basis,p.component,mode);
   for(let i=0;i<values.length;i++){const c=i%channels;limits[2*c]=Math.min(limits[2*c],values[i]);limits[2*c+1]=Math.max(limits[2*c+1],values[i]);}
   await raw.write(new Uint8Array(values.buffer),offset*channels*8);
  },'projection');
  await raw.flush();output=await store(n*3);const histogram=new Float64Array(768);
  await raw.visit(async(bytes,offset)=>{
   const values=new Float64Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/8),pixels=math.normalize(values,channels,limits,n,p.invert);
   if(p.equalize)for(let i=0;i<pixels.length;i++)histogram[(i%3)*256+pixels[i]]++;
   await output.write(pixels,offset/(channels*8)*3);progress('normalize',(offset+bytes.length)/(channels*8),n);
  },{signal,blockBytes:block*channels*8});
  await raw.dispose();raw=null;
  if(p.equalize){
   const lut=math.lut(histogram,n);
   await output.visit(async(bytes,offset)=>{for(let i=0;i<bytes.length;i++)bytes[i]=lut[(i%3)*256+bytes[i]];await output.write(bytes,offset);progress('equalize',(offset+bytes.length)/3,n);},{signal,blockBytes:block*3});
  }
  await output.flush();checkAbort(signal);
  const surface=createRgbSurface(output,{width,height,orientation:1,budget});
  return {surface,basis:basis.slice(),data:{channelOrder:'BGR',mean:basis.slice(0,3),eigenvectors:basis.slice(3,12),eigenvalues:basis.slice(12,15)},semantics:'Native ordered float64 PCA; global mean/covariance, extrema and histogram with segmented projection/output.',metrics:{blockPixels:block,storage:output.storage,basisCached:!!cachedBasis,retainedResultBytes:n*3}};
 }catch(error){await raw?.dispose();await output?.dispose();throw error;}finally{planning?.();reservation();}
}
