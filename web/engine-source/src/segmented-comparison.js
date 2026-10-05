import {runPagedComparisonJobs} from './comparison-paged-pool.js';
import {comparisonPagedButteraugli,pagedButteraugliPlan} from './comparison-paged-butteraugli.js';
import {comparisonPagedSsimulacra,pagedSsimulacraPlan} from './comparison-paged-ssimulacra.js';
import {comparisonPagedSewar,pagedSewarPlan} from './comparison-paged-sewar.js';
import {comparisonPagedHistograms,pagedHistogramPlan} from './comparison-paged-histograms.js';
import {comparisonPagedSsim,pagedSsimPlan} from './comparison-paged-ssim.js';
import {comparisonParams} from './comparison.js';
import {ComparisonStagePool,comparisonStageBytes} from './comparison-stage-pool.js';
import {gray,roundEven} from './pixel-utils.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
const MIB=1024**2;
export async function segmentedComparison(image,params,{reference,budget,signal,onProgress,profile={},cache,storage='auto',blockPixels=65536,original=false}={}){
 const p=comparisonParams(params),{width,height}=image.surface.descriptor,n=width*height;
 requireValue(reference?.surface&&reference.surface.descriptor.width===width&&reference.surface.descriptor.height===height,'Evidence and reference must have the same size.');
 requireValue(Number.isInteger(blockPixels)&&blockPixels>=width&&blockPixels<=262144,'Invalid comparison band size.');
 const previous=cache?.reference===reference?cache:null,stages=new Map(previous?.stages),hits={},images=[image,reference],pool=new ComparisonStagePool(budget,profile);let output,planning;
 const specs=[['histograms',2],['sewar',3],['ssimulacra',5],['butteraugli',4],['ssim',1]],jobs=specs.filter(([name])=>p.metrics||p.view===(name==='butteraugli'?'butter':name)).filter(([name])=>{const needView=p.view===(name==='butteraugli'?'butter':name);hits[name]=stages.has(name)&&!needView;return !hits[name];}).map(([name,mode])=>({name,mode,view:p.view===(name==='butteraugli'?'butter':name)}));
 for(const job of jobs)job.paged=[1,2,3,4,5].includes(job.mode)&&(({1:profile.pagedSsim,2:profile.pagedHistograms,3:profile.pagedSewar,5:profile.pagedSsimulacra,4:profile.pagedButteraugli}[job.mode])||width>16384||height>16384||comparisonStageBytes(job.mode,n)+8*MIB+blockPixels*12>Math.min(1900*MIB,budget.limit-budget.retained-budget.active));
 const histogramOptions={resident:profile.histogramResident,cachePages:profile.histogramCachePages};
 const maximum=Math.max(0,...jobs.map(j=>j.paged?(j.mode===1?pagedSsimPlan(width,height,budget,blockPixels):j.mode===2?pagedHistogramPlan(budget,histogramOptions):j.mode===3?pagedSewarPlan(width,height):j.mode===5?pagedSsimulacraPlan(width,height):pagedButteraugliPlan(width,height)).workspace:comparisonStageBytes(j.mode,n))),reserve=maximum+12*MIB+blockPixels*12;
 const nativeJobs=jobs.filter(j=>!j.paged),pagedMetrics=[];
 if(nativeJobs.length&&(width>16384||height>16384||maximum>1900*MIB))throw new EngineError('MEMORY_LIMIT','A global comparison stage exceeds this WASM module capacity.');
 const visit=async(fn,phase,readFirst=true)=>{for(let y=0;y<height;){const rows=Math.min(height-y,Math.max(1,Math.floor(blockPixels/width))),rect={x:0,y,width,height:rows};let a,b;try{if(readFirst)a=await image.surface.readWindow(rect,{signal});b=await reference.surface.readWindow(rect,{signal});await fn(a?.pixels.data,b.pixels.data,y*width);}finally{a?.release();b?.release();}y+=rows;onProgress?.({phase,completed:y*width,total:n});await controlCheckpoint(signal);}};
 try{
  // Output selection accounts for the largest pending global stage and I/O.
  planning=budget.reserve(reserve);output=await createSegmentedBytes(n*3,{budget,chunkBytes:blockPixels*3,storage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});planning();planning=null;
  if(p.metrics&&!stages.has('basic')){
   let sx=0,sy=0,xx=0,yy=0,xy=0,squared=0;
   await visit((a,b)=>{for(let i=0;i<a.length;i+=3){const x=gray(a[i],a[i+1],a[i+2]),y=gray(b[i],b[i+1],b[i+2]);sx+=x;sy+=y;xx+=x*x;yy+=y*y;xy+=x*y;squared+=(x-y)*(x-y);}},'comparison-basic');
   const mx=sx/n,my=sy/n,mse=squared/n,rmse=Math.sqrt(mse),normX=Math.sqrt(xx),normY=Math.sqrt(yy),raw={rmse,sam:Math.acos(Math.min(1,Math.max(-1,xy/(normX*normY)))),ergas:25*Math.sqrt(rmse*rmse/(mx*mx)),mb:(mx-my)/mx,pfe:Math.sqrt(squared)/normX*100,psnr:mse===0?Infinity:10*Math.log10(255**2/mse)},values={},errors={};
   for(const [name,value]of Object.entries(raw)){if(Number.isFinite(value))values[name]=value;else if(name==='psnr'&&value===Infinity)values[name]='+Infinity';else errors[name]='Metric is undefined for this image pair.';}stages.set('basic',{values,errors});
  }else hits.basic=stages.has('basic');
  if(p.view==='normal')await visit(async(_,b,offset)=>output.write(b,offset*3),'comparison-reference',false);
  if(p.view==='difference'){
   let low=255,high=0;await visit(async(a,b,offset)=>{for(let i=0;i<a.length;i++){a[i]=Math.abs(a[i]-b[i]);low=Math.min(low,a[i]);high=Math.max(high,a[i]);}await output.write(a,offset*3);},'comparison-difference');
   const scale=high===low?0:255/(high-low),s=Math.fround(scale),shift=Math.fround(-low*scale);
   await output.visit(async(bytes,offset)=>{for(let i=0;i<bytes.length;i++)bytes[i]=Math.max(0,Math.min(255,roundEven(Math.fround(Math.fround(bytes[i]*s)+shift))));await output.write(bytes,offset);},{signal,blockBytes:blockPixels*3});
  }
  for(const job of jobs)if(job.view)job.output=output;
  const pagedJobs=jobs.filter(j=>j.paged),consumePaged=async(job,result)=>{stages.set(job.name,{score:result.score,values:result.values});pagedMetrics.push({name:job.name,...result.metrics,heapPeak:result.metrics.heapPeak??result.metrics.heapBytes});};
  let pagedWorkers=0;
  if(globalThis.Worker&&profile.pagedMetricWorkers!==false){
   const independent=pagedJobs.filter(j=>j.mode!==1);
   for(const job of independent){job.plan=job.mode===2?pagedHistogramPlan(budget,histogramOptions):job.mode===3?pagedSewarPlan(width,height):job.mode===5?pagedSsimulacraPlan(width,height):pagedButteraugliPlan(width,height);job.options=job.mode===2?{...histogramOptions,...job.plan}:job.mode===3?{arithmetic:profile.sewarArithmetic??'separated'}:{};}
   pagedWorkers=(await runPagedComparisonJobs(independent,images,{budget,profile,signal,onProgress,consume:consumePaged,blockPixels,original})).workers;
  }
  for(const job of pagedJobs.filter(j=>j.mode===1||!globalThis.Worker||profile.pagedMetricWorkers===false)){const result=job.mode===1?await comparisonPagedSsim(images,job.output,{budget,signal,onProgress,profile,blockPixels,original}):job.mode===2?await comparisonPagedHistograms(images,{budget,signal,onProgress,...histogramOptions}):job.mode===3?await comparisonPagedSewar(images,{budget,signal,onProgress,original,arithmetic:profile.sewarArithmetic??'separated'}):job.mode===5?await comparisonPagedSsimulacra(images,{budget,signal,onProgress,original}):await comparisonPagedButteraugli(images,job.output,{budget,signal,onProgress,original});await consumePaged(job,result);}

  await pool.run(nativeJobs,images,{signal,onStage:onProgress,blockPixels,original,consume:async(job,result)=>stages.set(job.name,{values:result.values,score:result.score})});
  if(p.equalized){
   const histogram=new Float64Array(768);await output.visit(bytes=>{for(let i=0;i<bytes.length;i++)histogram[(i%3)*256+bytes[i]]++;},{signal,blockBytes:blockPixels*3});const lut=new Uint8Array(768);
   for(let c=0;c<3;c++){const base=c*256;let first=0;while(first<255&&!histogram[base+first])first++;if(histogram[base+first]===n){lut.fill(first,base,base+256);continue;}const scale=Math.fround(255/Math.fround(n-histogram[base+first]));let sum=0;for(let i=first+1;i<256;i++){sum+=histogram[base+i];lut[base+i]=Math.max(0,Math.min(255,roundEven(Math.fround(Math.fround(sum)*scale))));}}
   await output.visit(async(bytes,offset)=>{for(let i=0;i<bytes.length;i++)bytes[i]=lut[(i%3)*256+bytes[i]];await output.write(bytes,offset);},{signal,blockBytes:blockPixels*3});
  }
  if(p.grayscale)await output.visit(async(bytes,offset)=>{for(let i=0;i<bytes.length;i+=3){const value=gray(bytes[i],bytes[i+1],bytes[i+2]);bytes[i]=bytes[i+1]=bytes[i+2]=value;}await output.write(bytes,offset);},{signal,blockBytes:blockPixels*3});
  await output.flush();checkAbort(signal);const values={},errors={};let histogramCorrelationFullBins,histogramCorrelationBinDivisor;
  if(p.metrics){Object.assign(values,stages.get('basic').values);Object.assign(errors,stages.get('basic').errors);const hist=stages.get('histograms').values;for(const [i,name]of ['hist_0','hist_1','hist_4','hist_2','hist_3','hist_5'].entries())values[name]=hist[i];histogramCorrelationFullBins=hist[6];histogramCorrelationBinDivisor=hist[7];
   for(const [i,name]of ['msssim','rase','scc','uqi','vifp'].entries()){const value=stages.get('sewar').values[i];if(Number.isFinite(value))values[name]=value;else errors[name]='Metric is undefined for this image pair or its dimensions.';}
   const value=stages.get('ssimulacra').values[0];if(Number.isFinite(value)&&value>=0)values.ssimul=value;else errors.ssimul='SSIMULACRA requires at least 8 rows and 8 columns.';
  }
  for(const [name,stage]of [['butter','butteraugli'],['ssim','ssim']])if(p.metrics||p.view===name)values[name]=stages.get(stage).score;
  const execution=pool.metrics();execution.workers=Math.max(execution.workers,pagedWorkers);for(const m of pagedMetrics){execution.workers=Math.max(execution.workers,m.workers);execution.completedMetricJobs++;execution.workerHeapPeakBytes=Math.max(execution.workerHeapPeakBytes,m.heapPeak);}
  return {surface:createRgbSurface(output,{width,height,budget}),comparisonCache:{reference,stages},data:{referenceImageId:p.referenceImageId,values,errors,metricsRequested:p.metrics,...(p.metrics?{histogramCorrelationFullBins,histogramCorrelationBinDivisor,warnings:histogramCorrelationBinDivisor===65536?{hist_0:'Historical native correlation uses 65,536 entries for a 16,777,216-bin histogram and may exceed [-1,1]. Use histogramCorrelationFullBins for ordinary correlation interpretation.'}:{}}:{}),unavailableMetrics:[]},semantics:'Native equal-size global image comparison. Oriented sources and result use segmented storage; global metric workspaces are separately admitted and are not independently tiled. Similarity is not an authenticity verdict.',metrics:{...execution,pagedStages:pagedMetrics,storage:output.storage,blockPixels,cache:{stages:hits},globalStageMaximumBytes:maximum}};
 }catch(error){await output?.dispose();throw error;}finally{planning?.();pool.clear();}
}
