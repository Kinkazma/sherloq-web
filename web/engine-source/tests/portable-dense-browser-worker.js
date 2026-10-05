import {Budget} from '../src/cache.js';
import {createSegmentedBytes,markColdStoredResults} from '../src/segmented-bytes.js';
import {createTemporarySession} from '../src/temporary-storage.js';
import {DensePagedFieldPool} from '../src/dense-paged-field-pool.js';
import {runPagedDenseField} from '../src/dense-paged.js';
import {exportByteStore,readByteStore} from '../src/portable-byte-store.js';
import {storageInventory} from './source-api-browser.js';
const MiB=1024**2,assert=(value,message)=>{if(!value)throw Error(message);};
self.onmessage=async({data})=>{
 const width=64,height=48,n=width*height,budget=new Budget(192*MiB),owned=[];let session;
 try{
  const beforeStorage=await storageInventory();
  session=await createTemporarySession({budget,backend:data.backend??'opfs'});
  const descriptors=await createSegmentedBytes(n*48,{budget,storage:'temporary',temporarySession:session}),mask=await createSegmentedBytes(n,{budget,storage:'temporary',temporarySession:session});owned.push(descriptors,mask);
  const floats=Float32Array.from({length:n*12},(_,i)=>((i%((width/2)*12))*29+(i/(width*12)|0)*11)%251/251);await descriptors.write(new Uint8Array(floats.buffer));await mask.write(new Uint8Array(n).fill(1));
  let second=descriptors;if(data.gpu){second=await createSegmentedBytes(n*48,{budget,storage:'temporary',temporarySession:session});owned.push(second);await second.write(new Uint8Array(Float32Array.from(floats,x=>Math.fround(1-x)).buffer));}
  const input={first:descriptors,second,mask,width,height,dimensions:12},settings={iterations:2,radius:32,minimum:5,storage:'temporary',budget,temporarySession:session},reference=await runPagedDenseField(input,settings);owned.push(reference);
  const poolSettings={...settings,enableDenseGpu:!!data.gpu,storage:data.outputStorage??'temporary',temporarySession:data.outputStorage==='memory'?undefined:session},pool=new DensePagedFieldPool(budget,{maxWorkers:2,forceBroker:!!data.forceBroker}),jobs=[pool.start(input,poolSettings),pool.start(input,{...poolSettings,seed:729})];assert(jobs.every(Boolean),'OPFS inputs declined worker admission');const results=await Promise.all(jobs);owned.push(...results);
  assert(pool.peakWorkers===2&&pool.jobs===2,'Paged workers did not overlap');
  for(const result of results){assert(result.metrics.worker,'Local serial fallback');assert(result.targets.storage===(data.outputStorage??'temporary'),'Unexpected worker output residency');assert(result.comparisons===reference.comparisons,'Comparison counts differ');for(const key of ['targets','distancesSquared']){const a=new Uint8Array(result[key].byteLength),b=new Uint8Array(reference[key].byteLength);await result[key].readInto(a);await reference[key].readInto(b);assert(a.every((value,index)=>value===b[index]),key+' differs');}}
  if(data.gpu)for(const result of results)assert(result.metrics.denseDistanceGpu.sharedBatches>0&&result.metrics.denseDistanceGpu.sharedExecutorsCreated===1,'GPU executor was unavailable or duplicated: '+JSON.stringify(result.metrics.denseDistanceGpu));
  const transports=results.map(result=>result.metrics.inputTransports);if(data.expectReadOnly&&!data.forceBroker&&data.backend!=='indexeddb')assert(transports.flat().every(kind=>kind==='opfs-readonly'),'Chromium readonly OPFS not used');if(data.forceBroker)assert(transports.flat().every(kind=>kind==='broker'),'Portable broker not used');
  if(data.outputStorage==='memory'){await budget.reclaim(budget.limit,{});for(const result of results){assert(result.targets.storage==='temporary'&&result.distancesSquared.storage==='temporary','Delivered shared outputs could not migrate');const actual=new Uint8Array(result.targets.byteLength),expected=new Uint8Array(reference.targets.byteLength);await result.targets.readInto(actual);await reference.targets.readInto(expected);assert(actual.every((v,i)=>v===expected[i]),'Delivered output migration changed targets');}}
  const cold=await createSegmentedBytes(8*MiB,{budget,temporarySession:session,storage:'memory',shared:true});owned.push(cold);const sample=new Uint8Array([3,4,5]);await cold.write(sample,123);markColdStoredResults({result:{store:cold}});const before=budget.total();await budget.reclaim(budget.limit,{ });assert(cold.storage==='temporary','Finished result did not spill');assert(budget.total()<=before-8*MiB,'Cold result memory retained');const out=new Uint8Array(3);await cold.readInto(out,123);assert(out.every((v,i)=>v===sample[i]),'Cold result bytes lost');
  for(const value of owned.reverse())await (value.dispose?.()??value.release?.());owned.length=0;await session.dispose();assert(budget.total()===0,'Owned bytes leaked '+budget.total());
  const after=await storageInventory();assert(JSON.stringify(beforeStorage)===JSON.stringify(after),'Temporary sessions leaked');self.postMessage({result:{isolated:crossOriginIsolated,backend:session.backend,forceBroker:!!data.forceBroker,workers:pool.peakWorkers,gpu:data.gpu?results.map(r=>r.metrics.denseDistanceGpu):undefined,transports,coldSpill:true,adoptedOutputSpill:data.outputStorage==='memory',accountedBytes:budget.total(),storageArtifactsRemaining:after.length-beforeStorage.length}});
 }catch(error){self.postMessage({error:{code:error.code,message:error.message,stack:error.stack}});}finally{for(const value of owned.reverse())await (value.dispose?.()??value.release?.());await session?.dispose();}
};
