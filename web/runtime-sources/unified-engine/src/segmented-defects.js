import "../../runtime-context.js?v=0.33.3";
import {EngineError,requireValue,checkAbort,createCooperator,normalizeResourceError} from './errors.js';
import {defectChannel} from './defect-pixels.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface,createMaskSurface,createFlagSurface} from './rgb-surface.js';
import {createCandidateTable,CANDIDATE_COLUMNS} from './candidate-table.js';
import {sortCandidates} from './candidate-sort.js';
import {createRgb16Surface} from './rgb16-surface.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {withRetirementOwner} from './owner-retirement-error.js';

function logicalPoint(x,y,w,h,o){switch(o){case 2:return [w-1-x,y];case 3:return [w-1-x,h-1-y];case 4:return [x,h-1-y];case 5:return [y,x];case 6:return [h-1-y,x];case 7:return [h-1-y,w-1-x];case 8:return [y,w-1-x];default:return [x,y];}}

// These byte expressions are shared by execution and optional resident admission.
export function defectBandPlan(width,height,p,y,lines,sampleDepth=8){
 const b=sampleDepth===16?2:1,o=sampleDepth===16&&p.mode===2?2:1,top=Math.max(0,y-p.radius),bottom=Math.min(height,y+lines+p.radius),inputBytes=(bottom-top)*width*3*b;
 return {top,bottom,inputBytes,classificationBytes:inputBytes+lines*width*(4+3*o)+25*b,candidateBytes:inputBytes+lines*width*3+25*b};
}
export function segmentedDefectsExecutionPlan({width:w,height:h,params:p,sampleDepth=8,rowsPerBlock,availableBytes=Number.MAX_SAFE_INTEGER,candidateCount=3*w*h,sourceReadBytes=()=>0,presentationReadBytes=()=>0,orientation=1,ioBytes=0}={}){
 requireValue([w,h].every(v=>Number.isSafeInteger(v)&&v>0)&&[8,16].includes(sampleDepth)&&Number.isSafeInteger(w*h*82)&&Number.isSafeInteger(candidateCount)&&candidateCount>=0&&candidateCount<=3*w*h,'Invalid defect execution geometry.');
 requireValue(rowsPerBlock===undefined||Number.isSafeInteger(rowsPerBlock)&&rowsPerBlock>0,'Invalid defect row group.');
 const n=w*h,b=sampleDepth===16?2:1,o=sampleDepth===16&&p.mode===2?2:1,haloBytes=w*p.radius*6*b,windowBytes=25*b,classRowBytes=w*(3*b+4+3*o),candidateRowBytes=w*(3*b+3),bufferBytes=Math.min(candidateCount*24,Math.floor(1024**2/24)*24);
 const target=Math.min(h,rowsPerBlock??Math.max(1,Math.floor(4*1024**2/classRowBytes)));
 const peak=(rows,candidate=false)=>{let bytes=0;for(let y=0;y<h;y+=rows){const lines=Math.min(rows,h-y),band=defectBandPlan(w,h,p,y,lines,sampleDepth),native=sourceReadBytes(band.top,band.bottom-band.top),sdr=!candidate&&p.mode===0?presentationReadBytes(y,lines):0;requireValue([native,sdr].every(v=>Number.isSafeInteger(v)&&v>=0),'Invalid defect source read cost.');bytes=Math.max(bytes,(candidate?band.candidateBytes:band.classificationBytes)+Math.max(native,sdr));}return bytes;};
 const fit=(limit,candidate=false)=>{let lo=0,hi=limit;while(lo<hi){const mid=lo+Math.ceil((hi-lo)/2);if(peak(mid,candidate)<=availableBytes)lo=mid;else hi=mid-1;}return lo;};
 // Preserve the original byte staging choice exactly when there is no extra reader.
 const rows=sampleDepth===8?Math.min(target,Math.floor((availableBytes-haloBytes-windowBytes)/classRowBytes)):fit(target);
 const candidateRows=sampleDepth===8?Math.min(rows,Math.floor((availableBytes-haloBytes-windowBytes)/candidateRowBytes)):fit(rows,true);
 const resultStoreBytes=n*(4+3*o)+candidateCount*24,classificationBytes=rows>0?peak(rows):0,candidateBytes=candidateRows>0?peak(candidateRows,true):0;
 const allocationBytes=Math.min(8*1024**2,n*(4+6*b+3*o)+w*p.radius*12*b),tableAllocationBytes=Math.min(4*1024**2,n*(3*b+3)+w*p.radius*6*b)+bufferBytes;
 const sortBytes=orientation!==1&&candidateCount>1?Math.max(candidateCount*48+2048,candidateCount*24+Math.min(candidateCount*24,1048560)*17+384):0;
 const residentBytes=Math.max(n*(4+3*o)+allocationBytes,resultStoreBytes+tableAllocationBytes,resultStoreBytes+Math.max(classificationBytes,bufferBytes+candidateBytes,sortBytes))+ioBytes;
 return {known:rows>0&&candidateRows>0,sampleDepth,sampleBytes:b,outputSampleBytes:o,rows,candidateRows,maskStoreBytes:n,flagStoreBytes:3*n,outputStoreBytes:3*o*n,candidateStoreBytes:candidateCount*24,candidateCount,bufferBytes,classificationBytes,candidateBytes,allocationBytes,tableAllocationBytes,sortBytes,resultStoreBytes,
  additionalBytes:residentBytes,residentBytes,completeResidentAlternative:true};
}

