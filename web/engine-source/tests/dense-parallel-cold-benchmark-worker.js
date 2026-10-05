import {Budget} from '../src/cache.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {runPagedDenseField} from '../src/dense-paged.js';
self.onmessage=async({data})=>{
 const started=performance.now(),width=data.width??512,height=data.height??512,dimensions=data.dimensions??12,n=width*height,budget=new Budget(768*1024**2),owned=[];let field;
 const make=async(seed)=>{const values=new Float32Array(n*dimensions);let state=seed;for(let i=0;i<values.length;i++){state^=state<<13;state^=state>>>17;state^=state<<5;values[i]=Math.fround((state>>>0)/4294967296);}const store=await createSegmentedBytes(values.byteLength,{budget,shared:true});owned.push(store);await store.write(new Uint8Array(values.buffer));return store;};
 try{
  const first=await make(17827),second=await make(59123),mask=await createSegmentedBytes(n,{budget,shared:true});owned.push(mask);await mask.write(new Uint8Array(n).fill(1));const prepared=performance.now();
  field=await runPagedDenseField({first,second,mask,width,height,dimensions},{budget,workspaceBytes:512*1024**2,parallelism:data.parallelism,maxParallelism:data.parallelism,iterations:2,radius:128,minimum:5,seed:729,storage:'memory'});const solved=performance.now(),hashes={};
  for(const key of ['targets','distancesSquared']){const bytes=new Uint8Array(field[key].byteLength);await field[key].readInto(bytes);const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));hashes[key]=Array.from(hash,byte=>byte.toString(16).padStart(2,'0')).join('');}
  const result={width,height,dimensions,parallelism:data.parallelism,preparationMs:prepared-started,solveMs:solved-prepared,totalWorkerMs:performance.now()-started,comparisons:String(field.comparisons),hashes,metrics:field.metrics};await field.dispose();field=null;await Promise.all(owned.map(store=>store.dispose()));result.completeMs=performance.now()-started;result.finalBudget=budget.total();self.postMessage({result});
 }catch(error){self.postMessage({error:{code:error.code,message:error.message,stack:error.stack}});}finally{await field?.dispose();await Promise.allSettled(owned.map(store=>store.dispose()));}
};
