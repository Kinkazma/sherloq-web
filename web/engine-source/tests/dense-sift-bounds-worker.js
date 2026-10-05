import {Budget} from '../src/cache.js';
import {createTemporarySession} from '../src/temporary-storage.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {preparePagedSift} from '../src/dense-paged-sift.js';
import {runPagedDenseCoherence} from '../src/dense-paged-coherence.js';
import {runPagedDenseField} from '../src/dense-paged.js';
import {createDenseMath,denseGray} from '../src/dense-math.js';
self.onmessage=async()=>{
 const budget=new Budget(64*1024**2),proof=[];let session,image,first,second,mask,result,coherence;
 try{
  session=await createTemporarySession({backend:'opfs',budget});const width=157,height=139,n=width*height,fixture=()=>Uint8Array.from({length:n*3},(_,i)=>(i*37+(i/3|0)%17*23)%256),store=await createSegmentedBytes(n*3,{budget,storage:'temporary',temporarySession:session});await store.write(fixture());image={surface:createRgbSurface(store,{width,height,budget}),session};
  for(const {patch,target,support,mirror,quarter} of [{patch:8,target:8,support:8,mirror:false,quarter:false},{patch:8,target:10,support:10,mirror:true,quarter:true}]){
   const begin=performance.now(),options={budget,storage:'temporary',support,maxWorkers:4,fullBounds:true};
   first=await preparePagedSift(image,{...options,patch,quarter:true});second=patch===target&&!mirror?first:await preparePagedSift(image,{...options,patch:target,mirror,quarter:true});
   first.quarter=quarter;second.quarter=quarter;
   const w=first.viewWidth,h=first.viewHeight,values=new Uint8Array(w*h).fill(1);mask=await createSegmentedBytes(values.length,{budget,storage:'temporary',temporarySession:session});await mask.write(values);
   const params={minimum:5,radius:100,iterations:2};result=await runPagedDenseField({width:w,height:h,first,second,mask},{...options,...params,temporarySession:session,pagedSiftBounds:true,residentSiftBounds:!mirror,initialBatchPixels:257,pageBytes:4096,cachePages:256});
   const got={targets:new Int32Array(w*h),distancesSquared:new Float32Array(w*h),allowed:new Uint8Array(w*h)};
   for(const key of Object.keys(got))await result[key].readInto(new Uint8Array(got[key].buffer));
   coherence=await runPagedDenseCoherence(result,{...options,temporarySession:session,radius:3,minimum:6});
   const accepted={selected:new Uint8Array(w*h),errors:new Float32Array(w*h)};
   for(const key of Object.keys(accepted))await coherence[key].readInto(new Uint8Array(accepted[key].buffer));
   const row={coherence:coherence.metrics,patch,target,support,mirror,quarter,milliseconds:performance.now()-begin,metrics:result.metrics,preparation:first.metrics,comparisons:String(result.comparisons),peakAccountedBytes:budget.peak};
   await coherence.dispose();coherence=null;await result.dispose();result=null;await first.dispose();if(second!==first)await second.dispose();first=second=null;await mask.dispose();mask=null;
   const math=await createDenseMath({print:()=>{}}),gray=denseGray(fixture());math.compactPrepare(gray,width,height,{patch,support,quarterTurn:quarter,slot:0});if(mirror||target!==patch)math.compactPrepare(gray,width,height,{patch:target,support,reflection:mirror,quarterTurn:quarter,slot:1});
   const expected=math.compactField(values,w,h,{...params,second:mirror||target!==patch?1:0});
   for(const key of Object.keys(got)){const a=new Uint8Array(got[key].buffer),b=new Uint8Array(expected[key].buffer);if(!a.every((v,i)=>v===b[i]))throw Error(key+' differs, '+JSON.stringify(row));}
   const referenceCoherence=math.coherence(expected.targets,expected.distancesSquared,w,h,{radius:3,minimum:6});
   for(const key of Object.keys(accepted)){const a=new Uint8Array(accepted[key].buffer),b=new Uint8Array(referenceCoherence[key].buffer);if(!a.every((v,i)=>v===b[i]))throw Error('Coherence '+key+' differs');}
   if(row.comparisons!==String(expected.comparisons))throw Error('Comparison count differs');proof.push({...row,bitExact:true});math.compactRelease();
  }
  await image.surface.dispose();image=null;await session.dispose();session=null;if(budget.total())throw Error('Memory leak');self.postMessage({result:proof});
 }catch(e){self.postMessage({error:{message:e.message,code:e.code,stack:e.stack}});}
 finally{await coherence?.dispose();await result?.dispose();await first?.dispose();if(second!==first)await second?.dispose();await mask?.dispose();await image?.surface.dispose();await session?.dispose();}
};
