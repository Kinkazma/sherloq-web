import {EngineError,requireValue} from './errors.js';
import {ramByteCacheBytes} from './ram-byte-cache.js';
export const ECHO_HEAP_BYTES=64*1024**2;
const MARGIN=2*1024**2,STATS=48,METADATA=16384,TARGET_PIXELS=262144;
/** Wire bytes and WASM extents come from the same two native ABI functions.
 * Int32 raw words are never reinterpreted as Float32 before normalization. */
export function echoLayout(depth=8,radius=2){
 requireValue([8,16].includes(depth)&&Number.isInteger(radius)&&radius>=1&&radius<=15,'Invalid Echo layout depth or radius.');
 const sampleBytes=depth/8,inputPixelBytes=3*sampleBytes,rawBytes=4,rawPixelBytes=3*rawBytes,outputPixelBytes=3,horizontalPixelBytes=2*4;
 return Object.freeze({depth,sampleBytes,inputPixelBytes,rawBytes,rawPixelBytes,rawKind:depth===16&&radius<=4?'int32':'float32',outputPixelBytes,horizontalPixelBytes,statsBytes:STATS,heapBytes:ECHO_HEAP_BYTES,heapMarginBytes:MARGIN,heapCorePixelBytes:inputPixelBytes+rawPixelBytes+horizontalPixelBytes,heapHaloRowPixelBytes:2*(inputPixelBytes+horizontalPixelBytes),stagingCorePixelBytes:rawPixelBytes+inputPixelBytes+1,legacyAdmissionPixelBytes:28,metadataBytes:METADATA});
}
const geometry=d=>requireValue(d&&['rgb8','rgb16'].includes(d.format)&&Number.isSafeInteger(d.width)&&Number.isSafeInteger(d.height)&&d.width>0&&d.height>0&&Number.isSafeInteger(d.width*d.height*12),'Invalid Echo source geometry.');
/** Pure per-window costs. readWindowPlan is the actual Source reader's pure
 * planner, not a replacement allocation or a second decoded Source. */
export function echoBandPlan(descriptor,p,rows,{count=1,mainHeapBytes=0,heldHeapBytes=0,ioBytes=0,readWindowPlan,readWindowInto=true}={}){
 geometry(descriptor);const depth=descriptor.format==='rgb16'?16:8,l=echoLayout(depth,p.radius),w=descriptor.width,h=descriptor.height,r=p.radius;
 requireValue(Number.isSafeInteger(rows)&&rows>=1&&rows<=h&&Number.isSafeInteger(count)&&count>=1&&[mainHeapBytes,heldHeapBytes,ioBytes].every(x=>Number.isSafeInteger(x)&&x>=0),'Invalid Echo band admission.');
 const grossHeapBytes=count===1?ECHO_HEAP_BYTES:mainHeapBytes+count*ECHO_HEAP_BYTES,heapBytes=Math.max(0,grossHeapBytes-heldHeapBytes),rowScratchBytes=Math.max(w,h)*l.inputPixelBytes,haloBytes=count*w*r*4*l.inputPixelBytes,overheadBytes=heapBytes+ioBytes+haloBytes+rowScratchBytes+METADATA,corePixels=w*rows,windowRows=Math.min(h,rows+2*r),windowPixels=w*windowRows;
 if(depth===8)return{layout:l,rows,count,windowRows,windowPixels,grossHeapBytes,alreadyHeldHeapBytes:Math.min(grossHeapBytes,heldHeapBytes),heapBytes,ioBytes,rowScratchBytes,haloBytes,overheadBytes,stagingBytes:overheadBytes+count*corePixels*16,sourceLoanBytes:windowPixels*3,sourceAdditionalBytes:0,renderLoanBytes:count*corePixels*12,additionalWorkingBytes:overheadBytes+count*corePixels*28};
 let sourceAdditionalBytes;
 if(readWindowPlan){const a=readWindowPlan({x:0,y:0,width:w,height:windowRows});requireValue(a?.known===true&&a.outputBytes===windowPixels*6&&Number.isSafeInteger(a.additionalBytes)&&a.additionalBytes>=0,'Echo needs the actual native16 Source window plan.');sourceAdditionalBytes=a.additionalBytes;}
 else sourceAdditionalBytes=(descriptor.sourceWidth??w)*6;
 const sourceLoanBytes=(readWindowInto?0:windowPixels*6)+sourceAdditionalBytes,stagingBytes=overheadBytes+count*corePixels*l.stagingCorePixelBytes,renderLoanBytes=count*corePixels*l.rawPixelBytes;
 return{layout:l,rows,count,windowRows,windowPixels,grossHeapBytes,alreadyHeldHeapBytes:Math.min(grossHeapBytes,heldHeapBytes),heapBytes,ioBytes,rowScratchBytes,haloBytes,overheadBytes,stagingBytes,sourceLoanBytes,sourceAdditionalBytes,renderLoanBytes,additionalWorkingBytes:stagingBytes+Math.max(sourceLoanBytes,renderLoanBytes)};
}
/** Shared by execution and final-depth admission. Eight-bit expressions are
 * literal historical choices; sixteen-bit rows use the actual reader plan. */
