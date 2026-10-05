import "../../runtime-context.js?v=0.14.5";
import {pixelStripPool} from './pixel-strip-pool.js';import {pixelStripStage} from './pixel-strip-stage.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint,normalizeResourceError} from './errors.js';
import {CONTRAST_HEAP_BYTES,releaseContrastWasm,contrastRows,contrastCells} from './contrast-math.js';
import {createSegmentedBytes} from './segmented-bytes.js';import {createRgbSurface} from './rgb-surface.js';

export async function segmentedContrast(image,p,{budget,signal,onProgress,cacheKey,maxWorkers=1}={}){
 const {width:w,height:h}=image.surface.descriptor,b=p.block,pw=w+b-w%b,ph=h+b-h%b,cols=pw/b+1,rows=ph/b+1,cells=cols*rows,mapBytes=cells*12;
 requireValue(Number.isSafeInteger(mapBytes)&&Number.isSafeInteger(w*h*3),'Contrast geometry exceeds exact integer addressing.');checkAbort(signal);
 // Native block-row staging and compact median map must each fit the fixed heap.
 if(pw*(b+2)*4+8*b*b+(cols-1)*12+2*1024**2>CONTRAST_HEAP_BYTES||cells*24+2*1024**2>CONTRAST_HEAP_BYTES)throw new EngineError('MEMORY_LIMIT','Contrast row or map exceeds its fixed64MiB arithmetic heap.');
 const key=cacheKey&&cacheKey+b,cached=key&&budget.get(key),analysisCacheHit=!!cached;
 const ioBytes=image.session?.backend==='indexeddb'||!image.session&&image.ensureTemporarySession?2*1024**2:0;
 const overhead=CONTRAST_HEAP_BYTES+mapBytes*3+cells*3+pw*(b+2)*3+(cols-1)*12+ioBytes+Math.max(w,h)*3+32768;
 const pool=pixelStripPool(image,budget,{maxWorkers,pixelBytes:8});let planning,staging,output,dataRetained=false,sourceReads=0;const started=performance.now();
 try{
  // Admission protects borrowed cache data even if reserve evicts its entry.
  planning=budget.reserve(overhead+w*(b+2)*3);output=await createSegmentedBytes(w*h*3,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});planning();planning=null;
  staging=budget.reserve(overhead);const at=performance.now();let maps=cached?.value;
  if(!maps){
   maps={cols,rows,values:new Float32Array(cells*3)};
   let releasedOwner=false;if(globalThis.Worker&&maxWorkers>1){releaseContrastWasm();staging();staging=budget.reserve(overhead-CONTRAST_HEAP_BYTES);releasedOwner=true;}let completed=0;await pool.run({count:ph/b,pixels:pw*(b+2),key:'contrast/'+pw+'/'+b,signal,prepareBytes:pw*(b+2)*6,
    prepare:async i=>{const y=i*b,top=Math.max(0,y-1),bottom=Math.min(ph,y+b+1),data=new Uint8Array(pw*(bottom-top)*3);let window;try{if(top<h){window=await image.surface.readWindow({x:0,y:top,width:w,height:Math.min(h,bottom)-top},{signal});sourceReads++;for(let row=0;row<window.pixels.height;row++)data.set(window.pixels.data.subarray(row*w*3,(row+1)*w*3),row*pw*3);}return {op:'contrast',rgb:data,width:pw,height:bottom-top,start:y-top,rows:b,block:b};}finally{window?.release();}},local:async j=>{const r=releasedOwner?budget.reserve(CONTRAST_HEAP_BYTES):null;try{return await pixelStripStage(j);}finally{r?.();}},
    consume:async(part,i)=>{maps.values.set(part.values,i*cols*3);onProgress?.(.7*++completed/(ph/b));}
   });if(releasedOwner){staging();staging=budget.reserve(overhead);}
  }
  checkAbort(signal);const analysisMs=performance.now()-at,renderStarted=performance.now(),plane=await contrastCells(maps,p.mode,{signal});
  const available=budget.limit-budget.retained-budget.active,group=Math.min(h,Math.max(1,Math.floor(262144/w)),Math.floor(available/(w*3)));
  if(group<1)throw new EngineError('MEMORY_LIMIT','Contrast display row does not fit the shared budget.');
  const release=budget.reserve(group*w*3),colorRow=new Uint8Array(w*3);let lastCellRow=-1;
  try{for(let y=0;y<h;y+=group){
   await controlCheckpoint(signal);const count=Math.min(group,h-y),bytes=new Uint8Array(w*count*3);
   for(let dy=0;dy<count;dy++){
    const cellRow=Math.floor((y+dy)/b);if(cellRow!==lastCellRow){for(let x=0;x<w;x++){const value=plane[cellRow*cols+Math.floor(x/b)];colorRow[x*3]=colorRow[x*3+1]=colorRow[x*3+2]=value;}lastCellRow=cellRow;}bytes.set(colorRow,dy*w*3);
   }
   await output.write(bytes,y*w*3);onProgress?.(.7+.3*(y+count)/h);
  }}finally{release();}
  await output.flush();checkAbort(signal);const renderMs=performance.now()-renderStarted;
  const data={...maps,values:maps.values.slice(),width:w,height:h,block:b,layout:'row,column,indicator',indicators:['histogram_error','channel_similarity','joint'],paddedSize:[pw,ph]};
  staging();staging=null;budget.retain(mapBytes);dataRetained=true;if(key&&!cached)budget.put(key,{value:maps,byteLength:mapBytes});
  const surface=createRgbSurface(output,{width:w,height:h,budget}),dispose=surface.dispose;let disposed=false;
  surface.dispose=()=>{if(!disposed){disposed=true;budget.retained-=mapBytes;dataRetained=false;}return dispose();};
  return{surface,data,semantics:'Native heuristic histogram error, channel similarity and their product. The joint indicator is not a calibrated probability or proof of contrast editing. Historical zero padding and the extra map row/column are preserved.',metrics:{...pool.metrics(),totalMs:performance.now()-started,analysisMs,renderMs,analysisCacheHit,sourceReads,storage:output.storage,retainedResultBytes:w*h*3,retainedMapBytes:mapBytes,arithmeticHeapCapacityBytes:Math.max(1,pool.peak)*CONTRAST_HEAP_BYTES}};
 }catch(error){await output?.dispose();if(dataRetained)budget.retained-=mapBytes;throw normalizeResourceError(error);}finally{pool.clear();planning?.();staging?.();}
}
