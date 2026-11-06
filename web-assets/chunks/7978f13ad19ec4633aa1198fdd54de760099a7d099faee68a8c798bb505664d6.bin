import "../../runtime-context.js?v=0.31.0";
import {createSegmentedBytes} from './segmented-bytes.js';
import {createTemporarySession} from './temporary-storage.js';
import {createRgbSurface} from './rgb-surface.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {checkAbort,requireValue,EngineError,serializeEngineError} from './errors.js';
import {createElaSynthesisMedianWorkspace,reduceElaSynthesisBlock} from './ela-synthesis-median.js';
import {migrationWorkspaceBytes,missingMigrationWorkspaceBytes} from './migration-workspace.js';
const MiB=1024**2;

// One frame-major temporary byte store, not N live native images. Each append
// is acknowledged before its native surface may retire. Reduction admits only
// N matching byte blocks and a reusable channel vector at any one time.
export async function createElaSynthesisAccumulator({width,height,count,budget,nativeHeadroomBytes=budget?.limit,temporarySession,getTemporarySession,onTemporarySession,createStore=createSegmentedBytes,createSession=createTemporarySession},{signal}={}){
 const frameBytes=width*height*3,totalBytes=frameBytes*count;
 requireValue([width,height,count,frameBytes,totalBytes].every(Number.isSafeInteger)&&width>0&&height>0&&count>0&&count<=256,'Safe native dimensions and an effective synthesis axis are required.');
 requireValue(budget?.reserve&&budget?.total,'A shared synthesis budget is required.');checkAbort(signal);
 requireValue(Number.isSafeInteger(nativeHeadroomBytes)&&nativeHeadroomBytes>=0,'A complete native synthesis headroom is required.');
 let ownSession=null,sessionTask=null,stack=null,output=null,reductionWorkspace=null,appended=0,pending=null,closing=false,closed=false,disposal=null;
 const session=async hooks=>temporarySession??await getTemporarySession?.(hooks)??await(sessionTask??=Promise.resolve(createSession({budget,...hooks})).then(value=>{ownSession=value;onTemporarySession?.({id:value.id,backend:value.backend});return value;}));
 const storage={budget,temporarySession,getTemporarySession:session,owner:'ela-synthesis',label:'ela-synthesis-frames'};
 const chunkBytes=4*MiB,migrationBytes=temporarySession?.backend!=='opfs'?migrationWorkspaceBytes(totalBytes,temporarySession):0;
 // Admit the entire logical bank without evicting useful native caches. The
 // complete future native bound is additional headroom, never a RAM fraction.
 const admission={budgetBytes:budget.limit,occupiedBytes:budget.total(),logicalBytes:totalBytes,bankBytes:Math.min(chunkBytes,totalBytes),migrationWorkspaceBytes:missingMigrationWorkspaceBytes(budget,migrationBytes),nativeHeadroomBytes};
 const ramAdmitted=!budget.isBackingUnderPressure?.('array-buffer')&&admission.occupiedBytes+totalBytes+admission.bankBytes+admission.migrationWorkspaceBytes+nativeHeadroomBytes<=budget.limit;
 let storageInitial=ramAdmitted?'memory':'temporary',spills=0,temporaryRefused=false,initialStorageFailure=null,appendReadWindows=0;
 try{
  try{stack=await createStore(totalBytes,{...storage,storage:storageInitial,signal});}
  catch(error){checkAbort(signal);
   const refusedTemporary=storageInitial==='temporary';
   // Never replace a real temporary-storage refusal with an impossible RAM
   // reservation. This gate uses the CURRENT engine ledger, not host RAM or
   // the Native/GUI grant. The future native bound may be conservative/unknown,
   // but the whole exact bank and its physical write/migration windows must fit.
   const logicalRamFits=!budget.isBackingUnderPressure?.('array-buffer')&&budget.total()+totalBytes+Math.min(chunkBytes,totalBytes)+missingMigrationWorkspaceBytes(budget,migrationBytes)<=budget.limit;
   if(refusedTemporary?(!['STORAGE_UNAVAILABLE','STORAGE_QUOTA','STORAGE_IO'].includes(error?.code)||!logicalRamFits):!['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code))throw error;
   initialStorageFailure=serializeEngineError(error);temporaryRefused=refusedTemporary;storageInitial=refusedTemporary?'memory':'temporary';
   try{stack=await createStore(totalBytes,{...storage,storage:storageInitial,signal});}
   catch(fallback){checkAbort(signal);if(error&&typeof error==='object'&&Object.isExtensible(error))try{error.details={...error.details,storageFallbackFailure:serializeEngineError(fallback)};}catch{}throw error;}
  }checkAbort(signal);stack.markCold?.();
 }catch(error){await retireCompositeOwners([()=>stack?.dispose(),()=>ownSession?.dispose()],{primary:error});throw error;}
 function run(callback){
  requireValue(!closed&&!closing,'Synthesis accumulator is closed.');if(pending)throw new EngineError('BUSY','Another synthesis phase is active.');
  const task=Promise.resolve().then(()=>{stack?.markCold?.(false);return callback();});pending=task;void task.finally(()=>{stack?.markCold?.();if(pending===task)pending=null;}).catch(()=>{});return task;
 }
 return{
  width,height,count,frameBytes,get appended(){return appended;},get intermediateBytes(){return totalBytes;},
  // If temporary storage was already refused, the exact RAM bank remains
  // authoritative. The native adapter's normal reservations still decide
  // whether its actual work fits; an unknown conservative bound cannot turn
  // an otherwise valid RAM-only computation into a mandatory storage error.
  prepareNative(bytes,{signal}={}){return run(async()=>{checkAbort(signal);requireValue(Number.isSafeInteger(bytes)&&bytes>=0,'A complete native synthesis headroom is required.');if(stack?.storage==='memory'&&!temporaryRefused&&budget.total()+bytes>budget.limit){await stack.spill({signal});checkAbort(signal);spills++;}return{storage:stack?.storage,spills,temporaryRefused};});},
  append(surface,{index=appended,signal,onProgress}={}){return run(async()=>{
   checkAbort(signal);requireValue(index===appended&&index<count&&surface?.descriptor?.format==='rgb8'&&surface.descriptor.width===width&&surface.descriptor.height===height&&typeof surface.readWindow==='function','A complete ordered native RGB8 synthesis frame is required.');
   // Larger admitted windows avoid thousands of tiny storage transactions. A
   // wide row is still split when its complete native width exceeds workspace.
   const readBytes=Math.max(3,Math.min(4*MiB,Math.floor(Math.max(0,budget.limit-budget.total())/9)*3)),columns=Math.min(width,Math.floor(readBytes/3)),rows=columns===width?Math.max(1,Math.floor(readBytes/(width*3))):1;
   for(let y=0;y<height;y+=rows)for(let x=0;x<width;x+=columns){checkAbort(signal);const w=Math.min(columns,width-x),h=Math.min(rows,height-y),part=await surface.readWindow({x,y,width:w,height:h},{signal});appendReadWindows++;
    try{const pixels=part.pixels;requireValue(pixels?.format==='rgb8'&&pixels.width===w&&pixels.height===h&&pixels.data instanceof Uint8Array&&pixels.data.length===w*h*3,'Synthesis native read returned another RGB8 window.');
     requireValue(w===width||h===1,'A partial synthesis row cannot span multiple native rows.');await stack.write(pixels.data,index*frameBytes+(y*width+x)*3,{signal});checkAbort(signal);
    }finally{await part.release();}
   }
   await stack.flush();checkAbort(signal);appended++;onProgress?.({phase:'ela-synthesis-append',completed:appended,total:count,fraction:appended/count});return{appended,total:count};
  });},
  finish({signal,onProgress,maximumWorkingBytes=Math.min(16*MiB,Math.floor(budget.limit/8))}={}){return run(async()=>{
   checkAbort(signal);requireValue(appended===count,'All synthesis frames must be complete before reduction.');
   requireValue(!reductionWorkspace,'The previous synthesis reduction owner must retire before another finish.');
   requireValue(Number.isSafeInteger(maximumWorkingBytes)&&maximumWorkingBytes>=count+3*(count+1),'Synthesis reduction workspace is too small.');
   let workspace,surface,failed=false,primary;
   try{
    workspace=await createElaSynthesisMedianWorkspace({count,frameBytes,maximumWorkingBytes,budget,signal});reductionWorkspace=workspace;const {blockBytes,workingBytes,backend,fallbackReason}=workspace;
    output=await createStore(frameBytes,{...storage,storage:'auto',signal,label:'ela-synthesis-median'});
    for(let offset=0;offset<frameBytes;offset+=blockBytes){checkAbort(signal);const bytes=Math.min(blockBytes,frameBytes-offset),block=workspace.matrix.subarray(0,bytes*count),target=workspace.output.subarray(0,bytes);
     for(let q=0;q<count;q++){checkAbort(signal);await stack.readInto(block.subarray(q*bytes,(q+1)*bytes),q*frameBytes+offset,{signal});checkAbort(signal);}
     await reduceElaSynthesisBlock(block,target,workspace.values,{signal,workspace,budget});await output.write(target,offset,{signal});checkAbort(signal);onProgress?.({phase:'ela-synthesis-median',completed:offset+bytes,total:frameBytes,fraction:(offset+bytes)/frameBytes});
    }
    await output.flush();checkAbort(signal);await stack.dispose();stack=null;checkAbort(signal);
    // No output surface is published until the independent reduction owner
    // has acknowledged retirement. A refusal remains owned for dispose retry.
    await workspace.dispose();reductionWorkspace=null;workspace=null;checkAbort(signal);const resultStore=output;surface=createRgbSurface(output,{width,height,budget});output=null;
    // A private temporary session can outlive reduction only with its published
    // surface. Its retirement remains an acknowledged retryable surface owner.
    if(ownSession){const held=ownSession,original=surface.dispose;surface.dispose=()=>retireCompositeOwners([original,()=>held.dispose()]);ownSession=null;}
    return{surface,readInto:(target,offset,options)=>resultStore.readInto(target,offset,options),metrics:{frames:count,intermediateBytes:totalBytes,intermediateInitialStorage:storageInitial,intermediateSpills:spills,intermediateRamAdmitted:ramAdmitted,intermediateAdmission:admission,...(initialStorageFailure?{intermediateInitialStorageFailure:initialStorageFailure}:{}),appendReadWindows,reductionBlockBytes:blockBytes,reductionWorkingBytes:workingBytes,reductionBackend:backend,...(fallbackReason?{reductionFallbackReason:fallbackReason}:{}),median:count&1?{rank:count>>1,count}:{centralRanks:[(count>>1)-1,count>>1],count,quantization:'uint8-truncation-after-central-mean'},nativeAnalysisCalls:0}};
   }catch(error){failed=true;primary=error;await retireCompositeOwners([async()=>{await surface?.dispose();surface=null;},async()=>{await output?.dispose();output=null;}],{primary:error});throw error;}
   finally{await retireCompositeOwners([async()=>{await workspace?.dispose();if(reductionWorkspace===workspace)reductionWorkspace=null;}],failed?{primary}:{});}
  });},
  dispose(){if(disposal)return disposal;if(closed)return Promise.resolve();closing=true;const task=(async()=>{await pending?.catch(()=>{});await retireCompositeOwners([()=>reductionWorkspace?.dispose(),()=>stack?.dispose(),()=>output?.dispose(),()=>ownSession?.dispose()]);reductionWorkspace=stack=output=ownSession=null;closed=true;})();disposal=task;void task.catch(()=>{if(disposal===task)disposal=null;});return task;}
 };
}
