import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,checkAbort,controlCheckpoint,normalizeResourceError} from './errors.js';
import {defectChannel} from './defect-pixels.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface,createMaskSurface,createFlagSurface} from './rgb-surface.js';
import {createCandidateTable,CANDIDATE_COLUMNS} from './candidate-table.js';
import {sortCandidates} from './candidate-sort.js';

function logicalPoint(x,y,w,h,o){switch(o){case 2:return [w-1-x,y];case 3:return [w-1-x,h-1-y];case 4:return [x,h-1-y];case 5:return [y,x];case 6:return [h-1-y,x];case 7:return [h-1-y,w-1-x];case 8:return [y,w-1-x];default:return [x,y];}}

export async function segmentedDefects(image,p,{budget,signal,onProgress,rowsPerBlock,forceExternalSort=false}={}){
 const d=image.surface.descriptor,w=d.sourceWidth,h=d.sourceHeight,n=w*h,input=image.store,r=p.radius;
 requireValue(rowsPerBlock===undefined||Number.isSafeInteger(rowsPerBlock)&&rowsPerBlock>0,'Invalid defect row group.');
 let mask,flags,output,table,planning,count=0,channels=0,blocks=0;
 const stageMs={},started=performance.now();let stamp=started;
 const stage=name=>{const now=performance.now();stageMs[name]=now-stamp;stamp=now;};
 const io=()=>image.session?.backend==='indexeddb'||!image.session&&image.ensureTemporarySession?2*1024**2:0;
 const available=()=>budget.limit-budget.retained-budget.active-io();
 const allocate=length=>createSegmentedBytes(length,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});
 try{
  planning=budget.reserve(Math.min(8*1024**2,n*13+w*r*12)+io());
  mask=await allocate(n);flags=await allocate(n*3);output=await allocate(n*3);
  planning();planning=null;stage('admission');
  const rows=Math.min(h,rowsPerBlock??Math.max(1,Math.floor(4*1024**2/(w*10))),Math.floor((available()-w*r*6-25)/(w*10)));
  if(rows<1)throw new EngineError('MEMORY_LIMIT','Defect neighborhood staging does not fit the shared budget.');
  for(let y=0;y<h;y+=rows){
   await controlCheckpoint(signal);const lines=Math.min(rows,h-y),top=Math.max(0,y-r),bottom=Math.min(h,y+lines+r),inputBytes=(bottom-top)*w*3,size=lines*w,release=budget.reserve(inputBytes+size*7+25);
   try{
    const src=new Uint8Array(inputBytes),rawFlags=new Uint8Array(size*3),pixelMask=new Uint8Array(size),display=new Uint8Array(size*3),window=new Uint8Array((2*r+1)**2);
    await input.readInto(src,top*w*3);checkAbort(signal);if(p.mode!==1)display.set(src.subarray((y-top)*w*3,(y-top+lines)*w*3));
    for(let row=0;row<lines;row++){
     if(row%32===0)await controlCheckpoint(signal);const sy=y+row;if(sy<r||sy>=h-r)continue;
     for(let x=r;x<w-r;x++){
      const i=row*w+x;
      for(let c=0;c<3;c++){
       const flag=defectChannel(src,w,x,sy-top,c,p,window);if(!flag)continue;
       rawFlags[i*3+c]=flag;pixelMask[i]|=flag;channels++;
       if(p.mode===2){window.sort();display[i*3+c]=window[window.length>>1];}
      }
      if(pixelMask[i]){count++;if(p.mode!==2){display[i*3]=pixelMask[i]&1?255:0;display[i*3+1]=0;display[i*3+2]=pixelMask[i]&2?255:0;}}
     }
    }
    await flags.write(rawFlags,y*w*3);await mask.write(pixelMask,y*w);await output.write(display,y*w*3);checkAbort(signal);blocks++;onProgress?.(.55*(y+lines)/h);
   }finally{release();}
  }
  await flags.flush();await mask.flush();await output.flush();stage('classificationAndDisplay');

  // Allocate the exact row count, never the theoretical three candidates/pixel.
  const bufferBytes=Math.min(channels*24,Math.floor(1024**2/24)*24);
  planning=budget.reserve(Math.min(4*1024**2,n*6+w*r*6)+bufferBytes+io());table=await allocate(channels*24);planning();planning=null;
  if(channels){
   const releaseBuffer=budget.reserve(bufferBytes);
   try{
    const buffer=new Uint32Array(bufferBytes/4);let used=0,offset=0;
    const candidateRows=Math.min(rows,Math.floor((available()-w*r*6-25)/(w*6)));
    if(candidateRows<1)throw new EngineError('MEMORY_LIMIT','Candidate record staging does not fit the shared budget.');
    const flush=async()=>{if(!used)return;const bytes=new Uint8Array(buffer.buffer,0,used*4);await table.write(bytes,offset);offset+=bytes.length;used=0;checkAbort(signal);};
    for(let y=0;y<h;y+=candidateRows){
     await controlCheckpoint(signal);const lines=Math.min(candidateRows,h-y),top=Math.max(0,y-r),bottom=Math.min(h,y+lines+r),inputBytes=(bottom-top)*w*3,release=budget.reserve(inputBytes+lines*w*3+25);
     try{
      const src=new Uint8Array(inputBytes),rawFlags=new Uint8Array(lines*w*3),window=new Uint8Array((2*r+1)**2);
      await input.readInto(src,top*w*3);await flags.readInto(rawFlags,y*w*3);checkAbort(signal);
      for(let row=0;row<lines;row++){
       if(row%32===0)await controlCheckpoint(signal);
       for(let x=0;x<w;x++)for(let c=2;c>=0;c--){
        const flag=rawFlags[(row*w+x)*3+c];if(!flag)continue;
        let k=0;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)window[k++]=src[((y+row-top+dy)*w+x+dx)*3+c];window.sort();
        const [lx,ly]=logicalPoint(x,y+row,w,h,d.orientation);
        buffer[used++]=lx;buffer[used++]=ly;buffer[used++]=c;buffer[used++]=flag;buffer[used++]=src[((y+row-top)*w+x)*3+c];buffer[used++]=window[window.length>>1];
        if(used===buffer.length)await flush();
       }
      }
      onProgress?.(.55+.25*(y+lines)/h);
     }finally{release();}
    }
    await flush();requireValue(offset===channels*24,'Candidate table count changed between passes.');await table.flush();
   }finally{releaseBuffer();}
  }
  stage('candidateRecords');let sort={path:'already-ordered',passes:0};
  if(d.orientation!==1&&channels>1){const sorted=await sortCandidates(table,{width:d.width,height:d.height,budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal,forceExternal:forceExternalSort,onProgress:f=>onProgress?.(.8+.2*f)});table=sorted.store;sort=sorted.metrics;}
  stage('candidateOrder');checkAbort(signal);onProgress?.(1);checkAbort(signal);
  const options={width:w,height:h,orientation:d.orientation,budget};
  return {surface:createRgbSurface(output,options),maskRecords:{candidates:{surface:createMaskSurface(mask,{...options,range:[0,3],semantics:'Bit1=hot,bit2=dead;3=both across RGB channels; global border excluded.'})}},
   flagRecords:{channels:{surface:createFlagSurface(flags,options)}},tableRecords:{candidates:{surface:createCandidateTable(table,{budget,params:p})}},
   data:{count,candidateCount:channels,candidateColumns:CANDIDATE_COLUMNS},semantics:'Isolated pixel candidates, not a sensor diagnosis. Correction replaces candidate channels only; source bytes/pixels remain unchanged.',
   metrics:{stageMs,blocks,rowsPerBlock:rows,candidateSort:sort,storage:output.storage,maskStorage:mask.storage,flagStorage:flags.storage,tableStorage:table.storage,retainedResultBytes:n*7+channels*24}};
 }catch(error){await Promise.allSettled([output?.dispose(),mask?.dispose(),flags?.dispose(),table?.dispose()]);throw normalizeResourceError(error);}finally{planning?.();}
}
