import {Budget} from '../src/cache.js';
import {createTemporarySession} from '../src/temporary-storage.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {runPagedDenseField} from '../src/dense-paged.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
self.onmessage=async()=>{
 const width=1024,height=768,n=width*height,budget=new Budget(512*1024**2);let session,first,mask,field;
 try{
  session=await createTemporarySession({backend:'opfs',budget});
  const options={budget,storage:'temporary',temporarySession:session};
  first=await createSegmentedBytes(n*48,options);mask=await createSegmentedBytes(n,options);
  const row=new Float32Array(width*12);for(let y=0;y<height;y++){for(let x=0;x<width;x++){let state=(y*512+x%512+1)>>>0;for(let k=0;k<12;k++){state^=state<<13;state^=state>>>17;state^=state<<5;row[x*12+k]=(state>>>0)/4294967296;}}await first.write(new Uint8Array(row.buffer),y*width*48);}
  await first.flush();await mask.write(new Uint8Array(n).fill(1));await mask.flush();
  const rows=[];
  for(const cachePages of [undefined]){
   const begin=performance.now();let last='';
   field=await runPagedDenseField({first,mask,width,height},{...options,cachePages,residentPool:true,initialBatchPixels:65536,minimum:5,radius:1400,iterations:1,onProgress:p=>{const stage=p.stage+':'+p.iteration;if(stage!==last){last=stage;self.postMessage({progress:{cachePages,stage,seconds:(performance.now()-begin)/1000}});}}});
   const milliseconds=performance.now()-begin,hashes={};
   for(const key of ['targets','distancesSquared']){const hash=await createSHA256();await field[key].visit(b=>hash.update(b));hashes[key]=hash.digest('hex');}
   rows.push({cachePages,milliseconds,comparisons:String(field.comparisons),hashes,metrics:field.metrics});self.postMessage({progress:rows.at(-1)});await field.dispose();field=null;
  }
  if(rows[0].comparisons!=='16427193'||rows[0].hashes.targets!=='8f7802fd6fd04011970ead067648d74cb3f3f4b3b4849a19e1ec654ce2dece6a'||rows[0].hashes.distancesSquared!=='d5121377350b32e2c229454bac367be08c64d702fe741645ba48ff5d330adb4b')throw Error('Adaptive cache changes result');
  await first.dispose();first=null;await mask.dispose();mask=null;await session.dispose();session=null;
  if(budget.total())throw Error('Memory leak');self.postMessage({result:{width,height,iterations:1,rows,peak:budget.peak,final:budget.total(),scope:'Isolated real paged Zernike matcher with synthetic full descriptors; not full image pipeline or 96 MP latency estimate.'}});
 }catch(e){self.postMessage({error:{message:e.message,stack:e.stack}});}finally{await field?.dispose();await first?.dispose();await mask?.dispose();await session?.dispose();}
};
