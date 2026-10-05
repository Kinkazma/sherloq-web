import {noisesnifferArray,noisesnifferExact,noisesnifferParameters,noisesnifferRegionsEqual} from './noisesniffer-corpus.js';
export async function noisesnifferLifecycle(factory,read){
 const ref=JSON.parse(new TextDecoder().decode(await read('noisesniffer-reference.json'))),f=ref.cases.find(c=>c.name==='small-patch-3'),a=f.analyses[4],bytes=await read(f.input.file),pixels={width:f.width,height:f.height,format:'rgb8',data:bytes.slice()},params=noisesnifferParameters(a.parameters),engine=factory();
 const task={id:'ns',imageId:'i',operation:'noise.noisesniffer',params};
 try{
  await engine.load({id:'i',bytes,pixels});pixels.data.fill(0);
  const result=await engine.run(task);noisesnifferExact(result.pixels.data,await noisesnifferArray(read,a.arrays.overlay),'Public overlay');noisesnifferRegionsEqual(result.data.metadata.regions,a.regions);
  if(result.metrics.cache.result)throw Error('First result cached');
  const saved=result.data.selected.slice();result.data.selected.fill(0);result.data.mask.fill(0);result.pixels.data.fill(0);
  for(const view of ['regions','mask','distribution']){
   const r=await engine.run({...task,params:{...params,view}});if(!r.metrics.cache.analysis)throw Error('View recomputed analysis');noisesnifferExact(r.data.selected,saved,'Owned cache');
   if(view!=='mask')noisesnifferExact(r.pixels.data,await noisesnifferArray(read,a.arrays[view==='regions'?'overlay':'distribution']),'Public '+view);
  }
  const changed=await engine.run({...task,params:{...params,lowNoiseFraction:.3}});if(changed.metrics.cache.result||!changed.metrics.cache.stages?.['statistics/3'])throw Error('Statistics stage cache invalidation');
  const differentBlock=await engine.run({...task,params:{...params,blockSize:5}});if(differentBlock.metrics.cache.stages?.['statistics/5'])throw Error('Different block statistics cache');
  for(const bad of [{blockSize:4},{lowNoiseFraction:1},{view:'unknown'},{hiddenScale:2}]){let error;try{await engine.run({...task,params:{...params,...bad}});}catch(e){error=e;}if(error?.code!=='INVALID_INPUT')throw Error('Invalid parameters accepted');}
  const clean=await engine.run(task),json=await engine.exportResult(clean,{format:'json',maxBytes:16*1024**2}),npz=await engine.exportResult(clean,{format:'npz'});
  if(JSON.parse(new TextDecoder().decode(json.bytes)).data.metadata.regions.length!==a.regions.length||npz.bytes[0]!==80||npz.bytes[1]!==75)throw Error('Noisesniffer exports');
  let rejected;try{await engine.exportResult(clean,{format:'npz',maxBytes:10});}catch(e){rejected=e;}if(rejected?.code!=='MEMORY_LIMIT')throw Error('Noisesniffer export budget');
  const original=await engine.original('i');original.fill(0);noisesnifferExact(await engine.original('i'),bytes,'Original ownership');
  await engine.unload('i');let memory=(await engine.capabilities()).memory;if(memory.retainedBytes||memory.cacheBytes||memory.activeReservationBytes)throw Error('Noisesniffer release');
  const inverted=Uint8Array.from(bytes,x=>255-x);await engine.load({id:'i',bytes,pixels:{width:f.width,height:f.height,format:'rgb8',data:inverted}});
  const reloaded=await engine.run(task);if(reloaded.metrics.cache.result||reloaded.metrics.cache.stages?.['statistics/3'])throw Error('Reload reused stale statistics');
  await engine.unload('i');memory=(await engine.capabilities()).memory;
  return {status:'passed',npzBytes:npz.bytes.length,memory,checks:'Public native positive result; owned inputs/results; view and statistics caches; parameter validation; same-byte/different-pixel reload; JSON/NPZ limits; originals and unload'};
 }finally{engine.dispose();}
}
