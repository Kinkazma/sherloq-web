import {NativeStatistics} from './native-statistics.js';
import {checkAbort,EngineError,requireValue} from './errors.js';
const MiB=1024**2,tensor=(data,dims=[data.length])=>({data,dims});
/** Exact native SPAM histograms with global weights, global PCA and ten EM fits.
 * Only storage and independent model fits are partitioned; no per-tile detector. */
export async function compositeStream(gray,noise,width,height,{budget,statistics,runtime,profile,signal,onProgress}={}){
 const ny=Math.floor((height-4)/8)-11,nx=Math.floor((width-4)/8)-11,cells=ny*nx;
 requireValue(nx>0&&ny>0,'Composite source is too small.');
 const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const hooks={signal:controller.signal,onProgress},chunks=[],models=new Array(10),leases=[];let weightsResult,releaseOutput;
 const keep=bytes=>{const release=budget.reserve(bytes);leases.push(release);return release;};
 const run=(operation,inputs,workspaceBytes,outputBytes,worker=statistics)=>worker.run('stream:'+operation,inputs,{...hooks,workspaceBytes,outputBytes});
 try{
  const n=width*height;
  // Feature rows are phase-aligned to native stride 8; full-image weights are
  // computed first so morphology/filter borders never restart at a tile edge.
  const releaseFeatures=keep(cells*2048);
  keep(cells*257+512*512*16+1024*1024);
  weightsResult=await run('weights',{gray:tensor(gray,[height,width]),noise:tensor(noise,[height,width])},24*n,n);
  const weights=weightsResult.result.weights.data,step=Math.max(1,Math.min(32,Math.floor(Math.min(32*MiB,budget.limit/32)/(nx*2048))));
  const valid=new Uint8Array(cells);let count=0;
  for(let a=0;a<ny;a+=step){
   checkAbort(hooks.signal);const b=Math.min(ny,a+step),lo=Math.max(0,(a-8)*8),hi=Math.min(height,(b+20)*8+4),pixels=(hi-lo)*width,lease=budget.reserve(pixels*5);let output;
   try{
    output=await run('features',{noise:tensor(noise.slice(lo*width,hi*width),[hi-lo,width]),weights:tensor(weights.slice(lo*width,hi*width),[hi-lo,width]),rows:tensor(Int32Array.of(a,b,lo))},pixels*112,(b-a)*nx*2049);
    const f=output.result.features,v=output.result.valid;requireValue(f.dims.join(',')===[b-a,nx,512].join(','),'SPAM row geometry mismatch.');valid.set(v.data,a*nx);for(const value of v.data)count+=value!==0;
    chunks.push({start:a*nx,rows:b-a,features:f.data,valid:v.data});
   }finally{output?.release();lease();}
   onProgress?.({phase:'composite-features',completed:b,total:ny,fraction:b/ny});
  }
  weightsResult.release();weightsResult=null;
  if(count<50)throw new EngineError('STATISTICS_EXECUTION','Too few valid blocks for a splicing map. The noise estimate remains available.');
  let sum=new Float64Array(512),covariance=new Float64Array(512*512),L,eigs,pcaRegularized;
  for(const c of chunks){const r=await run('mean',{features:tensor(c.features,[c.rows,nx,512]),valid:tensor(c.valid,[c.rows,nx]),sum:tensor(sum)},c.features.byteLength*3+MiB,4096);try{sum=r.result.sum.data;}finally{r.release();}}
  const mean=Float64Array.from(sum,x=>x/count);
  for(const [index,c]of chunks.entries()){
   const r=await run('covariance',{features:tensor(c.features,[c.rows,nx,512]),valid:tensor(c.valid,[c.rows,nx]),mean:tensor(mean),covariance:tensor(covariance,[512,512])},c.features.byteLength*4+8*MiB,512*512*8);try{covariance=r.result.covariance.data;}finally{r.release();}
   onProgress?.({phase:'composite-covariance',completed:index+1,total:chunks.length,fraction:(index+1)/chunks.length});
  }
  {const r=await run('basis',{covariance:tensor(covariance,[512,512]),count:tensor(Int32Array.of(count),[])},64*MiB,512*32*8+4100);try{L=r.result.L.data;eigs=r.result.eigs.data;pcaRegularized=r.result.pca_regularized_components;}finally{r.release();}}
  const projected=new Float64Array(cells*32);
  for(const c of chunks){const r=await run('project',{features:tensor(c.features,[c.rows,nx,512]),L:tensor(L,[512,32])},c.features.byteLength*2+MiB,c.rows*nx*32*8);try{projected.set(r.result.projected.data,c.start*32);}finally{r.release();}c.features=null;}
  releaseFeatures();
  keep(count*32*8+10*16384);const training=new Float64Array(count*32);let at=0;
  for(let i=0;i<cells;i++)if(valid[i]){training.set(projected.subarray(i*32,(i+1)*32),at);at+=32;}
  const fitWorkspace=training.byteLength*12+16*MiB,fitOutput=16384,cap=Math.ceil((256*MiB+fitWorkspace+training.byteLength+fitOutput)/(16*MiB))*16*MiB;
  const resident=cap+runtime.downloadBytes*2+8*MiB+training.byteLength+fitOutput*2;
  const concurrency=Math.max(1,Math.min(10,profile.maxWorkers,Math.floor((budget.limit-budget.active-budget.cacheBytes)/resident))),workers=Array.from({length:concurrency},(_,i)=>i?new NativeStatistics(budget,runtime):statistics);
  let next=0,completed=0;const deferred=[];
  const fit=async(index,worker)=>{const r=await run('fit',{projected:tensor(training,[count,32]),replicate:tensor(Int32Array.of(index),[])},fitWorkspace,fitOutput,worker);try{models[index]=r.result;}finally{r.release();}completed++;onProgress?.({phase:'fit',completed,total:10,fraction:completed/10});};
  const outcomes=await Promise.allSettled(workers.map(async worker=>{try{while(next<10){const index=next++;try{await fit(index,worker);}catch(e){if(e.code==='MEMORY_LIMIT'){deferred.push(index);break;}controller.abort();throw e;}}}finally{if(worker!==statistics)worker.dispose();}}));
  const failed=outcomes.find(x=>x.status==='rejected');if(failed)throw failed.reason;
  for(const i of deferred)await fit(i,statistics);while(next<10)await fit(next++,statistics);
  let best=0;for(let i=1;i<10;i++)if(models[i].score.data[0]>models[best].score.data[0])best=i;
  const selected=models[best],map=new Float64Array(cells);
  for(let start=0;start<cells;start+=step*nx){
   const end=Math.min(cells,start+step*nx),lease=budget.reserve((end-start)*256);let r;
   try{r=await run('distances',{projected:tensor(projected.slice(start*32,end*32),[end-start,32]),...Object.fromEntries(['Sigma','mu','prioriProb','outliersProb'].map(k=>[k,selected[k]]))},(end-start)*256*5+MiB,(end-start)*8);map.set(r.result.map.data,start);}finally{r?.release();lease();}
  }
  for(const value of map)requireValue(Number.isFinite(value),'Statistical model returned nonfinite values.');
  const range0=Float64Array.from({length:ny},(_,i)=>49.5+8*i),range1=Float64Array.from({length:nx},(_,i)=>49.5+8*i);
  let raster;
  try{
   raster=await run('raster',{map:tensor(map,[ny,nx]),valid:tensor(valid,[ny,nx]),range0:tensor(range0),range1:tensor(range1),imgsize:tensor(Int32Array.of(height,width))},12*n,4*n);
   releaseOutput=budget.reserve(cells*9+(ny+nx)*8+512*32*8+4096+4*n+16384);
   const result={map:tensor(map,[ny,nx]),valid:tensor(valid,[ny,nx]),range0:tensor(range0),range1:tensor(range1),L:tensor(L,[512,32]),eigs:tensor(eigs),pca_regularized_components:pcaRegularized,covariance_regularizations:selected.covariance_regularizations,covariance_reference_scale:selected.covariance_reference_scale,Sigma:selected.Sigma,mu:selected.mu,model_conditioning:selected.model_conditioning,outliersProb:selected.outliersProb,outliersNlogl:tensor(Float64Array.of(42),[]),...raster.result};
   return {result,release:releaseOutput,execution:{featureRows:step,featureChunks:chunks.length,replicates:10,fitWorkers:concurrency,bestReplicate:best,globalPca:true,globalEm:true}};
  }finally{raster?.release();}
 }catch(e){releaseOutput?.();throw e;}finally{weightsResult?.release();for(const release of leases)release();signal?.removeEventListener('abort',abort);}
}
