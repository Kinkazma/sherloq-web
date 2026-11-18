import "../../runtime-context.js?v=0.33.2";
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {gpuRetirementBlocked} from './gpu-attempt-retirement.js';
import {createNativeEqualizationScope} from './equalization-native-owner.js';
import {createNative16EqualizationGpuProgram,native16EqualizationGpuProgramDescriptor} from './equalization-native-gpu.js';

const MAX_BAND_BYTES=32*1024**2,LITTLE_ENDIAN=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;
const bytesOf=data=>new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
// Same rows and same program serve a provisional grid, an ordinary final and
// an unpublished in-place adjustment bank. Resolution is never changed here.
export async function applyNativeEqualizationBands(source,program,store,{budget,signal,gpu,containsAll=false,onProgress,nativeGpuRetirement,retirementCacheOwner,retirementOwner,retirementPort='base-gpu'}={}){
 const d=source?.descriptor,g=program?.geometry;
 requireValue(d?.format==='rgb16'&&d.depth===16&&d.width===g?.width&&d.height===g.height&&typeof source.readWindow==='function'&&store?.byteLength===d.width*d.height*6&&typeof store.write==='function'&&budget?.reserve,'Native equalization mapping requires its exact source/program/output bank.');
 const scope=createNativeEqualizationScope(),cooperate=createCooperator(signal),started=performance.now();let gpuProgram,gpuEntry;
 const metrics={sourceReads:0,blocks:0,gpuJobs:0,cpuJobs:0,readMs:0,mapMs:0,writeMs:0,rowsPerBlock:0};
 const canGpu=!!gpu?.available&&containsAll;
 try{
  if(canGpu)gpuProgram=createNative16EqualizationGpuProgram(program.luts,g,{budget,signal,onOwner:value=>{gpuEntry=scope.adopt(value);}});
  const descriptor=canGpu?native16EqualizationGpuProgramDescriptor(g):null;
  const maximumRows=Math.min(d.height,Math.max(1,Math.floor(MAX_BAND_BYTES/(d.width*6))));
  const sourcePlan=(y,rows)=>{
   const rect={x:0,y,width:d.width,height:rows},actual=source.readWindowPlan?.(rect);
   if(actual)requireValue(actual.known===true&&actual.outputBytes===d.width*rows*6&&Number.isSafeInteger(actual.additionalBytes)&&actual.additionalBytes>=0,'Native equalization mapping needs the actual Source window plan.');
   return{rect,bytes:d.width*rows*6+(actual?.additionalBytes??4*1024**2+Math.max(d.width,d.height)*6)};
  };
  const chooseRows=y=>{
   let lo=0,hi=Math.min(maximumRows,d.height-y);
   while(lo<hi){const rows=Math.ceil((lo+hi)/2),read=sourcePlan(y,rows),plan=canGpu&&gpu.available?gpu.admissionPlanProgram(d.width,rows,rows,descriptor,{budget}):null;
    const known=!plan||plan.known===true,extra=plan?.available?(plan.missingResidentBytes+plan.hostBytes):0;
    if(known&&read.bytes+extra+4*1024**2<=budget.limit-budget.total()){lo=rows;}else hi=rows-1;
   }
   if(!lo)throw new EngineError('MEMORY_LIMIT','One complete native equalization row cannot be admitted with its actual Source/GPU workspaces.');return lo;
  };
  for(let y=0;y<d.height;){
   await cooperate();const rows=chooseRows(y),read=sourcePlan(y,rows),at=performance.now();
   const part=await source.readWindow(read.rect,{signal}),loan=scope.adopt(part,'release');metrics.sourceReads++;metrics.readMs+=performance.now()-at;
   let failed=false,primary,mappedEntry,mapped;
   try{
    requireValue(part.pixels?.data instanceof Uint16Array&&part.pixels.data.length===d.width*rows*3,'Native equalization Source returned another working depth or extent.');
    const mapStarted=performance.now();
    if(canGpu&&gpu.available){
     const result=await gpu.runNativeProgram(part.pixels,gpuProgram,0,rows,{signal,nativeOriginX:0,nativeOriginY:y,nativeGpuRetirement,
      retirementTicket:nativeGpuRetirement?.expect(retirementPort,retirementOwner,'equalization16-map-band'),retirementCacheOwner});
     if(result){mapped=result.bytes;mappedEntry=scope.adopt(result,'release');metrics.gpuJobs++;}
    }
    if(!mapped){mapped=program.map(part.pixels.data,{x:0,y,width:d.width,height:rows});metrics.cpuJobs++;}
    metrics.mapMs+=performance.now()-mapStarted;checkAbort(signal);const writeStarted=performance.now(),bytes=bytesOf(mapped);
    if(LITTLE_ENDIAN)await store.write(bytes,y*d.width*6,{signal});
    else{for(let i=0;i<bytes.length;i+=2){const a=bytes[i];bytes[i]=bytes[i+1];bytes[i+1]=a;}try{await store.write(bytes,y*d.width*6,{signal});}finally{for(let i=0;i<bytes.length;i+=2){const a=bytes[i];bytes[i]=bytes[i+1];bytes[i+1]=a;}}}
    metrics.writeMs+=performance.now()-writeStarted;
   }catch(error){failed=true;primary=error;scope.adoptFailure(error);throw error;}
   finally{
    // A submitted borrower with a failed ACK still owns the Source loan and
    // packed table. Keep the enclosing scope reachable for explicit retry.
    if(!failed||!gpuRetirementBlocked(primary)){
     try{if(mappedEntry)await scope.drop(mappedEntry);await scope.drop(loan);}
     catch(cleanup){throw withRetirementOwner(failed?primary:cleanup,scope,cleanup);}
    }
   }
   y+=rows;metrics.blocks++;metrics.rowsPerBlock=Math.max(metrics.rowsPerBlock,rows);onProgress?.({phase:'equalization-render',fraction:y/d.height});
  }
  await store.flush();checkAbort(signal);if(gpuEntry)await scope.drop(gpuEntry);await scope.dispose();
  return{...metrics,backend:metrics.gpuJobs?'webgpu':'cpu',totalMs:performance.now()-started,gpuFallback:gpu?.snapshot?.().gpuFallback??null};
 }catch(error){scope.adoptFailure(error);if(gpuRetirementBlocked(error))throw withRetirementOwner(error,scope,error);try{await scope.dispose();}catch(cleanup){throw withRetirementOwner(error,scope,cleanup);}throw error;}
}
