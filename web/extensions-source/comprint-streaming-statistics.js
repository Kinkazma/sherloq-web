/** Global Comprint statistics with bounded feature windows and lossless banks. */
import {createSegmentedBytes} from '../engine-source/src/segmented-bytes.js';
import {createComprintTemporarySession} from './comprint-storage.js';
const MiB=1024**2,f=Math.fround,tensor=(data,dims=[data.length])=>({data,dims});
const abort=signal=>{if(signal?.aborted)throw signal.reason??new DOMException('Cancelled','AbortError');};

// NumPy's contiguous float32 pairwise summation, PW_BLOCKSIZE=128. This keeps
// the global fingerprint normalization when no WASM heap holds the whole image.
function pairwise(values,start,n,transform){
 if(n<8){let r=f(-0);for(let i=0;i<n;i++)r=f(r+transform(values[start+i]));return r;}
 if(n<=128){
  const r=Array.from({length:8},(_,i)=>transform(values[start+i]));let i=8;
  for(;i<n-(n%8);i+=8)for(let j=0;j<8;j++)r[j]=f(r[j]+transform(values[start+i+j]));
  let result=f(f(f(r[0]+r[1])+f(r[2]+r[3]))+f(f(r[4]+r[5])+f(r[6]+r[7])));
  for(;i<n;i++)result=f(result+transform(values[start+i]));return result;
 }
 let half=Math.floor(n/2);half-=half%8;return f(pairwise(values,start,half,transform)+pairwise(values,start+half,n-half,transform));
}
export function comprintFingerprintMoments(values){
 if(!(values instanceof Float32Array)||!values.length)throw Error('Comprint float32 fingerprint required');
 // The pinned NumPy reduction iterator presents 8192-value external-loop
 // buffers; each buffer uses pairwise128 and updates the float32 accumulator.
 const reduce=transform=>{let sum=f(0);for(let at=0;at<values.length;at+=8192)sum=f(sum+pairwise(values,at,Math.min(8192,values.length-at),transform));return sum;};
 const mean=f(reduce(v=>v)/values.length);
 const variance=f(reduce(v=>{const z=f(v-mean);return f(z*z);})/values.length);
 if(!Number.isFinite(variance)||variance<=0)throw Error('Insufficient fingerprint variation');return {mean,variance};
}
export function comprintGrid(width,height){
 const rows=Math.floor((height-4)/8)-11,columns=Math.floor((width-4)/8)-11;
 if(rows<1||columns<1)throw Error('Comprint requires enough native pixels for SPAM');return {rows,columns,cells:rows*columns};
}
/** Conservative phase plan, excluding caller-owned source/luma/fingerprint.
 * All cells are treated as valid until measured; smaller real training reduces
 * the fit heap. No fixed application budget is selected by this estimator.
 */
export function estimateComprintStatisticsPlan(width,height,{maxWorkers=4,availableBytes=Infinity,mainHeapBytes=768*MiB,featureHeapBytes=512*MiB,chunkedEM=true,blockColumns=256}={}){
 const grid=comprintGrid(width,height),trainingBytes=grid.cells*32*8,posteriorBytes=grid.cells*2*8,hostWorkspaceBytes=8*grid.columns*512*4*3+64*MiB,temporaryBrokerBytes=16*MiB,outputGridBytes=grid.cells*9+(grid.rows+grid.columns)*8+512*8;
 const mainResidentBytes=mainHeapBytes+408*MiB,featureResidentBytes=featureHeapBytes+408*MiB,fitHeapBytes=Math.ceil(Math.max(256*MiB,chunkedEM?trainingBytes+posteriorBytes+256*MiB:trainingBytes*5+160*MiB)/(64*MiB))*64*MiB,fitResidentBytes=fitHeapBytes+200*MiB;
 const variants=[];
  for(let workers=1;workers<=Math.min(6,Math.max(1,Math.trunc(maxWorkers)));workers++){
  const featureWorkers=Math.min(workers,Math.ceil(grid.columns/blockColumns)),base=mainResidentBytes+hostWorkspaceBytes+temporaryBrokerBytes+outputGridBytes;
  const phases={featuresCovarianceBytes:base+(featureWorkers-1)*featureResidentBytes,projectionBytes:base+trainingBytes,emBytes:base+trainingBytes+workers*fitResidentBytes,returnedGridBytes:mainResidentBytes+outputGridBytes};
  variants.push({workers,featureWorkers,bytes:Math.max(...Object.values(phases)),phases});
 }
 const selected=variants.filter(value=>value.bytes<=availableBytes).at(-1)??null;
 return {grid,trainingWorstBytes:trainingBytes,posteriorWorstBytes:posteriorBytes,hostWorkspaceBytes,temporaryBrokerBytes,outputGridBytes,mainHeapBytes,mainResidentBytes,featureHeapBytes,featureResidentBytes,fitHeapBytes,fitResidentBytes,callerLuminanceFingerprintBytes:width*height*8,callerFullFloat64RasterBytes:width*height*8,temporarySPAMBytes:grid.cells*512*4,temporaryPCABytes:trainingBytes,chunkedEM,variants,minimumBytes:variants[0].bytes,preferredBytes:variants.at(-1).bytes,selected};
}
export function comprintFeatureWindow(width,height,row,column,rows,columns,haloCells=2){
 const grid=comprintGrid(width,height),top=Math.max(0,row-haloCells),left=Math.max(0,column-haloCells),endRow=Math.min(grid.rows,row+rows+haloCells),endColumn=Math.min(grid.columns,column+columns+haloCells);
 const x=left*8,y=top*8,right=endColumn===grid.columns?width:(endColumn+11)*8+4,bottom=endRow===grid.rows?height:(endRow+11)*8+4;
 return {x,y,width:right-x,height:bottom-y,crop:[row-top,column-left,rows,columns]};
}
function windowPlane(source,width,rect){const result=new Float32Array(rect.width*rect.height);for(let y=0;y<rect.height;y++)result.set(source.subarray((rect.y+y)*width+rect.x,(rect.y+y)*width+rect.x+rect.width),y*rect.width);return result;}

