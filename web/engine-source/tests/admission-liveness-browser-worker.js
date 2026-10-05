import {Budget} from '../src/cache.js';
import {getExecutionScheduler} from '../src/execution-scheduler.js';
import {ForgeryscopePreparation} from '../src/forgeryscope-preparation.js';
const assert=(value,message)=>{if(!value)throw Error(message);};
const budget=new Budget(100),scheduler=getExecutionScheduler(budget,{maxWorkers:2});
const preparation=new ForgeryscopePreparation(budget,()=>{throw Error('No preparation requested');});
try{
 const producer=budget.beginOperation({owner:'d2prl'}),waiter=budget.beginOperation({owner:'sift'});
 const held=await scheduler.acquire({cpu:1,bytes:80,operation:producer});let executions=0,timerRan=false;
 const pending=scheduler.run({cpu:1,bytes:30,operation:waiter},()=>++executions);
 // A real task event must survive the admission/reclaimer microtasks. The old
 // bug starves this timer; the browser test's parent can still terminate it.
 setTimeout(()=>{timerRan=true;held.release();},25);
 await pending;assert(timerRan&&executions===1,'Useful work failed to resume exactly once');producer.release();waiter.release();
 const cpuOwner=budget.beginOperation({owner:'cpu'}),gpuOwner=budget.beginOperation({owner:'gpu'}),operation=budget.beginOperation({owner:'both'});
 const cpu=await scheduler.acquire({cpu:2,operation:cpuOwner}),gpu=await scheduler.acquire({cpu:0,gpu:1,operation:gpuOwner});
 const cpuWait=scheduler.acquire({cpu:1,operation}),gpuWait=scheduler.acquire({cpu:0,gpu:1,operation});
 setTimeout(()=>{cpu.release();gpu.release();},25);
 const leases=await Promise.all([cpuWait,gpuWait]);assert(scheduler.snapshot().active.cpu===1&&scheduler.snapshot().active.gpu===1,'Concurrent grants were lost');leases.forEach(lease=>lease.release());cpuOwner.release();gpuOwner.release();operation.release();
 preparation.dispose();assert(budget.total()===0&&budget.resourceSnapshot().operations.length===0,'Resources leaked');
 postMessage({passed:true,realTimerSurvived:true,emptyReclaimer:true,concurrentCpuGpu:true,executions,memory:budget.snapshot()});
}catch(error){postMessage({passed:false,message:error.message,stack:error.stack});}
finally{scheduler.dispose();}
