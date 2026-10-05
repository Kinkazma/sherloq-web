import {packDenseCorrespondences} from '../src/dense-correspondences.js';
import {Budget} from '../src/cache.js';import {createTemporarySession} from '../src/temporary-storage.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';import {PagedDenseImageEngine} from '../src/dense-paged-image.js';import {DenseImageEngine} from '../src/dense-image.js';import {DENSE_PROFILES} from '../src/dense-profiles.js';
self.onmessage=async()=>{const budget=new Budget(128*1024**2),width=119,height=101,n=width*height,data=Uint8Array.from({length:n*3},(_,i)=>(i*37+(i/3|0)%17*23)%256);let session,image,engine,result,previous;try{
 session=await createTemporarySession({backend:'opfs',budget});const store=await createSegmentedBytes(data.length,{budget,storage:'temporary',temporarySession:session});await store.write(data);image={surface:createRgbSurface(store,{width,height,budget}),session};engine=new DenseImageEngine(image,budget,{maxWorkers:4});const proof=[];
 for(const profile of [DENSE_PROFILES[0],DENSE_PROFILES[2]]){
  const params={profile,patch:8,iterations:2,radius:80,flip:true,texture:2,limit:250};
  for(const extra of [{},{threshold:.2,coherence:false,limit:90}]){
   result=await engine.analyze({...params,...extra});
   const referenceBudget=new Budget(512*1024**2),reference=new DenseImageEngine({width,height,data},referenceBudget,{maxWorkers:4}),expected=await reference.analyze({...params,...extra});
   try{if(result.fields.length!==expected.fields.length)throw Error('Field count');
    for(let i=0;i<result.fields.length;i++){const a=result.fields[i],b=expected.fields[i];if(a.comparisons!==b.comparisons||a.uniqueLinks!==b.uniqueLinks)throw Error('Counters');if(a.displayRows.length!==b.displayRows.length||!a.displayRows.every((v,i)=>v===b.displayRows[i]))throw Error('Display rows');for(const key of ['targets','distancesSquared','allowed','selected',...(b.errors?['errors']:[])]){const bytes=new Uint8Array(b[key].buffer),actual=new Uint8Array(bytes.length);await a[key].readInto(actual);if(!actual.every((v,j)=>v===bytes[j]))throw Error('Stored '+key+' differs');}}
    const packed=await packDenseCorrespondences(result,{width,height},{budget}),referencePacked=await packDenseCorrespondences(expected,{width,height},{budget:referenceBudget});
    try{for(let i=0;i<packed.passes.length;i++){const a=packed.passes[i],b=referencePacked.passes[i];for(const key of ['points','pairs','members','pairSearchRegions']){const aa=new Uint8Array(a[key].buffer),bb=new Uint8Array(b[key].buffer);if(aa.length!==bb.length||!aa.every((v,j)=>v===bb[j]))throw Error('Packed '+key+' differs');}if(a.denseCount!==b.denseCount||a.consistentCount!==b.consistentCount)throw Error('Packed counts differ');}}finally{packed.release();referencePacked.release();}
   }finally{expected.release();reference.dispose();}
   proof.push({profile,refilter:!!extra.threshold,fields:result.fields.length,links:result.fields.map(f=>f.uniqueLinks),metrics:result.metrics});await previous?.release();previous=result;result=null;
  }
 }
 await engine.dispose();engine=null;await previous.release();previous=null;await image.surface.dispose();image=null;await session.dispose();session=null;if(budget.total())throw Error('Budget leak '+budget.total());self.postMessage({result:proof});
}catch(e){self.postMessage({error:{message:e.message,code:e.code,stack:e.stack}});}finally{await result?.release();await previous?.release();await engine?.dispose();await image?.surface.dispose();await session?.dispose();}};
