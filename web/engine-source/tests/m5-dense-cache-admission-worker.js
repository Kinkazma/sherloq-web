import {Budget} from '../src/cache.js';
import {createTemporarySession} from '../src/temporary-storage.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {runPagedDenseField} from '../src/dense-paged.js';
self.onmessage=async()=>{
 const budget=new Budget(512*1024**2),width=1024,height=768,n=width*height;
 let session,first,mask,field,peer;let code;
 try{
  session=await createTemporarySession({backend:'opfs',budget});const options={budget,storage:'temporary',temporarySession:session};
  first=await createSegmentedBytes(n*48,options);mask=await createSegmentedBytes(n,options);
  const row=new Float32Array(width*12);for(let y=0;y<height;y++){for(let x=0;x<width;x++){let state=(y*512+x%512+1)>>>0;for(let k=0;k<12;k++){state^=state<<13;state^=state>>>17;state^=state<<5;row[x*12+k]=(state>>>0)/4294967296;}}await first.write(new Uint8Array(row.buffer),y*width*48);}
  await first.flush();await mask.write(new Uint8Array(n).fill(1));await mask.flush();
  try{
   field=await runPagedDenseField({first,mask,width,height},{...options,residentPool:true,initialBatchPixels:65536,minimum:5,radius:1400,iterations:1,onProgress:()=>{if(!peer)peer=budget.reserve(budget.limit-budget.total()-8*1024**2);}});
   throw Error('Expected memory pressure during cache migration');
  }catch(error){if(error.code!=='MEMORY_LIMIT')throw error;code=error.code;}
  peer?.();peer=null;await first.dispose();first=null;await mask.dispose();mask=null;await session.dispose();session=null;
  if(budget.total())throw Error('Memory reservation leaked');if(budget.peak>budget.limit)throw Error('Shared budget exceeded');
  self.postMessage({result:{passed:true,code,peak:budget.peak,limit:budget.limit,final:budget.total(),scope:'Actual WASM cache migration refuses extra heap under newly admitted peer pressure, preserves MEMORY_LIMIT identity, and cleans up.'}});
 }catch(error){self.postMessage({error:{message:error.message,code:error.code,stack:error.stack}});}
 finally{peer?.();await field?.dispose();await first?.dispose();await mask?.dispose();await session?.dispose();}
};
