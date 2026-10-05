import {Budget} from '../src/cache.js';
import {ElasticWorkerPool} from '../src/elastic-worker-pool.js';
self.onmessage=async()=>{
 const budget=new Budget(1024**2),events=[];let fail=false,submitted=0;
 const Type=new Proxy(Uint8Array,{construct(Type,args){if(typeof args[0]==='number'&&fail){fail=false;throw new RangeError('Array buffer allocation failed');}return Reflect.construct(Type,args);}});
 const url=URL.createObjectURL(new Blob(['onmessage=({data})=>{data.output.fill(data.input[0]+3);postMessage({result:data},[data.input.buffer,data.output.buffer]);};'],{type:'text/javascript'}));
 const pool=new ElasticWorkerPool(budget,{maxWorkers:1,workerBytes:65536,workBuffers:{input:{Type,length:64},output:{length:16}},workerFactory:()=>new Worker(url)});
 const run=()=>pool.run(1,{prepare:async(_index,{buffers})=>{buffers.input.fill(21);submitted++;return {message:buffers,transfer:[buffers.input.buffer,buffers.output.buffer],ack:(result,{takeBackBuffer})=>{for(const key of ['input','output'])takeBackBuffer(key,result[key].buffer);}};},consume:async(_index,result)=>{if(result.output.some(value=>value!==24))throw Error('Wrong computed bytes');},onProgress:event=>events.push(event)});
 try{await run();await budget.reclaimAllocation(80,{kind:'array-buffer'});fail=true;await run();const failures=events.filter(event=>event.phase==='resource-recovery');if(failures.length!==1||failures[0].error.code!=='MEMORY_ALLOCATION'||failures[0].error.cause.message!=='Array buffer allocation failed'||pool.metrics.created!==1||submitted!==2)throw Error('Recovery repeated work or discarded cause');pool.dispose();if(budget.total())throw Error('Leaked ownership');postMessage({result:{passed:true,submitted,workersCreated:pool.metrics.created,recoveries:failures.length,finalBytes:budget.total(),error:failures[0].error}});}catch(error){postMessage({error:{message:error.message,stack:error.stack}});}finally{pool.dispose();URL.revokeObjectURL(url);}
};
