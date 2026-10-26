import "../runtime-context.js?v=0.25.0";
/** Independent spatial feature grids, one shared native Comprint population.
 * No synthetic spatial adjacency is introduced by the contiguous feature bank.
 * The existing official feature/basis/ten-EM worker operations are unchanged.
 */
import {createSegmentedBytes} from '../unified-engine/src/segmented-bytes.js';
import {createComprintTemporarySession} from './comprint-storage.js';
import {comprintFeatureWindow} from './comprint-streaming-statistics.js';
import {comprintContextPopulation,comprintContextFingerprintMoments} from './comprint-context-population.js';
async function settleAll(jobs){const results=await Promise.allSettled(jobs),failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;return results.map(r=>r.value);}
const MiB=1024**2,tensor=(data,dims=[data.length])=>({data,dims}),abort=signal=>{if(signal?.aborted)throw signal.reason??new DOMException('Cancelled','AbortError');};
function windowPlane(source,width,rect){const result=new Float32Array(rect.width*rect.height);for(let y=0;y<rect.height;y++)result.set(source.subarray((rect.y+y)*width+rect.x,(rect.y+y)*width+rect.x+rect.width),y*rect.width);return result;}
export async function analyzeComprintNativePopulation({contexts,main,call,fitSlots,retireFits,featureSlots,retireFeatures,resourceSnapshot=()=>({}),budget,getTemporarySession,temporarySession,storage='temporary',signal,onProgress,maxWorkers=4,blockColumns=256,chunkedEM=true}){
 if(!budget)throw Error('Segmented Comprint requires the shared memory budget');
 const nativeCall=call;call=async(...args)=>{abort(signal);const value=await nativeCall(...args);abort(signal);return value;};
 if(!Number.isSafeInteger(blockColumns)||blockColumns<1||blockColumns>256)throw Error('Invalid Comprint feature window width');
 const started=performance.now(),population=comprintContextPopulation(contexts),grid={cells:population.cells},blockRows=8;
 if(!grid.cells)throw Error('No native context has a complete SPAM cell');
 const columns=Math.max(1,population.maximumColumns),chunkCells=blockRows*columns;let moments;
 let validity,sum;
 let ownedSession,storageFallback;
 const banks=[],timings={},resources=[],observe=phase=>resources.push({phase,...resourceSnapshot()}),options={budget,getTemporarySession,temporarySession,storage,signal,owner:'comprint-statistics',chunkBytes:4*MiB};let validCount=0;
 const featureBytes=grid.cells*512*4,projectionBytes=grid.cells*32*8;
 const workspace=budget.reserve(chunkCells*512*4*3+64*MiB+grid.cells*9+population.grids.length*256);let primary;
 try{
  validity=new Uint8Array(grid.cells);sum=new Float64Array(512);
  moments=await comprintContextFingerprintMoments(contexts,{signal});
  if(storage==='temporary'){
   const supplied=temporarySession??await getTemporarySession?.({signal});
   // Prefer worker OPFS for large banks. An already supplied core IndexedDB
   // session remains a valid alternative if OPFS SESSION SETUP is unavailable.
   // Never switch backend after a bank has been created or data computed.
   if(supplied?.backend==='opfs')options.temporarySession=supplied;
   else try{options.temporarySession=ownedSession=await createComprintTemporarySession({budget});}
   catch(error){
    abort(signal);
    if(!['STORAGE_UNAVAILABLE','STORAGE_IO'].includes(error.code)||supplied?.backend!=='indexeddb'||typeof supplied.create!=='function')throw error;
    options.temporarySession=supplied;storageFallback={from:'opfs',to:'indexeddb',code:error.code};
    onProgress?.({phase:'comprint-storage-fallback',...storageFallback});
   }
   options.getTemporarySession=undefined;
  }
  const features=await createSegmentedBytes(featureBytes,{...options,label:'comprint-global-SPAM512'});banks.push(features);
 const desiredFeatureWorkers=Math.min(6,maxWorkers,Math.ceil(columns/blockColumns)),featureResidentBytes=512*MiB+408*MiB;
  // Try reclaimable idle resources before selecting useful resident workers.
  try{if(budget.reclaim)await budget.reclaim((desiredFeatureWorkers-1)*featureResidentBytes,{signal,owner:'comprint-statistics'});else budget.room((desiredFeatureWorkers-1)*featureResidentBytes);}catch(error){if(error.code!=='MEMORY_LIMIT')throw error;}
  const featureWidth=Math.max(1,Math.min(desiredFeatureWorkers,1+Math.floor((budget.limit-budget.total())/featureResidentBytes))),featureWorkers=[main,...featureSlots(featureWidth-1)];
  let stage=performance.now();
  for(const g of population.grids){
   if(!g.cells)continue;const source=contexts[g.index];
   for(let row=0;row<g.rows;row+=blockRows){
    abort(signal);const nr=Math.min(blockRows,g.rows-row),band=new Float32Array(nr*g.columns*512);
    for(let columnBase=0;columnBase<g.columns;columnBase+=blockColumns*featureWorkers.length){
     const parts=await settleAll(featureWorkers.map(async(worker,at)=>{
      const column=columnBase+at*blockColumns;if(column>=g.columns)return null;
      const nc=Math.min(blockColumns,g.columns-column),rect=comprintFeatureWindow(g.width,g.height,row,column,nr,nc);
      const result=await call(worker,'feature_chunk',{luminance:tensor(windowPlane(source.luminance,g.width,rect),[rect.height,rect.width]),fingerprint:tensor(windowPlane(source.fingerprint,g.width,rect),[rect.height,rect.width]),moments:tensor(Float64Array.of(moments.mean,moments.variance)),crop:tensor(Int32Array.from(rect.crop))},{signal,onProgress});return{column,nc,result};
     }));
     for(const part of parts)if(part){const{column,nc,result}=part,values=result.outputs.features.data,valid=result.outputs.valid.data;if(!(values instanceof Float32Array)||values.length!==nr*nc*512||!(valid instanceof Uint8Array)||valid.length!==nr*nc)throw Error('Native Comprint feature window geometry changed');for(let y=0;y<nr;y++){band.set(values.subarray(y*nc*512,(y+1)*nc*512),(y*g.columns+column)*512);validity.set(valid.subarray(y*nc,(y+1)*nc),g.start+(row+y)*g.columns+column);}}
    }
    for(let y=0;y<nr;y++)for(let x=0;x<g.columns;x++)if(validity[g.start+(row+y)*g.columns+x]){validCount++;const at=(y*g.columns+x)*512;for(let j=0;j<512;j++)sum[j]+=band[at+j];}
    await features.write(new Uint8Array(band.buffer),(g.start+row*g.columns)*512*4,{signal});onProgress?.({phase:'comprint-native-context-features',contextIndex:g.index,completed:g.start+Math.min(row+nr,g.rows)*g.columns,total:grid.cells});
   }
  }
  await features.flush();timings.features=(performance.now()-stage)/1000;observe('features-complete');if(validCount<50)throw Error('Too few valid SPAM blocks');
  // Reuse already loaded feature workers for the independent Gram products.
  const mean=Float64Array.from(sum,v=>v/validCount),workers=Math.max(1,Math.min(featureWorkers.length,maxWorkers,6,Math.floor(validCount/50))),fits=featureWorkers.slice(0,workers),covariance=new Float64Array(512*512);
  stage=performance.now();
  for(let at=0;at<grid.cells;at+=chunkCells*workers){
   abort(signal);const parts=await settleAll(fits.map(async(s,i)=>{
    const begin=at+i*chunkCells;if(begin>=grid.cells)return null;const n=Math.min(chunkCells,grid.cells-begin),band=new Float32Array(n*512);
    await features.readInto(new Uint8Array(band.buffer),begin*512*4,{signal});const valid=validity.slice(begin,begin+n);
    return call(s,'covariance_chunk',{features:tensor(band,[n,512]),valid:tensor(valid),mean:tensor(mean)},{signal,onProgress});
   }));for(const part of parts)if(part){const values=part.outputs.covariance.data;for(let i=0;i<values.length;i++)covariance[i]+=values[i];}
   onProgress?.({phase:'comprint-native-global-covariance',completed:Math.min(at+chunkCells*workers,grid.cells),total:grid.cells});
  }
  observe('covariance-complete');await retireFeatures();timings.covariance=(performance.now()-stage)/1000;const basis=await call(main,'stream_basis',{covariance:tensor(covariance,[512,512]),count:tensor(Float64Array.of(validCount))},{signal,onProgress});
  const projected=await createSegmentedBytes(projectionBytes,{...options,label:'comprint-global-PCA32'});banks.push(projected);
  const trainingReservation=budget.reserve(validCount*32*8);let training,trainingBacking;
  const releaseTraining=()=>{training=null;const retired=trainingBacking?.();trainingBacking=null;if(retired>0)budget.notifyBackingRelease?.('array-buffer',retired);trainingReservation();};
  try{
   training=new Float64Array(globalThis.crossOriginIsolated&&typeof SharedArrayBuffer==='function'?new SharedArrayBuffer(validCount*32*8):new ArrayBuffer(validCount*32*8));trainingBacking=budget.registerBacking?.('array-buffer',training.byteLength,{owner:'comprint-statistics',label:'full-PCA32-training',identity:training.buffer,state:'materialized'});let trainingAt=0;stage=performance.now();
   for(let at=0;at<grid.cells;at+=chunkCells){
    abort(signal);const n=Math.min(chunkCells,grid.cells-at),band=new Float32Array(n*512);await features.readInto(new Uint8Array(band.buffer),at*512*4,{signal});
    const part=await call(main,'project_chunk',{features:tensor(band,[n,512]),basis:basis.outputs.basis},{signal,onProgress}),values=part.outputs.projected.data;
    await projected.write(new Uint8Array(values.buffer),at*32*8,{signal});
    for(let i=0;i<n;i++)if(validity[at+i]){training.set(values.subarray(i*32,(i+1)*32),trainingAt*32);trainingAt++;}
    onProgress?.({phase:'comprint-native-global-projection',completed:Math.min(at+n,grid.cells),total:grid.cells});
   }
   await projected.flush();await features.dispose();timings.projection=(performance.now()-stage)/1000;
   // Full original EM, never an image subset. Heap follows its actual N×32 data.
   const fitHeapBytes=Math.ceil(Math.max(256*MiB,chunkedEM?training.byteLength+validCount*16+256*MiB:training.byteLength*5+160*MiB)/(64*MiB))*64*MiB;
   if(fitHeapBytes>2048*MiB)throw Object.assign(new Error('Comprint exact EM working set exceeds the qualified 2 GiB worker ceiling'),{code:'COMPRINT_EM_MEMORY',details:{validCount,fitHeapBytes}});
   await retireFits();stage=performance.now();
   const perFit=fitHeapBytes+200*MiB,shared=typeof SharedArrayBuffer==='function'&&training.buffer instanceof SharedArrayBuffer;
   // All caller-owned inputs and local training/workspaces are already charged.
   // Reclaim idle contexts, then use only the current common-budget headroom.
   const desiredFits=Math.min(maxWorkers,shared?6:1);
   try{if(budget.reclaim)await budget.reclaim(desiredFits*perFit,{signal,owner:'comprint-statistics'});else budget.room(desiredFits*perFit);}catch(error){if(error.code!=='MEMORY_LIMIT')throw error;}
   const available=budget.limit-budget.total(),emWorkers=Math.max(1,Math.min(desiredFits,Math.floor(available/perFit))),emFits=fitSlots(emWorkers,fitHeapBytes);
   onProgress?.({phase:'comprint-stream-em',workers:emWorkers,replicates:10,fitHeapBytes});
   const initialized=await call(emFits[0],chunkedEM?'retain_training_chunked':'retain_training',{training:tensor(training,[validCount,32])},{signal,onProgress});
   await settleAll(emFits.slice(1).map(s=>call(s,'retain_training_only',{training:tensor(training,[validCount,32])},{signal,onProgress})));releaseTraining();
   const select=(v,indices)=>{const n=v.data.length/v.dims[0],out=new v.data.constructor(indices.length*n);indices.forEach((index,at)=>out.set(v.data.subarray(index*n,(index+1)*n),at*n));return tensor(out,[indices.length,...v.dims.slice(1)]);};
   const batches=await settleAll(emFits.map((s,at)=>{const indices=Array.from({length:10},(_,i)=>i).filter(i=>i%emWorkers===at);return call(s,chunkedEM?'fit_retained_chunked':'fit_retained',{indices:tensor(Int32Array.from(indices)),mu:select(initialized.outputs.mu,indices),Sigma:select(initialized.outputs.Sigma,indices),prior:select(initialized.outputs.prior,indices)},{signal,onProgress});}));
   const candidates=new Array(10);for(const batch of batches)for(let at=0;at<batch.outputs.indices.data.length;at++)candidates[batch.outputs.indices.data[at]]={batch,at,score:batch.outputs.score.data[at],iterations:batch.outputs.iterations.data[at]};
   let best=0;for(let i=1;i<10;i++)if(candidates[i].score>candidates[best].score)best=i;
   if(!Number.isFinite(candidates[best].score))throw Error('Comprint exact EM produced no finite winner');
   timings.em=(performance.now()-stage)/1000;const fitted=candidates[best].batch,local=candidates[best].at,pick=v=>{const n=v.data.length/v.dims[0];return tensor(v.data.slice(local*n,(local+1)*n),v.dims.slice(1));},parameters={mu:pick(fitted.outputs.mu),Sigma:pick(fitted.outputs.Sigma),prior:pick(fitted.outputs.prior),outlier:tensor(Float64Array.of(fitted.outputs.outlier.data[local]))};
   observe('em-complete');await retireFits();observe('em-workers-retired');
   const map=new Float64Array(grid.cells);stage=performance.now();
   for(let at=0;at<grid.cells;at+=8192){abort(signal);const n=Math.min(8192,grid.cells-at),values=new Float64Array(n*32);await projected.readInto(new Uint8Array(values.buffer),at*32*8,{signal});const result=await call(main,'finish_chunk',{...parameters,projected:tensor(values,[n,32])},{signal,onProgress});map.set(result.outputs.map.data,at);}
   timings.finish=(performance.now()-stage)/1000;timings.total=(performance.now()-started)/1000;
   return {outputs:{map:tensor(map,[grid.cells]),valid:tensor(validity,[grid.cells]),eigs:basis.outputs.eigs},metadata:{method:'comprint',statistics_policy:chunkedEM?'official-Comprint-native-contexts-global-chunked-EM-f64':'official-Comprint-native-contexts-global-f64',source_revision:'e79cd7d9bc768cde6d0fbf77d4cea79ec31ce2aa',native_context_grids:population.grids,feature_population_cells:grid.cells,observation_pixels:population.pixels,valid_blocks:validCount,spam_features:512,pca_dimensions:32,replicates:10,max_iterations:100,seed:0,score_is_probability:false,ground_truth_available:false,timings_seconds:timings,normalization:moments,resources,segmentation:{blockRows,blockColumns,haloCells:2,featureBytes,projectionBytes,storage:features.storage,temporaryBackend:options.temporarySession?.backend??'caller-provided',temporaryFallback:storageFallback??null,fitHeapBytes,chunkedEM,trainingBytes:validCount*32*8,resize:false,subsample:false},parallel:{workers,feature_workers:featureWorkers.length,em_workers:emWorkers,iterations:candidates.map(value=>value.iterations),initial_indices:Array.from(initialized.outputs.initial_indices.data),winning_replicate:best,likelihoods:candidates.map(value=>value.score)}}};
  }finally{releaseTraining();}
 }catch(error){primary=error;throw error;}finally{const failures=[];for(const bank of banks)try{await bank.dispose();}catch(error){failures.push(error);}try{await ownedSession?.dispose();}catch(error){failures.push(error);}finally{workspace();}if(failures.length){if(primary&&Object.isExtensible(primary))primary.comprintCleanupErrors=failures.map(e=>({message:e.message,code:e.code}));else if(!primary)throw new AggregateError(failures,'Comprint native population cleanup failed');}}
}
