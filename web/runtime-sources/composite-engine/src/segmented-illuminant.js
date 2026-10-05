import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {illuminantEstimator,illuminantCellDisplay} from './illuminant.js';
import {createSegmentedBytes} from './segmented-bytes.js';import {createRgbSurface} from './rgb-surface.js';

export async function segmentedIlluminant(image,p,{budget,signal,onProgress,rowsPerBlock,cacheKey}={}){
 const {width:w,height:h}=image.surface.descriptor,cols=Math.ceil(w/p.block),rows=Math.ceil(h/p.block),cells=cols*rows,dataBytes=cells*41+24;
 requireValue(Number.isSafeInteger(dataBytes)&&Number.isSafeInteger(w*h*3),'Illuminant geometry exceeds exact integer addressing.');
 requireValue(rowsPerBlock===undefined||Number.isSafeInteger(rowsPerBlock)&&rowsPerBlock>0,'Invalid illuminant row group.');checkAbort(signal);
 const key=cacheKey&&cacheKey+[p.block,p.method,Number(p.linear),Number(p.exclude)].join('/'),cached=key&&budget.get(key),analysisCacheHit=!!cached;
 const ioBytes=image.session?.backend==='indexeddb'||!image.session&&image.ensureTemporarySession?2*1024**2:0;
 const overhead=dataBytes*3+cells*3+cols*3072+cols*4+6144+ioBytes+Math.max(w,h)*3+32768;
 let planning,staging,output,dataRetained=false,reads=0;const started=performance.now();
 try{
  // Protect even a borrowed cache value before another admission may evict it.
  planning=budget.reserve(overhead+w*6);output=await createSegmentedBytes(w*h*3,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});planning();planning=null;
  const group=Math.min(h,rowsPerBlock??Math.max(1,Math.floor(262144/w)),Math.floor((budget.limit-budget.retained-budget.active-overhead)/(w*6)));
  if(group<1)throw new EngineError('MEMORY_LIMIT','Illuminant row staging does not fit.');staging=budget.reserve(overhead+group*w*3);
  let analysis=cached?.value;const at=performance.now();
  if(!analysis){
   analysis={rows,cols,block:p.block,rgb:new Float64Array(cells*3),counts:new Uint32Array(cells),areas:new Uint32Array(cells),valid:new Uint8Array(cells),globalRGB:null,angles:new Float64Array(cells)};
   const histogram=new Uint32Array(cols*768),localCounts=new Uint32Array(cols),globalHist=new Float64Array(768),estimate=illuminantEstimator(p);let total=0;
   for(let row=0;row<rows;row++){
    histogram.fill(0);localCounts.fill(0);const y0=row*p.block,y1=Math.min(h,y0+p.block);
    for(let y=y0;y<y1;y+=group){
     await controlCheckpoint(signal);let window;
     try{
      window=await image.surface.readWindow({x:0,y,width:w,height:Math.min(group,y1-y)},{signal});reads++;const input=window.pixels.data;
      for(let dy=0;dy<window.pixels.height;dy++)for(let x=0;x<w;x++){
       const i=(dy*w+x)*3,col=Math.floor(x/p.block);
       if(p.exclude&&(Math.min(input[i],input[i+1],input[i+2])<=8||Math.max(input[i],input[i+1],input[i+2])>=250))continue;
       localCounts[col]++;for(let c=0;c<3;c++)histogram[col*768+c*256+input[i+c]]++;
      }
     }finally{window?.release();}
     onProgress?.(.65*Math.min(y1,y+group)/h);
    }
    for(let col=0;col<cols;col++){
     const cell=row*cols+col,count=localCounts[col],area=Math.min(p.block,w-col*p.block)*(y1-y0),hist=histogram.subarray(col*768,(col+1)*768),unit=estimate(hist,count);
     for(let i=0;i<768;i++)globalHist[i]+=hist[i];total+=count;
     analysis.counts[cell]=count;analysis.areas[cell]=area;analysis.valid[cell]=Number(count>=Math.min(16,area)&&Math.max(...unit)>0);
     if(!analysis.valid[cell])unit.fill(0);analysis.rgb.set(unit,cell*3);
    }
   }
   analysis.globalRGB=estimate(globalHist,total);
  }
  checkAbort(signal);const analysisMs=performance.now()-at,colors=new Uint8Array(cells*3);
  // Keep the private analysis immutable: a mode change may reuse it later.
  const owned=structuredClone(analysis),renderStarted=performance.now();
  for(let cell=0;cell<cells;cell++){
   if(cell%1024===0)await controlCheckpoint(signal);
   const display=illuminantCellDisplay(analysis.rgb.subarray(cell*3,cell*3+3),analysis.counts[cell],analysis.areas[cell],analysis.valid[cell],analysis.globalRGB,p);
   owned.angles[cell]=display.angle;colors.set(display.color,cell*3);
  }
  const colorRow=new Uint8Array(w*3);let lastCellRow=-1;
  for(let y=0;y<h;y+=group){
   await controlCheckpoint(signal);const count=Math.min(group,h-y),bytes=new Uint8Array(w*count*3);
   for(let dy=0;dy<count;dy++){
    const cellRow=Math.floor((y+dy)/p.block);
    if(cellRow!==lastCellRow){for(let x=0;x<w;x++){const cell=cellRow*cols+Math.floor(x/p.block);colorRow[x*3]=colors[cell*3];colorRow[x*3+1]=colors[cell*3+1];colorRow[x*3+2]=colors[cell*3+2];}lastCellRow=cellRow;}
    bytes.set(colorRow,dy*w*3);
   }
   await output.write(bytes,y*w*3);onProgress?.(.65+.35*(y+count)/h);
  }
  await output.flush();checkAbort(signal);const renderMs=performance.now()-renderStarted;
  staging();staging=null;budget.retain(dataBytes);dataRetained=true;
  if(key&&!cached)budget.put(key,{value:analysis,byteLength:dataBytes});
  const surface=createRgbSurface(output,{width:w,height:h,budget}),dispose=surface.dispose;let disposed=false;
  surface.dispose=()=>{if(!disposed){disposed=true;budget.retained-=dataBytes;dataRetained=false;}return dispose();};
  return{surface,data:owned,semantics:'Local Minkowski illuminant colour estimates; surface colours also influence the result. Invalid cells remain explicit. No light direction or authenticity verdict.',metrics:{totalMs:performance.now()-started,analysisMs,renderMs,analysisCacheHit,sourceReads:reads,rowsPerBlock:group,storage:output.storage,retainedResultBytes:w*h*3,retainedCellDataBytes:dataBytes,histogramWorkspaceBytes:cols*3072}};
 }catch(error){await output?.dispose();if(dataRetained)budget.retained-=dataBytes;if(error instanceof RangeError)throw new EngineError('MEMORY_ALLOCATION','Illuminant allocation failed after shared admission.');throw error;}finally{planning?.();staging?.();}
}
