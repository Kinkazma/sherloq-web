import {EngineError,requireValue,controlCheckpoint,checkAbort} from './errors.js';
import {gray} from './pixel-utils.js';
import {createFloatPlane} from './segmented-float-plane.js';
import {segmentedPrnuCorrelation} from './segmented-prnu-correlation.js';
import {prnuStreamHeapBytes} from './prnu-stream-math.js';
import {numpySum} from './numpy-sum.js';
// Native Wiener statistics are global, including the 8192-value NumPy mean.
// Only storage and independent complete-axis scheduling change.
export async function segmentedPrnuResidual(image,{budget,signal,onProgress,blockPixels=65536,storage='auto',pool}={}){
 requireValue(Number.isSafeInteger(blockPixels)&&blockPixels>0&&blockPixels<=262144,'Invalid PRNU strip size.');const {width,height}=image.surface.descriptor;requireValue(width>=3&&height>=3,'PRNU requires at least 3 rows and 3 columns.');
 const room=budget.limit-budget.retained-budget.active,heap=Math.max(24*1024**2,prnuStreamHeapBytes()),block=Math.min(blockPixels,Math.floor((room-heap-2*1024**2)/160));if(block<2*Math.max(width+2,height+2))throw new EngineError('MEMORY_LIMIT','Two complete PRNU axes must fit.');
 const options={budget,signal,storage:storage==='auto'&&(image.session||image.ensureTemporarySession)&&width*height*72>room-heap-block*160?'temporary':storage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,chunkBytes:Math.max(8192,block*8)},owned=new Set();
 const plane=async(w,h)=>{const p=await createFloatPlane(w,h,options);owned.add(p);return p;},work=async fn=>{const release=budget.reserve(heap+block*160);try{return await fn();}finally{release();}},progress=(phase,completed,total)=>onProgress?.({phase,completed,total}),rows=Math.max(1,Math.floor(block/width));
 try{
  const input=await plane(width,height);await work(async()=>{for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const h=Math.min(rows,height-y),part=await image.surface.readWindow({x:0,y,width,height:h},{signal});try{const values=new Float64Array(width*h);for(let i=0;i<values.length;i++)values[i]=gray(part.pixels.data[i*3],part.pixels.data[i*3+1],part.pixels.data[i*3+2])/255;await input.write(values,0,y,width,h,{signal});}finally{part.release();}progress('prnu-gray',Math.min(height,y+rows),height);}});
  const full=(height+2)*(width+2),fft=2.04735e-9*(3*full*Math.log(full))<1.55367e-8*(height*width*9)-1e-4;
  let mean,variance;
  if(fft){mean=await segmentedPrnuCorrelation(input,{...options,blockPixels:block,onProgress,pool});owned.add(mean);variance=await segmentedPrnuCorrelation({width,height,async read(...args){const values=await input.read(...args);for(let i=0;i<values.length;i++)values[i]*=values[i];return values;}},{...options,blockPixels:block,onProgress,pool});owned.add(variance);}
  else{mean=await plane(width,height);variance=await plane(width,height);await work(async()=>{for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const h=Math.min(rows,height-y),top=Math.max(0,y-1),end=Math.min(height,y+h+1),source=await input.read(0,top,width,end-top,{signal}),m=new Float64Array(h*width),v=new Float64Array(h*width);for(let yy=0;yy<h;yy++)for(let x=0;x<width;x++){let a=0,b=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const row=y+yy+dy,col=x+dx,value=row<0||row>=height||col<0||col>=width?0:source[(row-top)*width+col];a+=value;b+=value*value;}m[yy*width+x]=a;v[yy*width+x]=b;}await mean.write(m,0,y,width,h,{signal});await variance.write(v,0,y,width,h,{signal});progress('prnu-direct',Math.min(height,y+rows),height);}});}
  let noisePower=0;await work(async()=>{
   for(let y=0;y<height;y+=rows){await controlCheckpoint(signal);const h=Math.min(rows,height-y),m=await mean.read(0,y,width,h,{signal}),v=await variance.read(0,y,width,h,{signal});for(let i=0;i<m.length;i++){m[i]/=9;v[i]=v[i]/9-m[i]*m[i];}await mean.write(m,0,y,width,h,{signal});await variance.write(v,0,y,width,h,{signal});progress('prnu-statistics',Math.min(height,y+rows),height);}
   for(let at=0;at<width*height;at+=8192){await controlCheckpoint(signal);const values=new Float64Array(Math.min(8192,width*height-at));await variance.store.readInto(new Uint8Array(values.buffer),at*8);noisePower+=numpySum(values);}noisePower/=width*height;progress('prnu-noise',1,1);
  });
  const result=await plane(width-2,height-2);await work(async()=>{for(let y=1;y<height-1;y+=rows){await controlCheckpoint(signal);const h=Math.min(rows,height-1-y),m=await mean.read(1,y,width-2,h,{signal}),v=await variance.read(1,y,width-2,h,{signal}),source=await input.read(1,y,width-2,h,{signal});for(let i=0;i<source.length;i++){const filtered=v[i]<noisePower?m[i]:(source[i]-m[i])*(1-noisePower/v[i])+m[i],residual=source[i]-filtered;source[i]=Number.isFinite(residual)?residual:0;}await result.write(source,0,y-1,width-2,h,{signal});progress('prnu-residual',Math.min(height-2,y-1+rows),height-2);}});
  await result.store.flush();checkAbort(signal);owned.delete(result);return {...result,method:fft?'fft':'direct',noisePower};
 }finally{await Promise.all([...owned].map(p=>p.dispose()));}
}
