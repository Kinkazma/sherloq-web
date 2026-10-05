import "../../runtime-context.js?v=0.14.5";
import {NativeStatistics} from './native-statistics.js';
import {createNumericBank} from './numeric-bank.js';
import {checkAbort} from './errors.js';
const MiB=1024**2,tensor=(data,dims=[data.length])=>({data,dims});
/** Native global EM with complete training rows, external posterior banks and
 * two-pass centered covariance. The model and its convergence rule are intact. */
export async function compositeBankedEm(training,{budget,statistics,getTemporarySession,signal,onProgress,storage='auto',chunkRows=16384,profile={maxWorkers:1}}={}){
 const count=training.shape[0],rows=Math.min(chunkRows,count),lease=budget.reserve(256*1024),controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const externalSignal=signal;signal=controller.signal;
 const run=async(op,inputs,workspaceBytes=16*MiB,outputBytes=65536)=>statistics.run('bank:'+op,inputs,{signal,onProgress,workspaceBytes,outputBytes});
 const keep=async(op,inputs,workspaceBytes,outputBytes)=>{const r=await run(op,inputs,workspaceBytes,outputBytes);try{return r.result;}finally{r.release();}};
 try{
  let sum=new Float64Array(32);
  for(let at=0;at<count;at+=rows){const part=await training.readRows(at,Math.min(rows,count-at),{signal});try{sum=(await keep('initial-sum',{projected:tensor(part.data,part.dims),sum:tensor(sum)},part.data.byteLength*3+MiB,256)).sum.data;}finally{part.release();}}
  const mean=Float64Array.from(sum,v=>v/count);sum=new Float64Array(32);
  for(let at=0;at<count;at+=rows){const part=await training.readRows(at,Math.min(rows,count-at),{signal});try{sum=(await keep('initial-variance',{projected:tensor(part.data,part.dims),mean:tensor(mean),sum:tensor(sum)},part.data.byteLength*4+MiB,256)).sum.data;}finally{part.release();}}
  const variance=Float64Array.from(sum,v=>v/count),indices=(await keep('initial-indices',{count:tensor(Int32Array.of(count),[])})).indices.data,models=[];
  const runFit=async(replicate,worker)=>{
  const run=(op,inputs,workspaceBytes=16*MiB,outputBytes=65536)=>worker.run('bank:'+op,inputs,{signal,onProgress,workspaceBytes,outputBytes});
  const keep=async(op,inputs,workspaceBytes,outputBytes)=>{const r=await run(op,inputs,workspaceBytes,outputBytes);try{return r.result;}finally{r.release();}};
  const post=await createNumericBank(Float64Array,[count,2],{budget,signal,storage:storage==='auto'?(count*16>budget.limit/12?'temporary':'memory'):storage,getTemporarySession});
  async function expectation(model){
   const counts=new Float64Array(2),weighted=new Float64Array(64);let scoreSum=0;
   for(let at=0;at<count;at+=rows){
    const n=Math.min(rows,count-at),part=await training.readRows(at,n,{signal});let result;
    try{result=await run('expectation',{projected:tensor(part.data,part.dims),...model},part.data.byteLength*10+MiB,n*16+4096);const r=result.result;await post.writeRows(at,n,r.post.data,{signal});for(let i=0;i<2;i++)counts[i]+=r.counts.data[i];for(let i=0;i<64;i++)weighted[i]+=r.weighted.data[i];scoreSum+=r.scoreSum.data[0];}finally{result?.release();part.release();}
   }return {counts,mean:Float64Array.from(weighted,v=>v/counts[0]),score:scoreSum/count};
  }
  try{
   checkAbort(signal);const point=await training.readRows(indices[replicate],1,{signal});let model;
   try{model=await keep('initial-model',{point:tensor(point.data,[1,32]),variance:tensor(variance)});}finally{point.release();}
   let e=await expectation(model),flag=1,iteration=0;
   for(;iteration<100;iteration++){
    let covariance=new Float64Array(1024);
    for(let at=0;at<count;at+=rows){const n=Math.min(rows,count-at),x=await training.readRows(at,n,{signal});let p;
     try{p=await post.readRows(at,n,{signal});covariance=(await keep('covariance',{projected:tensor(x.data,x.dims),post:tensor(p.data,p.dims),mean:tensor(e.mean,[2,32]),covariance:tensor(covariance,[32,32])},x.data.byteLength*6+MiB,8192)).covariance.data;}finally{p?.release();x.release();}
    }
    model=await keep('maximization',{covariance:tensor(covariance,[32,32]),mean:tensor(e.mean,[2,32]),counts:tensor(e.counts),covariance_reference_scale:model.covariance_reference_scale,covariance_regularizations:model.covariance_regularizations});
    const next=await expectation(model),difference=next.score-e.score;e=next;onProgress?.({phase:'composite-global-em',replicate:replicate+1,iteration:iteration+1,score:e.score,total:10});
    if(difference>=0&&difference<1e-5*Math.abs(e.score)){flag=0;break;}
   }
   model.model_conditioning=(await keep('conditioning',{Sigma:model.Sigma})).model_conditioning;model.score=tensor(Float64Array.of(e.score),[]);model.fitExit=tensor(Int32Array.of(flag,Math.min(99,iteration)));return model;
  }finally{await post.dispose();}
  };
  const workspace=rows*32*8*10+MiB,cap=Math.ceil((256*MiB+workspace+rows*32*8+rows*16+4096)/(16*MiB))*16*MiB,resident=cap+statistics.runtime.downloadBytes*2+8*MiB+rows*32*8+rows*32;
  const concurrency=Math.max(1,Math.min(10,profile.maxWorkers,Math.floor((budget.limit-budget.total()+statistics.resident)/resident))),workers=Array.from({length:concurrency},(_,i)=>i?new NativeStatistics(budget,statistics.runtime):statistics);let next=0,completed=0,firstFailure;
  const outcomes=await Promise.allSettled(workers.map(async worker=>{try{while(next<10){const i=next++;models[i]=await runFit(i,worker);onProgress?.({phase:'fit',completed:++completed,total:10});}}catch(e){firstFailure??=e;controller.abort();throw e;}finally{if(worker!==statistics)worker.dispose();}}));
  const failed=outcomes.find(r=>r.status==='rejected');if(failed)throw firstFailure??failed.reason;
  let best=0;for(let i=1;i<10;i++)if(models[i].score.data[0]>models[best].score.data[0])best=i;
  return {model:models[best],bestReplicate:best,fitWorkers:concurrency,replicates:models.map(m=>({score:m.score.data[0],exit:[...m.fitExit.data]})),release:lease};
 }catch(e){lease();throw e;}finally{externalSignal?.removeEventListener('abort',abort);}
}