export function echoExecutionPlan(descriptor,p,{rowsPerBlock,maxWorkers=1,workerAvailable=typeof Worker!=='undefined',count,mainHeapBytes=0,heldHeapBytes=0,ioBytes=0,availableBytes=Number.MAX_SAFE_INTEGER,readWindowPlan,readWindowInto=true}={}){
 geometry(descriptor);requireValue(rowsPerBlock===undefined||Number.isSafeInteger(rowsPerBlock)&&rowsPerBlock>0,'Invalid Echo row group.');requireValue(Number.isSafeInteger(maxWorkers)&&maxWorkers>=1,'Invalid Echo worker limit.');const w=descriptor.width,h=descriptor.height,n=w*h,l=echoLayout(descriptor.format==='rgb16'?16:8,p.radius),r=p.radius,targetRows=Math.min(h,rowsPerBlock??Math.max(1,Math.floor(TARGET_PIXELS/w))),heapRows=Math.floor((ECHO_HEAP_BYTES-MARGIN-l.heapHaloRowPixelBytes*r*w)/(w*l.heapCorePixelBytes)),minimumRows=Math.min(targetRows,heapRows,Math.max(1,2*r)),maximumWorkers=workerAvailable?Math.min(32,maxWorkers,Math.ceil(h/targetRows)):1;
 if(heapRows<1)throw new EngineError('MEMORY_LIMIT','One Echo row and its halo exceed the fixed arithmetic heap.');const workerCount=count??maximumWorkers;requireValue(Number.isSafeInteger(workerCount)&&workerCount>=1&&workerCount<=32,'Invalid useful Echo worker count.');
 const options={count:workerCount,mainHeapBytes,heldHeapBytes,ioBytes,readWindowPlan,readWindowInto},minimum=echoBandPlan(descriptor,p,minimumRows,options),target=echoBandPlan(descriptor,p,Math.min(targetRows,heapRows),options);let rows;
 if(l.depth===8)rows=Math.min(targetRows,heapRows,Math.floor((availableBytes-minimum.overheadBytes)/(workerCount*w*28)));
 else{let low=0,high=Math.min(targetRows,heapRows);while(low<high){const middle=low+Math.ceil((high-low)/2),plan=echoBandPlan(descriptor,p,middle,options);if(plan.additionalWorkingBytes<=availableBytes)low=middle;else high=middle-1;}rows=low;}
 const selected=rows>=1?echoBandPlan(descriptor,p,rows,options):null;
 return{schema:'sherloq.echo-execution-plan/1',known:rows>=1,layout:l,width:w,height:h,pixels:n,radius:r,targetRows,heapRows,minimumRows,maximumWorkers,workers:workerCount,rows,minimum,target,selected,rawStoreBytes:n*l.rawPixelBytes,outputStoreBytes:n*l.outputPixelBytes,optionalRawCacheBytes:ramByteCacheBytes(n*l.rawPixelBytes,STATS),completeResidentAlternative:true};
}
