import {Budget} from '../src/cache.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {PagedDenseImageEngine} from '../src/dense-paged-image.js';
const equal=(a,b,label)=>{if(a.length!==b.length||!a.every((value,index)=>value===b[index]))throw Error(label+' differs');};
self.onmessage=async()=>{
 const budget=new Budget(384*1024**2),width=96,height=80,bytes=Uint8Array.from({length:width*height*3},(_,i)=>(i*19+(i/39|0)*37)%251),params={profile:'PatchMatch Zernike + PatchMatch SIFT + Mirror',patch:4,iterations:2,texture:0,coherence:false,radius:45,limit:40};let source,surface,baseline,resumable,reference,result;
 try{
  source=await createSegmentedBytes(bytes.length,{budget,shared:true});await source.write(bytes);surface=createRgbSurface(source,{width,height,budget});baseline=new PagedDenseImageEngine({surface},budget,{maxWorkers:2});reference=await baseline.analyze(params);
  resumable=new PagedDenseImageEngine({surface},budget,{maxWorkers:2});const completed=[];let interrupted=false;
  try{await resumable.analyze(params,{checkpointKey:'native-proof',onProgress:event=>{if(event.phase==='field-complete'){completed.push(event.pass.id);throw Error('validated field interruption');}}});}catch(error){if(error.message!=='validated field interruption')throw error;interrupted=true;}
  if(!interrupted||!completed.length)throw Error('No completed field was retained at interruption');const resumed=[];
  result=await resumable.analyze(params,{checkpointKey:'native-proof',onProgress:event=>{if(event.phase==='field-complete')resumed.push(event.pass.id);}});
  if(resumed.some(id=>completed.includes(id)))throw Error('Explicit resume recomputed a validated hypothesis');
  for(let i=0;i<reference.fields.length;i++){const a=reference.fields[i],b=result.fields[i];if(a.comparisons!==b.comparisons||a.uniqueLinks!==b.uniqueLinks)throw Error('Native checkpoint counters differ');equal(a.displayRows,b.displayRows,'display');for(const name of ['targets','distancesSquared','allowed','selected']){const x=new Uint8Array(a[name].byteLength),y=new Uint8Array(x.length);await a[name].readInto(x);await b[name].readInto(y);equal(x,y,name);}}
  await resumable.clearCheckpoint('native-proof');const sample=new Uint8Array(16);await result.fields[0].targets.readInto(sample);await result.release();result=null;await reference.release();reference=null;await baseline.dispose();baseline=null;await resumable.dispose();resumable=null;await surface.dispose();surface=null;source=null;if(budget.total())throw Error('Native checkpoint ownership leaked '+budget.total());
  self.postMessage({result:{passed:true,fields:4,completedBeforeInterruption:completed,resumedHypotheses:resumed,exactBytesAndCounters:true,budgetFinal:budget.total()}});
 }catch(error){self.postMessage({error:{code:error.code,message:error.message,stack:error.stack}});}
 finally{await result?.release();await reference?.release();await baseline?.dispose();await resumable?.dispose();await surface?.dispose();await source?.dispose();}
};
