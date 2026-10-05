import {createWorkerEngine} from '../src/worker-client.js';import {storageInventory} from './source-api-browser.js';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
export async function segmentedBiomesGhostBrowserTest(){
 const ref=await(await fetch('/tests/data/segmented-biomes-native.json')).json(),payload=await(await fetch('/tests/data/segmented-biomes-native.bin')).arrayBuffer(),blob=await(await fetch('/'+ref.file)).blob(),before=await storageInventory(),engine=createWorkerEngine({memoryBudgetBytes:512*1024**2,resourceHints:{hardwareConcurrency:2}});
 try{await engine.loadBlob({id:'source',blob});const task={id:'ghost',imageId:'source',operation:'ela.biomes',params:{...ref.params,ghost:true}},result=await engine.run(task);
  // Full native reference covers the cell/background stages. Large Ghost
  // integration is an execution/cache test; its complete native oracle is small.
  for(const [key,field]of Object.entries(ref.fields)){if(['score','pre_background_score','labels'].includes(key))continue;const values=field.dtype==='u1'?new Uint8Array(payload,field.offset,field.bytes):field.dtype==='<i4'?new Int32Array(payload,field.offset,field.bytes/4):new Float32Array(payload,field.offset,field.bytes/4),actual=result.data[key];for(let i=0;i<values.length;i++)assert(Math.abs(actual[i]-values[i])<=(key==='content'?3e-7:0),'Large Ghost changed native base '+key+'/'+i);}
  assert(result.metrics.ghostPhasesComputed===1&&result.metrics.ghostScheduling.preflightExecutions===0,'Useful Ghost phase scheduling missing');assert(result.data.ghost_curves.length===ref.rows*ref.cols*71&&result.data.ghost_curves.every(Number.isFinite),'Ghost curves incomplete');
  const changed=await engine.run({...task,id:'threshold',params:{...task.params,threshold:1,minimum:1}});assert(changed.metrics.cellRecompressions===0&&changed.metrics.ghostPhasesComputed===0,'Threshold repeated preparation');await engine.unload('source');await engine.dispose();assert(JSON.stringify(before)===JSON.stringify(await storageInventory()),'Large biome Ghost storage leak');
  return {status:'passed',dimensions:[ref.width,ref.height],nativeCellAndBackground:true,largeGhostScope:'Execution, complete71-quality curves, cache and cleanup; full native Ghost-biome oracle is the separate small64-phase corpus',metrics:result.metrics,regions:result.data.regions.length,thresholdRecomputations:[changed.metrics.cellRecompressions,changed.metrics.ghostPhasesComputed],storageCleanup:true};
 }catch(error){await engine.dispose();throw error;}
}
