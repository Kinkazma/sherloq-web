import {pagedJpegDctHistograms} from '../src/jpeg-dct-paged.js';
import {createTemporarySession} from '../src/temporary-storage.js';
import {createBlobSource} from '../src/blob-source.js';
import {Budget} from '../src/cache.js';
self.onmessage=async()=>{try{
 const blob=await(await fetch('/fixtures/double-jpeg-progressive.jpg')).blob(),ref=(await(await fetch('/fixtures/double-jpeg-reference.json')).json()).cases.find(item=>item.name==='progressive'),results=[];
 for(const backend of ['opfs','indexeddb']){
  const budget=new Budget(96*1024**2),source=createBlobSource(blob,{budget}),session=await createTemporarySession({backend,budget});
  try{const {histograms:hist,metrics}=await pagedJpegDctHistograms(source,{budget,getTemporarySession:async()=>session,cacheBytes:65536});
   if(!hist[3]||!metrics.coefficientStores)throw Error('Progressive external coefficients required');
   for(let i=0;i<9;i++){const at=4+i*258,expected=ref.expected.records[i];if(hist[at]!==expected.current_step||hist[at+1]!==expected.ignored_tail||Array.from(hist.subarray(at+2,at+258)).some((n,j)=>n!==expected.histogram[j]))throw Error(backend+' histogram '+i);}
   if(budget.total()!==0||session.snapshot().reservedBytes!==0)throw Error('Coefficient storage ownership leak');results.push({backend,exactNativeHistograms:9,...metrics});
  }finally{source.dispose();await session.dispose();}
 }
 self.postMessage({results});
}catch(error){self.postMessage({error:{message:error.message,stack:error.stack}});}};
