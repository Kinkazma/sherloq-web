import {Budget} from '../src/cache.js';
import {createTemporarySession} from '../src/temporary-storage.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {runPagedDenseField} from '../src/dense-paged.js';
import {createDenseMath} from '../src/dense-math.js';
self.onmessage=async({data:{backend}})=>{
 const budget=new Budget(32*1024**2),owned=[];let session,result;
 try{
  session=await createTemporarySession({backend,budget});const width=43,height=31,n=width*height;
  const first=Float32Array.from({length:n*12},(_,i)=>Math.sin(i*1.7654)*.1),second=Float32Array.from(first,(_,i)=>first[(i+12*257)%first.length]);
  const mask=Uint8Array.from({length:n},(_,i)=>i%7===0?0:1+i%3);
  const planes=[];for(const a of [first,second,mask]){const s=await createSegmentedBytes(a.byteLength,{budget,temporarySession:session,storage:'temporary'});owned.push(s);await s.write(new Uint8Array(a.buffer));planes.push(s);}
  const options={compare:true,minimum:3,radius:31,iterations:2,gap:[7,-5]},begin=performance.now();
  result=await runPagedDenseField({width,height,first:planes[0],second:planes[1],mask:planes[2]}, {...options,budget,temporarySession:session,storage:'temporary',pageBytes:8192,cachePages:4});
  const milliseconds=performance.now()-begin,math=await createDenseMath(),expected=math.field(first,second,mask,width,height,options);
  for(const name of ['targets','distancesSquared']){const bytes=new Uint8Array(expected[name].buffer),actual=new Uint8Array(bytes.length);await result[name].readInto(actual);if(!bytes.every((v,i)=>v===actual[i]))throw Error(name+' differs');}
  if(result.comparisons!==expected.comparisons)throw Error('Comparison count differs');
  const proof={backend,milliseconds,metrics:result.metrics,comparisons:String(result.comparisons),peakAccountedBytes:budget.peak,bitExact:true};
  await result.dispose();result=null;await Promise.all(owned.map(s=>s.dispose()));await session.dispose();session=null;
  if(budget.total())throw Error('Memory ownership leak');self.postMessage({result:proof});
 }catch(e){self.postMessage({error:{message:e.message,code:e.code,stack:e.stack}});}
 finally{await result?.dispose();await Promise.allSettled(owned.map(s=>s.dispose()));await session?.dispose();}
};