// A failed Source acknowledgement may retain the caller's staging destination.
// Publish a debt-only owner; never retry that failed acknowledgement in this call.
function preserveStaging(error,release,held){
 if(!error?.cleanupOwner)return false;
 const child=error.cleanupOwner;let flight,done=false;
 const owner={dispose(){if(done)return Promise.resolve();if(flight)return flight;const task=(async()=>{const reply=await child.dispose();if(reply===false||reply===0)throw reply;release();held.length=0;done=true;})();flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;}};
 throw withRetirementOwner(error,owner,error);
}

export async function segmentedDefects(image,p,{budget,signal,onProgress,rowsPerBlock,forceExternalSort=false,sampleDepth=8,candidateParams=p,presentationStore,sourceReadBytes=()=>0,presentationReadBytes=()=>0,rgb16Options={}}={}){
 const d=image.surface.descriptor,w=d.sourceWidth,h=d.sourceHeight,n=w*h,input=image.store,r=p.radius,b=sampleDepth===16?2:1,Type=sampleDepth===16?Uint16Array:Uint8Array,OutputType=sampleDepth===16&&p.mode===2?Uint16Array:Uint8Array,o=OutputType.BYTES_PER_ELEMENT,bytes=view=>new Uint8Array(view.buffer,view.byteOffset,view.byteLength);
 requireValue([8,16].includes(sampleDepth),'Invalid defect sample depth.');
 requireValue(rowsPerBlock===undefined||Number.isSafeInteger(rowsPerBlock)&&rowsPerBlock>0,'Invalid defect row group.');
 let mask,flags,output,table,planning,count=0,channels=0,blocks=0;
 const stageMs={},started=performance.now(),cooperate=createCooperator(signal);let stamp=started;
 const stage=name=>{const now=performance.now();stageMs[name]=now-stamp;stamp=now;};
 const io=()=>image.session?.backend==='indexeddb'||!image.session&&image.ensureTemporarySession?2*1024**2:0;
 const available=()=>budget.limit-budget.retained-budget.active-io();
 const allocate=length=>createSegmentedBytes(length,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});
 try{
  planning=budget.reserve(Math.min(8*1024**2,n*(4+6*b+3*o)+w*r*12*b)+io());
  mask=await allocate(n);flags=await allocate(n*3);output=await allocate(n*3*o);
  planning();planning=null;stage('admission');
  const execution=segmentedDefectsExecutionPlan({width:w,height:h,params:p,sampleDepth,rowsPerBlock,availableBytes:available(),sourceReadBytes,presentationReadBytes}),rows=execution.rows;
  if(rows<1)throw new EngineError('MEMORY_LIMIT','Defect neighborhood staging does not fit the shared budget.');
  for(let y=0;y<h;y+=rows){
   await cooperate();const lines=Math.min(rows,h-y),top=Math.max(0,y-r),bottom=Math.min(h,y+lines+r),inputBytes=(bottom-top)*w*3*b,size=lines*w,release=budget.reserve(defectBandPlan(w,h,p,y,lines,sampleDepth).classificationBytes);let deferred=false,held=[];
   try{
    const src=new Type(inputBytes/b),rawFlags=new Uint8Array(size*3),pixelMask=new Uint8Array(size),display=new OutputType(size*3),window=new Type((2*r+1)**2);held=[src,rawFlags,pixelMask,display,window];
    await input.readInto(bytes(src),top*w*3*b);checkAbort(signal);if(p.mode!==1){if(sampleDepth===16&&p.mode===0){requireValue(presentationStore?.readInto,'Native16 marker mode requires the captured Original SDR background.');await presentationStore.readInto(display,y*w*3);}else display.set(src.subarray((y-top)*w*3,(y-top+lines)*w*3));}
    for(let row=0;row<lines;row++){
     if(row%32===0)await cooperate();const sy=y+row;if(sy<r||sy>=h-r)continue;
     for(let x=r;x<w-r;x++){
      const i=row*w+x;
      for(let c=0;c<3;c++){
       const flag=defectChannel(src,w,x,sy-top,c,p,window,sampleDepth===16?65535:255);if(!flag)continue;
       rawFlags[i*3+c]=flag;pixelMask[i]|=flag;channels++;
       if(p.mode===2){window.sort();display[i*3+c]=window[window.length>>1];}
      }
      if(pixelMask[i]){count++;if(p.mode!==2){display[i*3]=pixelMask[i]&1?255:0;display[i*3+1]=0;display[i*3+2]=pixelMask[i]&2?255:0;}}
     }
    }
    await flags.write(rawFlags,y*w*3);await mask.write(pixelMask,y*w);await output.write(bytes(display),y*w*3*o);checkAbort(signal);blocks++;onProgress?.(.55*(y+lines)/h);
   }catch(error){if(error?.cleanupOwner){deferred=true;preserveStaging(error,release,held);}throw error;}finally{if(!deferred)release();}
  }
  await flags.flush();await mask.flush();await output.flush();stage('classificationAndDisplay');

  // Allocate the exact row count, never the theoretical three candidates/pixel.
  const bufferBytes=Math.min(channels*24,Math.floor(1024**2/24)*24);
  planning=budget.reserve(Math.min(4*1024**2,n*(3*b+3)+w*r*6*b)+bufferBytes+io());table=await allocate(channels*24);planning();planning=null;
  if(channels){
   const releaseBuffer=budget.reserve(bufferBytes);let deferredBuffer=false,buffer;
   try{
    buffer=new Uint32Array(bufferBytes/4);let used=0,offset=0;
    const candidateRows=sampleDepth===8?Math.min(rows,Math.floor((available()-w*r*6-25)/(w*6))):segmentedDefectsExecutionPlan({width:w,height:h,params:p,sampleDepth,rowsPerBlock:rows,availableBytes:available(),candidateCount:channels,sourceReadBytes,presentationReadBytes}).candidateRows;
    if(candidateRows<1)throw new EngineError('MEMORY_LIMIT','Candidate record staging does not fit the shared budget.');
    const flush=async()=>{if(!used)return;const bytes=new Uint8Array(buffer.buffer,0,used*4);await table.write(bytes,offset);offset+=bytes.length;used=0;checkAbort(signal);};
    for(let y=0;y<h;y+=candidateRows){
     await cooperate();const lines=Math.min(candidateRows,h-y),top=Math.max(0,y-r),bottom=Math.min(h,y+lines+r),inputBytes=(bottom-top)*w*3*b,release=budget.reserve(defectBandPlan(w,h,p,y,lines,sampleDepth).candidateBytes);let deferred=false,held=[];
     try{
      const src=new Type(inputBytes/b),rawFlags=new Uint8Array(lines*w*3),window=new Type((2*r+1)**2);held=[src,rawFlags,window];
      await input.readInto(bytes(src),top*w*3*b);await flags.readInto(rawFlags,y*w*3);checkAbort(signal);
      for(let row=0;row<lines;row++){
       if(row%32===0)await cooperate();
       for(let x=0;x<w;x++)for(let c=2;c>=0;c--){
        const flag=rawFlags[(row*w+x)*3+c];if(!flag)continue;
        let k=0;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)window[k++]=src[((y+row-top+dy)*w+x+dx)*3+c];window.sort();
        const [lx,ly]=logicalPoint(x,y+row,w,h,d.orientation);
        buffer[used++]=lx;buffer[used++]=ly;buffer[used++]=c;buffer[used++]=flag;buffer[used++]=src[((y+row-top)*w+x)*3+c];buffer[used++]=window[window.length>>1];
        if(used===buffer.length)await flush();
       }
      }
      onProgress?.(.55+.25*(y+lines)/h);
     }catch(error){if(error?.cleanupOwner){deferred=true;preserveStaging(error,release,held);}throw error;}finally{if(!deferred)release();}
    }
    await flush();requireValue(offset===channels*24,'Candidate table count changed between passes.');await table.flush();
   }catch(error){if(error?.cleanupOwner){deferredBuffer=true;preserveStaging(error,releaseBuffer,[buffer]);}throw error;}finally{if(!deferredBuffer)releaseBuffer();}
  }
  stage('candidateRecords');let sort={path:'already-ordered',passes:0};
  if(d.orientation!==1&&channels>1){const sorted=await sortCandidates(table,{width:d.width,height:d.height,budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal,forceExternal:forceExternalSort,onProgress:f=>onProgress?.(.8+.2*f)});table=sorted.store;sort=sorted.metrics;}
  stage('candidateOrder');checkAbort(signal);onProgress?.(1);checkAbort(signal);
  const options={width:w,height:h,orientation:d.orientation,budget};
  return {surface:sampleDepth===16&&p.mode===2?createRgb16Surface(output,{...options,...rgb16Options}):createRgbSurface(output,options),maskRecords:{candidates:{surface:createMaskSurface(mask,{...options,range:[0,3],semantics:'Bit1=hot,bit2=dead;3=both across RGB channels; global border excluded.'})}},
   flagRecords:{channels:{surface:createFlagSurface(flags,options)}},tableRecords:{candidates:{surface:createCandidateTable(table,{budget,params:candidateParams})}},
   data:{count,candidateCount:channels,candidateColumns:CANDIDATE_COLUMNS},semantics:'Isolated pixel candidates, not a sensor diagnosis. Correction replaces candidate channels only; source bytes/pixels remain unchanged.',
   metrics:{stageMs,blocks,rowsPerBlock:rows,candidateSort:sort,storage:output.storage,maskStorage:mask.storage,flagStorage:flags.storage,tableStorage:table.storage,sampleDepth,outputDepth:o*8,retainedResultBytes:n*(4+3*o)+channels*24}};
 }catch(error){await retireCompositeOwners([()=>output?.dispose(),()=>mask?.dispose(),()=>flags?.dispose(),()=>table?.dispose()],{primary:error});const normalized=normalizeResourceError(error);throw error?.cleanupOwner?withRetirementOwner(normalized,error.cleanupOwner,error):normalized;}finally{planning?.();}
}
