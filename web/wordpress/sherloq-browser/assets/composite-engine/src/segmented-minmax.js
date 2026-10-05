import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {localExtrema,MINMAX_PALETTE} from './minmax.js';
import {normalizeU8} from './pixel-utils.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface,createMaskSurface} from './rgb-surface.js';

// A density cell is anchored in oriented coordinates. Its index is separable
// across source x/y for all eight EXIF permutations, without transposing pixels.
function cellCoordinates(d,block,columns){
 const w=d.sourceWidth,h=d.sourceHeight;
 function cell(x,y){let dx=x,dy=y;switch(d.orientation){case 2:dx=w-1-x;break;case 3:dx=w-1-x;dy=h-1-y;break;case 4:dy=h-1-y;break;case 5:dx=y;dy=x;break;case 6:dx=h-1-y;dy=x;break;case 7:dx=h-1-y;dy=w-1-x;break;case 8:dx=y;dy=w-1-x;break;}return Math.floor(dy/block)*columns+Math.floor(dx/block);}
 const base=cell(0,0),xs=new Int32Array(w),ys=new Int32Array(h);
 for(let x=0;x<w;x++)xs[x]=cell(x,0)-base;
 for(let y=0;y<h;y++)ys[y]=cell(0,y);
 return {xs,ys};
}

