import {requireValue,EngineError,checkAbort,controlCheckpoint,createCooperator} from './errors.js';
import {createRgbRecompression} from './jpeg-rgb-stream.js';
const HEAP_BYTES=64*1024**2;

// Feed consecutive decoded RGB bands into the existing native descriptor. Its
// complete cell rows see the same eight-pixel halo and global arithmetic origin.
export async function createElaCellRows(width,height,block,{budget,signal,onProgress,wasmBinary}={}){
 const cols=Math.floor(width/block),rows=Math.floor(height/block),cells=rows*cols;
 requireValue(Number.isInteger(width)&&width>0&&Number.isInteger(height)&&height>0&&Number.isSafeInteger(width*height)&&Number.isInteger(block)&&block>=16&&block%8===0&&cells>0&&cells<=16384,'Native ELA cell dimensions required.');
 const haloRows=Math.min(height,block+16),stripePixels=width*haloRows,windowed=stripePixels*192+block*block*256+8*1024**2>HEAP_BYTES;
 const windowCells=windowed?Math.floor(((HEAP_BYTES-block*block*256-8*1024**2)/(192*haloRows)-16)/block):cols,windowWidth=windowed?Math.min(width,windowCells*block+16):width;
 if(windowCells<1)throw new EngineError('MEMORY_LIMIT','ELA descriptor halo exceeds its current WASM limit; no resizing performed.');
 checkAbort(signal);let heapRelease,resultRelease,ringRelease,originalRing,decodedRing,m,result;const pointers=[];
 let closed=false,busy=false,received=0,completed=0,lo=0,hi=Math.min(height,block+8);
 function close(keepResult=false){if(closed)return;closed=true;if(m)for(const p of pointers)m._free(p);m=null;originalRing=decodedRing=null;ringRelease?.();heapRelease?.();if(!keepResult)resultRelease?.();}
 try{
  heapRelease=budget.reserve(HEAP_BYTES);if(windowed){ringRelease=budget.reserve(stripePixels*6);originalRing=new Uint8Array(stripePixels*3);decodedRing=new Uint8Array(stripePixels*3);}resultRelease=budget.reserve(cells*57);
  result={rows,cols,block,content:new Float32Array(cells*6),profiles:new Float32Array(cells*5),background:new Float32Array(cells*3),usable:new Uint8Array(cells),release:()=>resultRelease()};
  const {default:create}=await import('../vendor/ela-describe/describe.js');m=await create(wasmBinary?{wasmBinary}:{});checkAbort(signal);
  for(const bytes of [windowWidth*haloRows*3,windowWidth*haloRows*3,cols*24,cols*20,cols,cols*12]){const pointer=m._malloc(bytes);if(!pointer)throw new EngineError('MEMORY_LIMIT','ELA descriptor allocation failed.');pointers.push(pointer);}
 }catch(error){close();throw error;}
 const [pa,pb,pc,pp,pu,pg]=pointers,rowBytes=width*3,cooperate=createCooperator(signal);
 async function guarded(fn){if(busy)throw new EngineError('BUSY','ELA cell row descriptor busy.');requireValue(!closed,'ELA cell row descriptor closed.');busy=true;try{checkAbort(signal);return await fn();}catch(error){close();throw error;}finally{busy=false;}}
 return {
  metrics:{descriptorWindowsPerRow:Math.ceil(cols/windowCells),descriptorWindowWidth:windowWidth,descriptorRingBytes:windowed?stripePixels*6:0},
  push(original,decoded,{y,rows:count}){return guarded(async()=>{
   requireValue(y===received&&Number.isInteger(count)&&count>0&&count<=height-received&&original instanceof Uint8Array&&decoded instanceof Uint8Array&&original.length===count*rowBytes&&decoded.length===original.length,'Consecutive matching full-width RGB bands required.');
   let consumed=0;
   while(consumed<count){
    if(completed===rows){received+=count-consumed;break;}
    const take=Math.min(count-consumed,hi-received),start=consumed*rowBytes,end=(consumed+take)*rowBytes,offset=(received-lo)*rowBytes;
    if(windowed){originalRing.set(original.subarray(start,end),offset);decodedRing.set(decoded.subarray(start,end),offset);}else{m.HEAPU8.set(original.subarray(start,end),pa+offset);m.HEAPU8.set(decoded.subarray(start,end),pb+offset);}consumed+=take;received+=take;
    if(received===hi){
     await controlCheckpoint(signal);const y=completed*block;
     for(let first=0;first<cols;first+=windowCells){
      const count=Math.min(windowCells,cols-first),x=Math.max(0,first*block-8),right=Math.min(width,(first+count)*block+8),localWidth=right-x;
      let ok;
      if(windowed){
       for(let row=0;row<hi-lo;row++){const from=row*rowBytes+x*3,to=from+localWidth*3;m.HEAPU8.set(originalRing.subarray(from,to),pa+row*localWidth*3);m.HEAPU8.set(decodedRing.subarray(from,to),pb+row*localWidth*3);}
       ok=m._ela_describe_window(pa,pb,localWidth,hi-lo,y-lo,block,height,lo,width,x,first*block-x,count,pc,pp,pu,pg);
      }else ok=m._ela_describe_unlogged(pa,pb,width,hi-lo,y-lo,block,height,lo,pc,pp,pu,pg);
      if(!ok)throw new EngineError('COMPUTE_FAILED','ELA cell descriptor failed.');
      const cell=completed*cols+first;
      result.content.set(m.HEAPF32.subarray(pc/4,pc/4+count*6),cell*6);
      for(let col=0;col<count;col++)for(let d=1;d<6;d++){if(d===4)continue;const at=(cell+col)*6+d;result.content[at]=Math.log1p(result.content[at]);}
      result.profiles.set(m.HEAPF32.subarray(pp/4,pp/4+count*5),cell*5);
      result.background.set(m.HEAPF32.subarray(pg/4,pg/4+count*3),cell*3);
      result.usable.set(m.HEAPU8.subarray(pu,pu+count),cell);await cooperate();
     }
     completed++;onProgress?.(completed/rows);checkAbort(signal);
     if(completed<rows){const nextLo=Math.max(0,completed*block-8),drop=(nextLo-lo)*rowBytes,used=(received-lo)*rowBytes;if(windowed){originalRing.copyWithin(0,drop,used);decodedRing.copyWithin(0,drop,used);}else{m.HEAPU8.copyWithin(pa,pa+drop,pa+used);m.HEAPU8.copyWithin(pb,pb+drop,pb+used);}lo=nextLo;hi=Math.min(height,(completed+1)*block+8);}
    }
   }
  });},
  finish(){return guarded(async()=>{requireValue(received===height&&completed===rows,'Incomplete ELA cell source.');close(true);return result;});},
  dispose(){if(busy)throw new EngineError('BUSY','ELA cell row descriptor busy.');close();}
 };
}

export async function segmentedElaCellPlane(image,quality,block,{budget,signal,onProgress}={}){
 const {width,height}=image.surface.descriptor;let reader,result;
 try{
  reader=await createElaCellRows(width,height,block,{budget,signal,onProgress:f=>onProgress?.({phase:'ela-cell-describe',fraction:f})});
  image.rgbRecompression??=createRgbRecompression(image,budget);
  const metrics=await image.rgbRecompression.visit(quality,{signal,onProgress,onBand:(a,b,position)=>reader.push(a,b,position)});
  result=await reader.finish();checkAbort(signal);
  return {...result,metrics:{...metrics,...reader.metrics,descriptorHeapMaximumBytes:HEAP_BYTES,descriptorHaloRows:Math.min(height,block+16),descriptorResultBytes:result.rows*result.cols*57}};
 }catch(error){result?.release();throw error;}finally{reader?.dispose();}
}
