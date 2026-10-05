import {createWorkerEngine} from '../src/worker-client.js';
import {prnuLargeInput} from '../tests/prnu-large-input.js';
export async function prnuMemoryTest(){
 const f=await(await fetch('/fixtures/prnu-large-reference.json')).json(),pixels=prnuLargeInput(f),engine=createWorkerEngine({computeProfile:'maximum',memoryBudgetBytes:3*1024**3});
 try{
  await engine.load({id:'q',bytes:pixels.data,pixels});const db=new Uint8Array(await(await fetch('/fixtures/prnu-snapshot.h5')).arrayBuffer());await engine.loadPrnuDatabase({id:'db',bytes:db});
  const task={id:'large',imageId:'q',operation:'noise.prnu',params:{databaseId:'db'}},result=await engine.run(task);for(let i=0;i<f.scores.length;i++)if(result.data.scores[i].camera!==f.scores[i][0]||result.data.scores[i].score!==f.scores[i][1])throw new Error('8 MP native score parity');
  await engine.unload('q');await engine.load({id:'q',bytes:pixels.data,pixels});const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30);let cancelled;
  try{await engine.run(task,{signal:controller.signal});}catch(error){cancelled=error;}finally{clearTimeout(timer);}
  if(cancelled?.code!=='CANCELLED'||!cancelled.imagesCleared)throw new Error('Uncached 8 MP hard cancellation');
  const small=await(await fetch('/fixtures/prnu-reference.json')).json();await engine.load({id:'q',bytes:new Uint8Array(await(await fetch('/fixtures/'+small.query.file)).arrayBuffer())});await engine.loadPrnuDatabase({id:'db',bytes:db});const recovered=await engine.run(task);if(recovered.data.scores[0].score!==small.databases[0].scores[0][1])throw new Error('8 MP cancellation recovery');
  await engine.unload('q');await engine.unload('db');const released=(await engine.capabilities()).memory;if(released.activeReservationBytes||released.retainedBytes||released.cacheBytes)throw new Error('8 MP release');return {schema:1,status:'passed',width:f.width,height:f.height,scoresExact:true,metrics:result.metrics,cancellation:'Uncached 8 MP job terminated after 30 ms request; both sources reloaded and exact small query recovered',released};
 }finally{engine.dispose();}
}
