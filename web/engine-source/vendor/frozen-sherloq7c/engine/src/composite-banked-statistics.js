import {createNumericBank} from './numeric-bank.js';
import {compositeBankedEm} from './composite-banked-em.js';
import {checkAbort,requireValue,EngineError} from './errors.js';
const MiB=1024**2,tensor=(data,dims=[data.length])=>({data,dims});
/** Global SPAM/PCA and EM; only lossless storage and local receptive halos are
 * divided. Every valid cell contributes to the same image covariance/model. */
export async function compositeBankedStatistics(gray,noise,width,height,{budget,statistics,profile,getTemporarySession,signal,onProgress,storage='auto'}={}){
 const ny=Math.floor((height-4)/8)-11,nx=Math.floor((width-4)/8)-11,cells=ny*nx;requireValue(ny>0&&nx>0,'Composite source is too small.');
 const owned=new Set(),make=async(Type,shape)=>{const bytes=Type.BYTES_PER_ELEMENT*shape.reduce((a,b)=>a*b,1),bank=await createNumericBank(Type,shape,{budget,signal,storage:storage==='auto'?(bytes>Math.min(budget.limit/12,(budget.limit-budget.total())/4)?'temporary':'memory'):storage,getTemporarySession});owned.add(bank);return bank;},drop=async t=>{if(owned.delete(t))await t.dispose();};
 const run=(op,inputs,workspaceBytes,outputBytes)=>statistics.run(op,inputs,{signal,onProgress,workspaceBytes,outputBytes});
 const outputLease=budget.reserve(cells*10+(nx+ny)*8+512*512*16+512*32*8+1024**2);let fit;
 try{
  const weights=await make(Uint8Array,[height,width]),weightRows=Math.max(1,Math.min(128,Math.floor(32*MiB/(width*32))));
  for(let y=0;y<height;y+=weightRows){
   const rows=Math.min(weightRows,height-y),lo=Math.max(0,y-20),hi=Math.min(height,y+rows+20),g=await gray.readRows(lo,hi-lo,{signal});let n,r;
   try{n=await noise.readRows(lo,hi-lo,{signal});r=await run('stream:weights',{gray:tensor(g.data,[hi-lo,width]),noise:tensor(n.data,[hi-lo,width])},(hi-lo)*width*24,(hi-lo)*width);await weights.writeRows(y,rows,r.result.weights.data.subarray((y-lo)*width,(y-lo+rows)*width),{signal});}finally{r?.release();n?.release();g.release();}
  }
  const features=await make(Float32Array,[cells,512]),valid=new Uint8Array(cells),step=Math.max(1,Math.min(32,Math.floor(Math.min(32*MiB,budget.limit/32)/(nx*2048))));let count=0;
  for(let a=0;a<ny;a+=step){
   checkAbort(signal);const b=Math.min(ny,a+step),lo=Math.max(0,(a-8)*8),hi=Math.min(height,(b+20)*8+4),pixels=(hi-lo)*width,n=await noise.readRows(lo,hi-lo,{signal});let w,r;
   try{w=await weights.readRows(lo,hi-lo,{signal});r=await run('stream:features',{noise:tensor(n.data,[hi-lo,width]),weights:tensor(w.data,[hi-lo,width]),rows:tensor(Int32Array.of(a,b,lo))},pixels*112,(b-a)*nx*2049);requireValue(r.result.features.dims.join(',')===[b-a,nx,512].join(','),'SPAM window geometry mismatch.');await features.writeRows(a*nx,(b-a)*nx,r.result.features.data,{signal});valid.set(r.result.valid.data,a*nx);for(const v of r.result.valid.data)count+=v!==0;}finally{r?.release();w?.release();n.release();}onProgress?.({phase:'composite-features',completed:b,total:ny});
  }await drop(weights);
  if(count<50)throw new EngineError('STATISTICS_EXECUTION','Too few valid blocks for a splicing map. The noise estimate remains available.');
  let sum=new Float64Array(512),covariance=new Float64Array(512*512),L,eigs,pcaRegularized;
  for(let at=0;at<cells;at+=step*nx){const rows=Math.min(step*nx,cells-at),part=await features.readRows(at,rows,{signal});let r;try{r=await run('stream:mean',{features:tensor(part.data,[rows,1,512]),valid:tensor(valid.subarray(at,at+rows),[rows,1]),sum:tensor(sum)},part.data.byteLength*3+MiB,4096);sum=r.result.sum.data;}finally{r?.release();part.release();}}
  const mean=Float64Array.from(sum,v=>v/count);
  for(let at=0;at<cells;at+=step*nx){const rows=Math.min(step*nx,cells-at),part=await features.readRows(at,rows,{signal});let r;try{r=await run('stream:covariance',{features:tensor(part.data,[rows,1,512]),valid:tensor(valid.subarray(at,at+rows),[rows,1]),mean:tensor(mean),covariance:tensor(covariance,[512,512])},part.data.byteLength*4+8*MiB,512*512*8);covariance=r.result.covariance.data;}finally{r?.release();part.release();}onProgress?.({phase:'composite-covariance',completed:at+rows,total:cells});}
  {const r=await run('stream:basis',{covariance:tensor(covariance,[512,512]),count:tensor(Int32Array.of(count),[])},64*MiB,512*32*8+4100);try{L=r.result.L.data;eigs=r.result.eigs.data;pcaRegularized=r.result.pca_regularized_components;}finally{r.release();}}
  const projected=await make(Float64Array,[cells,32]),training=await make(Float64Array,[count,32]);let trainingAt=0;
  for(let at=0;at<cells;at+=step*nx){const rows=Math.min(step*nx,cells-at),part=await features.readRows(at,rows,{signal});let r,scratch;
   try{r=await run('stream:project',{features:tensor(part.data,[rows,1,512]),L:tensor(L,[512,32])},part.data.byteLength*2+MiB,rows*256);const data=r.result.projected.data;await projected.writeRows(at,rows,data,{signal});let selected=0;for(let i=0;i<rows;i++)selected+=valid[at+i]!==0;
    if(selected){scratch=budget.reserve(selected*256);const subset=new Float64Array(selected*32);let dst=0;for(let i=0;i<rows;i++)if(valid[at+i]){subset.set(data.subarray(i*32,(i+1)*32),dst);dst+=32;}await training.writeRows(trainingAt,selected,subset,{signal});trainingAt+=selected;}
   }finally{scratch?.();r?.release();part.release();}
  }await drop(features);statistics.clear();
  fit=await compositeBankedEm(training,{budget,statistics,profile,getTemporarySession,signal,onProgress,storage});await drop(training);const selected=fit.model,map=new Float64Array(cells);
  for(let at=0;at<cells;at+=step*nx){const rows=Math.min(step*nx,cells-at),part=await projected.readRows(at,rows,{signal});let r;try{r=await run('stream:distances',{projected:tensor(part.data,part.dims),...Object.fromEntries(['Sigma','mu','prioriProb','outliersProb'].map(k=>[k,selected[k]]))},part.data.byteLength*5+MiB,rows*8);map.set(r.result.map.data,at);}finally{r?.release();part.release();}}
  await drop(projected);for(const v of map)requireValue(Number.isFinite(v),'Nonfinite statistical map.');
  const range0=Float64Array.from({length:ny},(_,i)=>49.5+8*i),range1=Float64Array.from({length:nx},(_,i)=>49.5+8*i);let grid;
  {const r=await run('bank:map-grid',{map:tensor(map,[ny,nx]),valid:tensor(valid,[ny,nx])},cells*32,cells);try{grid=r.result.grid.data;}finally{r.release();}}
  const result={map:tensor(map,[ny,nx]),valid:tensor(valid,[ny,nx]),range0:tensor(range0),range1:tensor(range1),L:tensor(L,[512,32]),eigs:tensor(eigs),pca_regularized_components:pcaRegularized,covariance_regularizations:selected.covariance_regularizations,covariance_reference_scale:selected.covariance_reference_scale,Sigma:selected.Sigma,mu:selected.mu,model_conditioning:selected.model_conditioning,outliersProb:selected.outliersProb,outliersNlogl:tensor(Float64Array.of(42),[])};
  return {result,grid,execution:{featureRows:step,globalPca:true,globalEm:true,fitWorkers:fit.fitWorkers,bestReplicate:fit.bestReplicate,replicates:fit.replicates,validCells:count,featureStorage:features.storage},release:outputLease};
 }catch(e){outputLease();throw e;}finally{fit?.release();for(const t of [...owned])await drop(t);}
}
