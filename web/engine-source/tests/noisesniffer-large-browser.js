import {createWorkerEngine} from '../src/worker-client.js';import {cvNoisesnifferStatistics} from '../src/opencv.js';
import {NoisesnifferPool} from '../src/noisesniffer-pool.js';import {Budget} from '../src/cache.js';
import {noisesnifferLargeInput} from './noisesniffer-large-input.js';import {noisesnifferParameters,noisesnifferRegionsEqual,noisesnifferExact} from './noisesniffer-corpus.js';
const sha=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(a.buffer,a.byteOffset,a.byteLength))),x=>x.toString(16).padStart(2,'0')).join('');
export async function noisesnifferLargeBrowser(){
 const ref=await(await fetch('/fixtures/noisesniffer-large-reference.json')).json(),image=noisesnifferLargeInput(ref),proof={schema:1,status:'passed',scope:'Functional 1 MP qualification, timing is not an isolated benchmark',cases:[]};
 if(await sha(image.data)!==ref.inputSha256)throw Error('Noisesniffer large recipe');
 const engine=createWorkerEngine({cpuKernel:'single'});
 try{await engine.load({id:'i',bytes:image.data,pixels:image});for(const f of ref.cases){
  const stats=await cvNoisesnifferStatistics(image,f.block);for(const [key,hash] of Object.entries(f.statistics))if(await sha(stats[key])!==hash)throw Error('Noisesniffer large statistics '+key);
  const result=await engine.run({id:'large',imageId:'i',operation:'noise.noisesniffer',params:noisesnifferParameters(f.parameters)});
  for(const [key,hash] of Object.entries(f.arrays))if(await sha(key==='overlay'?result.pixels.data:result.data[key])!==hash)throw Error('Noisesniffer large '+key);noisesnifferRegionsEqual(result.data.metadata.regions,f.regions);
  proof.cases.push({block:f.block,exact:true,memory:result.metrics.memory});
 }}finally{engine.dispose();}
 // Small odd dimensions test the exact halo/stride contract with real workers,
 // independent of the resource policy on this host.
 const small={width:71,height:67,format:'rgb8',data:image.data.slice(0,71*67*3)},budget=new Budget(1024**3),pool=new NoisesnifferPool(budget,{maxWorkers:4,minimumBenefit:.05});
 try{for(const block of [3,5,7,8]){const expected=await cvNoisesnifferStatistics(small,block);for(const count of [1,2,3]){pool.resize(count,pool.bytes(small,block,count));const actual=await pool.execute(small,block);for(const key of ['valid','means','variance'])noisesnifferExact(actual[key],expected[key],'Real DCT worker '+key);pool.clear();}}proof.forcedPartitionCases=12;}finally{pool.dispose();}if(budget.total())throw Error('Noisesniffer pool accounting leak');
 const cancellable=createWorkerEngine({resourceHints:{hardwareConcurrency:4},memoryBudgetBytes:1024**3});
 try{
  await cancellable.load({id:'i',bytes:image.data,pixels:image});const controller=new AbortController();let error,sawWorkers=false;
  try{await cancellable.run({id:'nested-cancel',imageId:'i',operation:'noise.noisesniffer',params:{blockSize:8}},{signal:controller.signal,onProgress:event=>{if(event.fraction===.2){sawWorkers=true;controller.abort();}}});}catch(e){error=e;}
  if(!sawWorkers||error?.code!=='CANCELLED'||!error.imagesCleared)throw Error('Noisesniffer cancellation during active nested workers');
  await cancellable.load({id:'i',bytes:small.data,pixels:small});const r=await cancellable.run({id:'recovered',imageId:'i',operation:'noise.noisesniffer'});if(r.status!=='ok')throw Error('Noisesniffer nested-worker recovery');proof.nestedCancellation='Cancelled after DCT worker dispatch; parent and sources reset; reloaded analysis completed';
 }finally{cancellable.dispose();}
 return proof;
}
