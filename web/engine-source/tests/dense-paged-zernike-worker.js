import {Budget} from '../src/cache.js';
import {createTemporarySession} from '../src/temporary-storage.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {runPagedZernike} from '../src/dense-paged-zernike.js';
import {createDenseMath,denseGray} from '../src/dense-math.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
self.onmessage=async()=>{
 const width=512,height=384,n=width*height,budget=new Budget(64*1024**2);let session,image,mask,result;
 try{
  session=await createTemporarySession({backend:'opfs',budget});
  const store=await createSegmentedBytes(n*3,{budget,storage:'temporary',temporarySession:session});
  const fixture=()=>Uint8Array.from({length:n*3},(_,i)=>(i*37+(i/3|0)%17*23)%256);
  {const release=budget.reserve(n*3);try{await store.write(fixture());}finally{release();}}
  image={surface:createRgbSurface(store,{width,height,budget}),session};
  mask=await createSegmentedBytes(n,{budget,storage:'temporary',temporarySession:session});
  {const release=budget.reserve(n);try{await mask.write(new Uint8Array(n).fill(1));}finally{release();}}
  const options={budget,storage:'temporary',patch:8,reflection:true,minimum:5,radius:40,iterations:2,maxWorkers:4};
  const begin=performance.now();result=await runPagedZernike(image,mask,options);
  const proof={status:'passed',width,height,budgetBytes:budget.limit,milliseconds:performance.now()-begin,metrics:result.metrics,peakAccountedBytes:budget.peak,comparisons:String(result.comparisons),sha256:{}};
  for(const key of ['targets','distancesSquared']){const hash=await createSHA256();await result[key].visit(bytes=>hash.update(bytes));proof.sha256[key]=hash.digest('hex');}
  await result.dispose();result=null;await image.surface.dispose();image=null;await mask.dispose();mask=null;await session.dispose();session=null;if(budget.total())throw Error('Memory leak');
  // Independent reference begins after all measured bounded resources closed.
  const math=await createDenseMath(),descriptors=math.features(denseGray(fixture()),width,height,{method:0,patch:8,reflection:true}),expected=math.field(descriptors.first,descriptors.second,new Uint8Array(n).fill(1),width,height,options);
  for(const key of ['targets','distancesSquared']){const hash=await createSHA256();hash.update(expected[key]);if(hash.digest('hex')!==proof.sha256[key])throw Error(key+' reference mismatch');}
  if(String(expected.comparisons)!==proof.comparisons)throw Error('Comparison mismatch');self.postMessage({result:proof});
 }catch(e){self.postMessage({error:{message:e.message,code:e.code,stack:e.stack}});}
 finally{await result?.dispose();await image?.surface.dispose();await mask?.dispose();await session?.dispose();}
};
