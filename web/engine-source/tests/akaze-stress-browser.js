import {createWorkerEngine} from '../src/worker-client.js';
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
export async function akazeStressBrowserTest(){
  const blob=await(await fetch('/.build/akaze-pipeline-study/large-checker.png')).blob();
  const engine=createWorkerEngine({memoryBudgetBytes:1024**3,cpuKernel:'auto'}),controller=new AbortController();
  let timer,progress=0,failure;
  try{
    const source=await engine.loadBlob({id:'image',blob});
    // Development watchdog only. It must never turn a timed-out calculation
    // into a claimed native refusal or a qualified scientific result.
    timer=setTimeout(()=>controller.abort(),180000);
    try{await engine.run({id:'stress',imageId:'image',operation:'tampering.copyMove.akaze'},{signal:controller.signal,onProgress:e=>{progress=e.fraction;}});}catch(error){failure=error;}
    clearTimeout(timer);
    ensure(failure?.code==='MEMORY_LIMIT','Expected explicit memory refusal; a watchdog timeout is not qualification: '+failure?.code);
    const memory=(await engine.capabilities()).memory;ensure(memory.activeReservationBytes===0,'Stress reservation cleanup');
    await engine.unload('image');const cleanup=(await engine.capabilities()).memory;
    ensure(!cleanup.retainedBytes&&!cleanup.cacheBytes&&!cleanup.activeReservationBytes,'Stress unload cleanup');
    return {schema:1,status:'explicit-budget-refusal',scope:'Browser shared-budget boundary only. Complete native pipeline remains unqualified; no native-outcome equivalence claim.',budgetBytes:1024**3,originalSha256:source.sha256,error:{code:failure.code,message:failure.message},lastProgress:progress,memory,cleanup};
  }finally{clearTimeout(timer);await engine.dispose();}
}
