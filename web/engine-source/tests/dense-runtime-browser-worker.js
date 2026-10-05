import {Budget} from '../src/cache.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {DenseImageEngine} from '../src/dense-image.js';
import {PagedDenseImageEngine} from '../src/dense-paged-image.js';
import {DENSE_PROFILES} from '../src/dense-profiles.js';
import {DensePagedFieldPool} from '../src/dense-paged-field-pool.js';
import {createTemporarySession} from '../src/temporary-storage.js';

function equal(a,b,name){if(a.length!==b.length||!a.every((value,index)=>value===b[index]))throw Error(name+' differs');}
self.onmessage=async()=>{
 const width=149,height=127,budget=new Budget(512*1024**2),data=Uint8Array.from({length:width*height*3},(_,i)=>((i%(width*3/2|0))*37+(i/width/3|0)*71)%256);let surface,paged,direct,result,reference;
 try{
  const source=await createSegmentedBytes(data.byteLength,{budget,storage:'memory'});await source.write(data);surface=createRgbSurface(source,{width,height,budget});
  paged=new PagedDenseImageEngine({surface},budget,{maxWorkers:3});direct=new DenseImageEngine({width,height,data},new Budget(512*1024**2),{maxWorkers:2});
  const params={profile:DENSE_PROFILES[5],patch:8,iterations:2,radius:80,texture:0,coherence:false,limit:90};
  result=await paged.analyze(params);reference=await direct.analyze(params);
  if(result.fields.length!==11)throw Error('Eleven global hypotheses required');
  for(let index=0;index<result.fields.length;index++){
   const a=result.fields[index],b=reference.fields[index];if(a.comparisons!==b.comparisons||a.uniqueLinks!==b.uniqueLinks)throw Error('Field counters differ '+index);
   equal(a.displayRows,b.displayRows,'display '+index);
   for(const key of ['targets','distancesSquared','allowed','selected']){const actual=new Uint8Array(b[key].byteLength);await a[key].readInto(actual);equal(actual,new Uint8Array(b[key].buffer,b[key].byteOffset,b[key].byteLength),key+' '+index);}
  }
  const metrics=result.metrics;if(crossOriginIsolated&&(!metrics.parallel.workerJobs||metrics.parallel.peakWorkers<2))throw Error('Parallel shared field workers did not overlap');
  await result.release();result=null;await reference.release();reference=null;
  result=await paged.analyze({...params,threshold:.2,limit:17});if(!result.metrics.cache.field)throw Error('Refilter reran matching');await result.release();result=null;
  await paged.dispose();paged=null;await direct.dispose();direct=null;
  const stopping=new PagedDenseImageEngine({surface},budget,{maxWorkers:2});let disposing,cancelledAnalysis=false;
  try{const unexpected=await stopping.analyze({...params,profile:DENSE_PROFILES[0],iterations:20},{onProgress:progress=>{if(progress.phase==='global-patchmatch'&&!disposing)disposing=stopping.dispose();}});await unexpected.release();}catch(error){if(error.code!=='CANCELLED')throw error;cancelledAnalysis=true;}finally{await stopping.dispose();await disposing;}
  if(!cancelledAnalysis||budget.total()!==data.byteLength)throw Error('Engine disposal left active workers or owned fields');
  const failing=new PagedDenseImageEngine({surface},budget,{maxWorkers:3,workerFactory:()=>({terminate(){},postMessage(){setTimeout(()=>this.onmessage?.({data:{error:{code:'STORAGE_IO',message:'Injected primary field failure'}}}),0);}})});let primaryError;
  try{await failing.analyze(params);}catch(error){primaryError=error;}finally{await failing.dispose();}
  if(primaryError?.code!=='STORAGE_IO'||primaryError.message!=='Injected primary field failure'||budget.total()!==data.byteLength)throw Error('Concurrent cancellation masked the primary field failure or leaked resources');
  await surface.dispose();surface=null;if(budget.total())throw Error('Analysis ownership leak '+budget.total());
  if(crossOriginIsolated){
   const first=await createSegmentedBytes(192*160*48,{budget,shared:true}),mask=await createSegmentedBytes(192*160,{budget,shared:true});await first.write(new Uint8Array(first.byteLength));await mask.write(new Uint8Array(mask.byteLength).fill(1));const controller=new AbortController(),pool=new DensePagedFieldPool(budget,{maxWorkers:2}),before=budget.total();
   let cancelled=false;try{await pool.start({first,mask,width:192,height:160,dimensions:12},{iterations:20,signal:controller.signal,onProgress:()=>controller.abort()});}catch(error){if(error.code!=='CANCELLED')throw error;cancelled=true;}if(!cancelled||budget.total()!==before)throw Error('Field cancellation did not release resources');first.write(new Uint8Array([1]));await first.dispose();await mask.dispose();
  }
  const coldBudget=new Budget(80*1024**2),session=await createTemporarySession({backend:'opfs',budget:coldBudget});let coldSurface,coldEngine,cold;
  try{const bytes=await createSegmentedBytes(data.length,{budget:coldBudget,storage:'memory'});await bytes.write(data);coldSurface=createRgbSurface(bytes,{width,height,budget:coldBudget});coldEngine=new PagedDenseImageEngine({surface:coldSurface,session},coldBudget,{maxWorkers:3});cold=await coldEngine.analyze({...params,profile:DENSE_PROFILES[2]});if(cold.metrics.parallel.resultStorage!=='temporary'||!cold.fields.every(field=>field.targets.storage==='temporary'&&field.distancesSquared.storage==='temporary'))throw Error('Cold result placement failed');if(crossOriginIsolated&&cold.metrics.parallel.workerJobs!==2)throw Error('Cold outputs incorrectly forced descriptor banks off shared RAM');const sample=new Uint8Array(32);await cold.fields[0].targets.readInto(sample);await cold.release();cold=null;await coldEngine.dispose();coldEngine=null;await coldSurface.dispose();coldSurface=null;await session.dispose();if(coldBudget.total())throw Error('Cold result ownership leak '+coldBudget.total());}
  finally{await cold?.release();await coldEngine?.dispose();await coldSurface?.dispose();await session.dispose();}
  if(budget.total())throw Error('Final budget leak');self.postMessage({result:{isolated:crossOriginIsolated,fields:11,metrics,cancelled:crossOriginIsolated,coldOpfs:true,accountedBytes:budget.total()}});
 }catch(error){self.postMessage({error:{code:error.code,message:error.message,stack:error.stack}});}
 finally{await result?.release();await reference?.release();await paged?.dispose();await direct?.dispose();await surface?.dispose();}
};
