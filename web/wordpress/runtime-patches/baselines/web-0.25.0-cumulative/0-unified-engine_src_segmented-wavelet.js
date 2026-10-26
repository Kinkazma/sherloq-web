import {WaveletStripPool} from './wavelet-strip-pool.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {waveletParams} from './wavelets.js';
import {waveletStreamMath,waveletStreamHeapBytes} from './wavelet-stream-math.js';
import {createFloatPlane} from './segmented-float-plane.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';

export async function segmentedWavelet(image,params,{budget,signal,onProgress,cache,blockPixels=65536,storage='auto',profile={}}={}){
 const p=waveletParams(params),{width,height}=image.surface.descriptor;
 requireValue(Number.isInteger(blockPixels)&&blockPixels>0&&blockPixels<=262144,'Invalid wavelet strip size.');
 if(cache&&cache.wavelet!==p.wavelet)throw new EngineError('INVALID_INPUT','Wavelet cache does not match.');
 const heap=Math.max(8*1024**2,waveletStreamHeapBytes()),room=budget.limit-budget.retained-budget.active;
 const block=Math.min(blockPixels,Math.floor((room-heap-4*1024**2)/192));
 if(block<Math.max(width,height))throw new EngineError('MEMORY_LIMIT','One complete wavelet axis must fit in the streaming workspace.');
 const release=budget.reserve(heap+block*192),owned=new Set(),pool=new WaveletStripPool(budget,{...profile,adaptive:image.waveletScheduling??=(new Map())});let output,newCache;
 const coefficientStorage=storage==='auto'&&image.ensureTemporarySession&&width*height*16>(room-heap-block*192)/3?'temporary':storage;
 const options={budget,signal,storage:coefficientStorage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,chunkBytes:Math.max(8192,block*8)};
 const plane=async(w,h)=>{const v=await createFloatPlane(w,h,options);owned.add(v);return v;};
 const drop=async v=>{if(owned.delete(v))await v.dispose();};
 const progress=(phase,completed,total)=>onProgress?.({phase,completed,total});
 try{
  const math=await waveletStreamMath(),info=math.info(p.wavelet,width,height),filter=info.filterLength;
  const down=async(input,axis,label)=>{
   const w=axis===1?Math.floor((input.width+filter-1)/2):input.width,h=axis===0?Math.floor((input.height+filter-1)/2):input.height;
   const a=await plane(w,h),d=await plane(w,h),span=axis===0?input.height:input.width,total=axis===0?input.width:input.height,step=Math.max(1,Math.floor(block/span));
   const job=i=>{const at=i*step,n=Math.min(step,total-at);return {x:axis===0?at:0,y:axis===0?0:at,iw:axis===0?n:input.width,ih:axis===0?input.height:n};};let completed=0;
   await pool.run({count:Math.ceil(total/step),pixels:Math.max(step*span,step*(axis===0?h:w)*2),key:`down/${p.wavelet}/${axis}/${span}/${step}`,signal,
    prepare:async i=>{await controlCheckpoint(signal);const j=job(i);return {op:'down',values:await input.read(j.x,j.y,j.iw,j.ih,{signal}),width:j.iw,height:j.ih,wavelet:p.wavelet,axis};},
    local:r=>math.down(r.values,r.width,r.height,r.wavelet,r.axis),consume:async(result,i)=>{const j=job(i);await a.write(result.a,j.x,j.y,result.width,result.height,{signal});await d.write(result.d,j.x,j.y,result.width,result.height,{signal});completed+=axis===0?j.iw:j.ih;progress(label,completed,total);}
   });return [a,d];
  };
  const up=async(a,d,axis,thresholdA,thresholdD,label)=>{
   const iw=d.width,ih=d.height,w=axis===1?2*iw-filter+2:iw,h=axis===0?2*ih-filter+2:ih,out=await plane(w,h);
   const span=axis===0?ih:iw,total=axis===0?iw:ih,step=Math.max(1,Math.floor(block/span));
   const job=i=>{const at=i*step,n=Math.min(step,total-at);return {x:axis===0?at:0,y:axis===0?0:at,sw:axis===0?n:iw,sh:axis===0?ih:n};};let completed=0;
   await pool.run({count:Math.ceil(total/step),pixels:Math.max(step*span,step*(axis===0?h:w)),key:`up/${p.wavelet}/${axis}/${span}/${step}`,signal,
    prepare:async i=>{await controlCheckpoint(signal);const j=job(i);return {op:'up',a:await a.read(j.x,j.y,j.sw,j.sh,{signal}),d:await d.read(j.x,j.y,j.sw,j.sh,{signal}),width:j.sw,height:j.sh,wavelet:p.wavelet,axis,thresholdA,thresholdD,maximumA:a.maximum,maximumD:d.maximum,percent:p.threshold,mode:p.mode};},
    local:r=>{if(r.thresholdA)math.threshold(r.a,r.maximumA,r.percent,r.mode);if(r.thresholdD)math.threshold(r.d,r.maximumD,r.percent,r.mode);return math.up(r.a,r.d,r.width,r.height,r.wavelet,r.axis);},
    consume:async(r,i)=>{const j=job(i);await out.write(r.values,j.x,j.y,r.width,r.height,{signal});completed+=axis===0?j.sw:j.sh;progress(label,completed,total);}
   });return out;
  };
  if(!cache){
   let a=await plane(width,height);const rows=Math.max(1,Math.floor(block/width));
   for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const h=Math.min(rows,height-y),part=await image.surface.readWindow({x:0,y,width,height:h},{signal});try{const values=new Float64Array(width*h);for(let i=0;i<values.length;i++)values[i]=part.pixels.data[i*3+2];await a.write(values,0,y,width,h,{signal});}finally{part.release();}progress('blue-channel',Math.min(y+rows,height),height);}
   const details=[];
   for(let level=0;level<info.maximumLevel;level++){
    const [lo,hi]=await down(a,0,`decompose-${level}-vertical`);await drop(a);
    const [ll,v]=await down(lo,1,`decompose-${level}-low`);await drop(lo);
    const [h,d]=await down(hi,1,`decompose-${level}-high`);await drop(hi);
    details.push([h,v,d]);a=ll;
   }
   const planes=[a,...details.flat()];let disposed=false;
   newCache={wavelet:p.wavelet,width,height,maximumLevel:info.maximumLevel,a,details,async dispose(){if(disposed)return;disposed=true;await Promise.all(planes.map(v=>v.dispose()));}};cache=newCache;
  }
  let a=cache.a;const maximum=cache.maximumLevel,level=p.threshold===0?0:Math.min(p.level??(maximum?Math.max(1,Math.floor(maximum/2)):0),maximum);
  for(let i=maximum-1;i>=0;i--){
   const [h,v,d]=cache.details[i],threshold=i<level&&p.threshold>0;
   const lo=await up(a,v,1,false,threshold,`reconstruct-${i}-low`);
   const hi=await up(h,d,1,threshold,threshold,`reconstruct-${i}-high`);
   const next=await up(lo,hi,0,false,false,`reconstruct-${i}-vertical`);
   // Coefficients survive view changes. Only reconstructed approximations die.
   if(a!==cache.a)await drop(a);await drop(lo);await drop(hi);a=next;
  }
  output=await createSegmentedBytes(width*height*3,{...options,storage});const rows=Math.max(1,Math.floor(block/width));
  for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const h=Math.min(rows,height-y),values=await a.read(0,y,width,h,{signal}),bytes=new Uint8Array(values.length*3);for(let i=0;i<values.length;i++)bytes.fill(values[i],i*3,i*3+3);await output.write(bytes,y*width*3);progress('render',Math.min(height,y+rows),height);}
  await output.flush();checkAbort(signal);
  if(newCache)for(const v of [cache.a,...cache.details.flat()])owned.delete(v);
  const surface=createRgbSurface(output,{width,height,budget});output=null;
  return {surface,waveletCache:cache,data:{width,height,wavelet:p.wavelet,maximumLevel:maximum,effectiveLevel:level},semantics:'Native blue channel, global symmetric float64 PyWavelets axes and per-band thresholds; segmented reconstruction cropped and truncated to RGB8.',metrics:{...pool.metrics(),blockPixels:block,coefficientsCached:!newCache,maximumLevel:maximum,retainedResultBytes:width*height*3}};
 }catch(error){await output?.dispose();throw error;}finally{pool.clear();await Promise.all([...owned].map(v=>v.dispose()));release();}
}