/** The caller owns admitted persistent workers; banks share its common budget. */
export async function analyzeComprintStreaming({luminance,fingerprint,width,height,main,call,fitSlots,retireFits,featureSlots,retireFeatures,resourceSnapshot=()=>({}),budget,getTemporarySession,temporarySession,storage='temporary',signal,onProgress,maxWorkers=4,blockColumns=256,chunkedEM=true}){
 if(!budget)throw Error('Segmented Comprint requires the shared memory budget');
 if(!Number.isSafeInteger(blockColumns)||blockColumns<1||blockColumns>256)throw Error('Invalid Comprint feature window width');
 const started=performance.now(),grid=comprintGrid(width,height),moments=comprintFingerprintMoments(fingerprint),blockRows=8;
 const validity=new Uint8Array(grid.cells),range0=Float64Array.from({length:grid.rows},(_,i)=>49.5+i*8),range1=Float64Array.from({length:grid.columns},(_,i)=>49.5+i*8),sum=new Float64Array(512);
 let ownedSession,storageFallback;
 const banks=[],timings={},resources=[],observe=phase=>resources.push({phase,...resourceSnapshot()}),options={budget,getTemporarySession,temporarySession,storage,signal,owner:'comprint-statistics',chunkBytes:4*MiB};let validCount=0;
 const featureBytes=grid.cells*512*4,projectionBytes=grid.cells*32*8;
 const workspace=budget.reserve(blockRows*grid.columns*512*4*3+64*MiB);
 try{
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
  const desiredFeatureWorkers=Math.min(6,maxWorkers,Math.ceil(grid.columns/blockColumns)),featureResidentBytes=512*MiB+408*MiB;
  // Try reclaimable idle resources before selecting useful resident workers.
  try{if(budget.reclaim)await budget.reclaim((desiredFeatureWorkers-1)*featureResidentBytes,{signal,owner:'comprint-statistics'});else budget.room((desiredFeatureWorkers-1)*featureResidentBytes);}catch(error){if(error.code!=='MEMORY_LIMIT')throw error;}
  const featureWidth=Math.max(1,Math.min(desiredFeatureWorkers,1+Math.floor((budget.limit-budget.total())/featureResidentBytes))),featureWorkers=[main,...featureSlots(featureWidth-1)];
  let stage=performance.now();
  for(let row=0;row<grid.rows;row+=blockRows){
   abort(signal);const nr=Math.min(blockRows,grid.rows-row),band=new Float32Array(nr*grid.columns*512);
   for(let columnBase=0;columnBase<grid.columns;columnBase+=blockColumns*featureWorkers.length){
    const parts=await Promise.all(featureWorkers.map(async(worker,at)=>{
     const column=columnBase+at*blockColumns;if(column>=grid.columns)return null;
     const nc=Math.min(blockColumns,grid.columns-column),rect=comprintFeatureWindow(width,height,row,column,nr,nc);
     const result=await call(worker,'feature_chunk',{luminance:tensor(windowPlane(luminance,width,rect),[rect.height,rect.width]),fingerprint:tensor(windowPlane(fingerprint,width,rect),[rect.height,rect.width]),moments:tensor(Float64Array.of(moments.mean,moments.variance)),crop:tensor(Int32Array.from(rect.crop))},{signal,onProgress});return {column,nc,result};
    }));
    for(const part of parts)if(part){const {column,nc,result}=part,values=result.outputs.features.data,valid=result.outputs.valid.data;for(let y=0;y<nr;y++){band.set(values.subarray(y*nc*512,(y+1)*nc*512),(y*grid.columns+column)*512);validity.set(valid.subarray(y*nc,(y+1)*nc),(row+y)*grid.columns+column);}}
   }
   for(let y=0;y<nr;y++)for(let x=0;x<grid.columns;x++)if(validity[(row+y)*grid.columns+x]){validCount++;const at=(y*grid.columns+x)*512;for(let j=0;j<512;j++)sum[j]+=band[at+j];}
   await features.write(new Uint8Array(band.buffer),row*grid.columns*512*4,{signal});onProgress?.({phase:'comprint-stream-features',completed:Math.min(row+nr,grid.rows),total:grid.rows});
  }
  await features.flush();timings.features=(performance.now()-stage)/1000;observe('features-complete');if(validCount<50)throw Error('Too few valid SPAM blocks');
  // Reuse already loaded feature workers for the independent Gram products.
  const mean=Float64Array.from(sum,v=>v/validCount),workers=Math.max(1,Math.min(featureWorkers.length,maxWorkers,6,Math.floor(validCount/50))),fits=featureWorkers.slice(0,workers),covariance=new Float64Array(512*512);
  stage=performance.now();
  for(let row=0;row<grid.rows;row+=blockRows*workers){
   abort(signal);const parts=await Promise.all(fits.map(async(s,i)=>{
    const begin=row+i*blockRows;if(begin>=grid.rows)return null;const nr=Math.min(blockRows,grid.rows-begin),band=new Float32Array(nr*grid.columns*512);
    await features.readInto(new Uint8Array(band.buffer),begin*grid.columns*512*4,{signal});const valid=validity.slice(begin*grid.columns,(begin+nr)*grid.columns);
    return call(s,'covariance_chunk',{features:tensor(band,[nr*grid.columns,512]),valid:tensor(valid),mean:tensor(mean)},{signal,onProgress});
   }));for(const part of parts)if(part){const values=part.outputs.covariance.data;for(let i=0;i<values.length;i++)covariance[i]+=values[i];}
   onProgress?.({phase:'comprint-stream-covariance',completed:Math.min(row+blockRows*workers,grid.rows),total:grid.rows});
  }
  observe('covariance-complete');await retireFeatures();timings.covariance=(performance.now()-stage)/1000;const basis=await call(main,'stream_basis',{covariance:tensor(covariance,[512,512]),count:tensor(Float64Array.of(validCount))},{signal,onProgress});
  const projected=await createSegmentedBytes(projectionBytes,{...options,label:'comprint-global-PCA32'});banks.push(projected);
  const trainingReservation=budget.reserve(validCount*32*8);let training,trainingBacking;
  const releaseTraining=()=>{training=null;const retired=trainingBacking?.();trainingBacking=null;if(retired>0)budget.notifyBackingRelease?.('array-buffer',retired);trainingReservation();};
  try{
   training=new Float64Array(globalThis.crossOriginIsolated&&typeof SharedArrayBuffer==='function'?new SharedArrayBuffer(validCount*32*8):new ArrayBuffer(validCount*32*8));trainingBacking=budget.registerBacking?.('array-buffer',training.byteLength,{owner:'comprint-statistics',label:'full-PCA32-training',identity:training.buffer,state:'materialized'});let trainingAt=0;stage=performance.now();
   for(let row=0;row<grid.rows;row+=blockRows){
    abort(signal);const nr=Math.min(blockRows,grid.rows-row),band=new Float32Array(nr*grid.columns*512);await features.readInto(new Uint8Array(band.buffer),row*grid.columns*512*4,{signal});
    const part=await call(main,'project_chunk',{features:tensor(band,[nr*grid.columns,512]),basis:basis.outputs.basis},{signal,onProgress}),values=part.outputs.projected.data;
    await projected.write(new Uint8Array(values.buffer),row*grid.columns*32*8,{signal});
    for(let i=0;i<nr*grid.columns;i++)if(validity[row*grid.columns+i]){training.set(values.subarray(i*32,(i+1)*32),trainingAt*32);trainingAt++;}
    onProgress?.({phase:'comprint-stream-projection',completed:Math.min(row+nr,grid.rows),total:grid.rows});
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
   await Promise.all(emFits.slice(1).map(s=>call(s,'retain_training_only',{training:tensor(training,[validCount,32])},{signal,onProgress})));releaseTraining();
   const select=(v,indices)=>{const n=v.data.length/v.dims[0],out=new v.data.constructor(indices.length*n);indices.forEach((index,at)=>out.set(v.data.subarray(index*n,(index+1)*n),at*n));return tensor(out,[indices.length,...v.dims.slice(1)]);};
   const batches=await Promise.all(emFits.map((s,at)=>{const indices=Array.from({length:10},(_,i)=>i).filter(i=>i%emWorkers===at);return call(s,chunkedEM?'fit_retained_chunked':'fit_retained',{indices:tensor(Int32Array.from(indices)),mu:select(initialized.outputs.mu,indices),Sigma:select(initialized.outputs.Sigma,indices),prior:select(initialized.outputs.prior,indices)},{signal,onProgress});}));
   const candidates=new Array(10);for(const batch of batches)for(let at=0;at<batch.outputs.indices.data.length;at++)candidates[batch.outputs.indices.data[at]]={batch,at,score:batch.outputs.score.data[at],iterations:batch.outputs.iterations.data[at]};
   let best=0;for(let i=1;i<10;i++)if(candidates[i].score>candidates[best].score)best=i;
   if(!Number.isFinite(candidates[best].score))throw Error('Comprint exact EM produced no finite winner');
   timings.em=(performance.now()-stage)/1000;const fitted=candidates[best].batch,local=candidates[best].at,pick=v=>{const n=v.data.length/v.dims[0];return tensor(v.data.slice(local*n,(local+1)*n),v.dims.slice(1));},parameters={mu:pick(fitted.outputs.mu),Sigma:pick(fitted.outputs.Sigma),prior:pick(fitted.outputs.prior),outlier:tensor(Float64Array.of(fitted.outputs.outlier.data[local]))};
   observe('em-complete');await retireFits();observe('em-workers-retired');
   const map=new Float64Array(grid.cells);stage=performance.now();
   for(let at=0;at<grid.cells;at+=8192){abort(signal);const n=Math.min(8192,grid.cells-at),values=new Float64Array(n*32);await projected.readInto(new Uint8Array(values.buffer),at*32*8,{signal});const result=await call(main,'finish_chunk',{...parameters,projected:tensor(values,[n,32])},{signal,onProgress});map.set(result.outputs.map.data,at);}
   timings.finish=(performance.now()-stage)/1000;timings.total=(performance.now()-started)/1000;
   return {outputs:{map:tensor(map,[grid.rows,grid.columns]),valid:tensor(validity,[grid.rows,grid.columns]),range0:tensor(range0),range1:tensor(range1),eigs:basis.outputs.eigs},metadata:{method:'comprint',statistics_policy:chunkedEM?'official-Comprint-global-segmented-chunked-EM-f64':'official-Comprint-global-segmented-f64',source_revision:'e79cd7d9bc768cde6d0fbf77d4cea79ec31ce2aa',original_shape:[height,width],grid_shape:[grid.rows,grid.columns],valid_blocks:validCount,spam_features:512,pca_dimensions:32,replicates:10,max_iterations:100,seed:0,score_is_probability:false,ground_truth_available:false,timings_seconds:timings,normalization:moments,resources,segmentation:{blockRows,blockColumns,haloCells:2,featureBytes,projectionBytes,storage:features.storage,temporaryBackend:options.temporarySession?.backend??'caller-provided',temporaryFallback:storageFallback??null,fitHeapBytes,chunkedEM,trainingBytes:validCount*32*8,resize:false,subsample:false},parallel:{workers,feature_workers:featureWorkers.length,em_workers:emWorkers,iterations:candidates.map(value=>value.iterations),initial_indices:Array.from(initialized.outputs.initial_indices.data),winning_replicate:best,likelihoods:candidates.map(value=>value.score)}}};
  }finally{releaseTraining();}
 }finally{try{await Promise.allSettled(banks.map(bank=>bank.dispose()));await ownedSession?.dispose();}finally{workspace();}}
}
