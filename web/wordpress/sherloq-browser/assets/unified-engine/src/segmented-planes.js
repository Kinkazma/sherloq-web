import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,checkAbort,controlCheckpoint,normalizeResourceError} from './errors.js';
import {channelValue} from './pixel-utils.js';
import {renderBitPlane,BIT_PLANE_SEMANTICS} from './bit-planes.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface,createMaskSurface} from './rgb-surface.js';

export async function segmentedBitPlanes(image,params,{budget,signal,onProgress,rowsPerBlock}={}){
 const d=image.surface.descriptor,w=d.sourceWidth,h=d.sourceHeight,n=w*h,input=image.store;
 requireValue(rowsPerBlock===undefined||Number.isSafeInteger(rowsPerBlock)&&rowsPerBlock>0,'Invalid bit-plane row group.');
 let mask,output,planning;let blocks=0;
 const ioBytes=image.session?.backend==='indexeddb'||!image.session&&image.ensureTemporarySession?2*1024**2:0;
 try{
  // Reserve useful scratch while deciding which retained arrays can stay in RAM.
  // This is allocation planning, with no probe, warm-up or altered image size.
  planning=budget.reserve(Math.min(8*1024**2,n*4+w*8)+ioBytes);
  mask=await createSegmentedBytes(n,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});
  output=await createSegmentedBytes(n*3,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});
  planning();planning=null;
  const available=()=>budget.limit-budget.retained-budget.active-(image.session?.backend==='indexeddb'?2*1024**2:0);
  const block=Math.min(input.chunkBytes,Math.floor(available()*3/4)),blockBytes=block-block%3;
  if(blockBytes<3)throw new EngineError('MEMORY_LIMIT','Bit-plane input staging does not fit the shared budget.');
  await input.visit(async(bytes,offset)=>{
   const count=bytes.length/3,release=budget.reserve(count);
   try{const values=new Uint8Array(count);for(let i=0;i<count;i++)values[i]=(channelValue(bytes,i*3,params.channel,true)>>params.bit)&1;await mask.write(values,offset/3);checkAbort(signal);onProgress?.(.5*(offset+bytes.length)/input.byteLength);}finally{release();}
  },{signal,blockBytes});
  await mask.flush();
  const rows=Math.min(h,rowsPerBlock??Math.max(1,Math.floor(4*1024**2/(w*4))-2),Math.floor(available()/(w*4))-2);
  if(rows<1)throw new EngineError('MEMORY_LIMIT','Bit-plane neighborhood staging does not fit the shared budget.');
  for(let y=0;y<h;y+=rows){
   await controlCheckpoint(signal);const count=Math.min(rows,h-y),top=Math.max(0,y-1),bottom=Math.min(h,y+count+1),height=bottom-top,length=height*w,release=budget.reserve(length*4);
   try{
    const values=new Uint8Array(length);await mask.readInto(values,top*w);checkAbort(signal);
    const display=await renderBitPlane(values,w,height,params.filter,{signal});
    // Discard halo rows; outer image borders retain native replicate/reflect101.
    await output.write(display.subarray((y-top)*w*3,(y-top+count)*w*3),y*w*3);checkAbort(signal);blocks++;onProgress?.(.5+.5*(y+count)/h);
   }finally{release();}
  }
  await output.flush();checkAbort(signal);
  const options={width:w,height:h,orientation:d.orientation,budget},surface=createRgbSurface(output,options),maskSurface=createMaskSurface(mask,{...options,range:[0,1],semantics:BIT_PLANE_SEMANTICS});
  return {surface,maskRecords:{plane:{surface:maskSurface}},semantics:'Bit0 is least significant. Raw0/1 evidence is independent of median/Gaussian display filtering; original RGB norm semantics and full-image borders are preserved.',metrics:{blocks,rowsPerBlock:rows,storage:output.storage,maskStorage:mask.storage,retainedResultBytes:n*4}};
 }catch(error){await Promise.allSettled([output?.dispose(),mask?.dispose()]);throw normalizeResourceError(error);}finally{planning?.();}
}
