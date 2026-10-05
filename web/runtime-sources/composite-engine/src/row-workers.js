import {EngineError} from './errors.js';
// One owned input window per worker/batch. The caller admits all input/output
// leases and heaps and validates operation-specific output shapes and statistics.
export class RowWorkers{
 constructor(count,url,validate){this.workers=[];this.pending=new Set();this.validate=validate;try{for(let i=0;i<count;i++)this.workers.push(new Worker(url,{type:'module'}));}catch{this.clear();throw new EngineError('WORKER_RESOURCE','Row workers could not start.');}}
 call(index,input){
  const worker=this.workers[index];if(!worker)return Promise.reject(new EngineError('CANCELLED','Row workers stopped.'));
  return new Promise((resolve,reject)=>{
   this.pending.add(reject);
   worker.onmessage=({data})=>{this.pending.delete(reject);try{if(data.error)throw new EngineError(data.error,'Row worker failed.');this.validate(data,input);resolve(data);}catch(error){reject(error);}};
   worker.onerror=()=>{this.pending.delete(reject);reject(new EngineError('WORKER_FAILED','Row worker failed.'));};
   try{worker.postMessage(input,[input.image.data.buffer]);}catch(error){this.pending.delete(reject);reject(error);}
  });
 }
 clear(){for(const worker of this.workers)worker.terminate();this.workers=[];for(const reject of this.pending)reject(new EngineError('CANCELLED','Row workers stopped.'));this.pending.clear();}
}