export async function segmentedMinmax(image,params,{budget,signal,onProgress,rowsPerBlock}={}){
 const d=image.surface.descriptor,w=d.sourceWidth,h=d.sourceHeight,n=w*h;
 requireValue(rowsPerBlock===undefined||Number.isSafeInteger(rowsPerBlock)&&rowsPerBlock>0,'Invalid extrema row group.');
 const radius=params.filter+3,block=radius*2+1,columns=Math.ceil(d.width/block),cellRows=Math.ceil(d.height/block),cells=columns*cellRows;
 const filtered=Boolean(params.filter),gridBytes=filtered?cells*16+(w+h)*4:0,ioBytes=image.session?.backend==='indexeddb'||!image.session&&image.ensureTemporarySession?2*1024**2:0;
 let low,high,output,planning,gridReservation,blocks=0,rows;const stageMs={admission:0,extremaAndMaskWrites:0,densityCounts:0,globalNormalization:0,displayWrites:0};let stageStart=performance.now();
 try{
  // Reserve both future grid and current useful staging before choosing which
  // retained masks fit RAM. No calibration or full-resolution scratch raster.
  gridReservation=budget.reserve(gridBytes);
  planning=budget.reserve(Math.min(8*1024**2,n*9+w*18)+ioBytes);
  low=await createSegmentedBytes(n,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});
  high=await createSegmentedBytes(n,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});
  output=await createSegmentedBytes(n*3,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});
  planning();planning=null;
  const available=()=>budget.limit-budget.retained-budget.active-(image.session?.backend==='indexeddb'?2*1024**2:0);
  rows=Math.min(h,rowsPerBlock??Math.max(1,Math.floor(4*1024**2/(w*9))-2),Math.floor(available()/(w*9))-2);
  if(rows<1)throw new EngineError('MEMORY_LIMIT','Extrema neighborhood staging does not fit the shared budget.');
  stageMs.admission=performance.now()-stageStart;stageStart=performance.now();
  for(let y=0;y<h;y+=rows){
   await controlCheckpoint(signal);const count=Math.min(rows,h-y),top=Math.max(0,y-1),bottom=Math.min(h,y+count+1),height=bottom-top,length=height*w,release=budget.reserve(length*9);
   try{
    const data=new Uint8Array(length*3);await image.store.readInto(data,top*w*3);checkAbort(signal);
    const masks=await localExtrema({width:w,height,data},params,{signal}),start=(y-top)*w,end=start+count*w;
    await low.write(masks.low.subarray(start,end),y*w);await high.write(masks.high.subarray(start,end),y*w);
    if(!filtered){data.fill(0);for(let i=start;i<end;i++)if(masks.low[i]||masks.high[i])data.set(MINMAX_PALETTE[masks.low[i]?params.minimum:params.maximum],i*3);await output.write(data.subarray(start*3,end*3),y*w*3);}
    checkAbort(signal);blocks++;onProgress?.((filtered ? .5 : 1)*(y+count)/h);
   }finally{release();}
  }
  await low.flush();await high.flush();stageMs.extremaAndMaskWrites=performance.now()-stageStart;stageStart=performance.now();
  if(filtered){
   const {xs,ys}=cellCoordinates(d,block,columns),counts=[new Uint16Array(cells),new Uint16Array(cells)];
   const countBlock=Math.min(low.chunkBytes,Math.floor(available()/2));
   if(countBlock<1)throw new EngineError('MEMORY_LIMIT','Extrema count staging does not fit the shared budget.');
   await low.visit(async(bytes,offset)=>{
    const release=budget.reserve(bytes.length);
    try{const other=new Uint8Array(bytes.length);await high.readInto(other,offset);let y=Math.floor(offset/w),x=offset-y*w;
     for(let i=0;i<bytes.length;i++){const cell=xs[x]+ys[y];counts[0][cell]+=bytes[i];counts[1][cell]+=other[i];if(++x===w){x=0;y++;}}
     checkAbort(signal);onProgress?.(.5+.2*(offset+bytes.length)/n);
    }finally{release();}
   },{signal,blockBytes:countBlock});
   stageMs.densityCounts=performance.now()-stageStart;stageStart=performance.now();
   // Repeated per-pixel density values have the same global extrema as these
   // compact cells. Normalize each complete grid, then the complete RGB grid.
   const values=new Float32Array(cells),levels=[];
   for(const count of counts){
    values.fill(0);
    if(d.width>radius&&d.height>radius)for(let cy=0;cy<cellRows;cy++){
     if(cy%32===0)await controlCheckpoint(signal);const bh=Math.min(block,d.height-cy*block);
     for(let cx=0;cx<columns;cx++){const bw=Math.min(block,d.width-cx*block),i=cy*columns+cx;if(bw<=radius||bh<=radius)continue;const q=count[i]/(bw*bh);values[i]=Math.sqrt(q*(1-q));}
    }
    levels.push(normalizeU8(values,127));
   }
   const colors=[params.minimum,params.maximum],combined=new Uint8Array(cells*3);
   for(let i=0;i<cells;i++)for(let m=0;m<2;m++)for(let c=0;c<3;c++)if(colors[m]===c||colors[m]===3)combined[i*3+c]+=levels[m][i];
   const normalized=normalizeU8(combined);checkAbort(signal);stageMs.globalNormalization=performance.now()-stageStart;stageStart=performance.now();onProgress?.(.75);
   const renderPixels=Math.min(Math.floor(4*1024**2/3),Math.floor(available()/3));
   if(renderPixels<1)throw new EngineError('MEMORY_LIMIT','Extrema display staging does not fit the shared budget.');
   const release=budget.reserve(Math.min(n,renderPixels)*3);
   try{const bytes=new Uint8Array(Math.min(n,renderPixels)*3);
    for(let offset=0;offset<n;offset+=renderPixels){await controlCheckpoint(signal);const size=Math.min(renderPixels,n-offset);let y=Math.floor(offset/w),x=offset-y*w;
     for(let i=0;i<size;i++){const cell=(xs[x]+ys[y])*3;for(let c=0;c<3;c++)bytes[i*3+c]=normalized[cell+c];if(++x===w){x=0;y++;}}
     await output.write(bytes.subarray(0,size*3),offset*3);checkAbort(signal);onProgress?.(.75+.25*(offset+size)/n);
    }
   }finally{release();}
  }
  await output.flush();checkAbort(signal);if(filtered)stageMs.displayWrites=performance.now()-stageStart;
  const options={width:w,height:h,orientation:d.orientation,budget},surface=createRgbSurface(output,options);
  return {surface,maskRecords:{minimum:{surface:createMaskSurface(low,{...options,range:[0,1],semantics:'Strict minimum relative to eight neighbors; border excluded.'})},maximum:{surface:createMaskSurface(high,{...options,range:[0,1],semantics:'Strict maximum relative to eight neighbors; border excluded.'})}},semantics:'Local extrema; density display never changes the underlying masks.',metrics:{stageMs,blocks,rowsPerBlock:rows,densityCells:filtered?cells:0,densityGridBytes:gridBytes,storage:output.storage,maskStorage:{minimum:low.storage,maximum:high.storage},retainedResultBytes:n*5}};
 }catch(error){await Promise.allSettled([output?.dispose(),low?.dispose(),high?.dispose()]);if(error instanceof RangeError)throw new EngineError('MEMORY_ALLOCATION','Segmented mask/display allocation failed after shared admission.');throw error;}finally{planning?.();gridReservation?.();}
}
