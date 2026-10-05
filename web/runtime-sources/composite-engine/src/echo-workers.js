import {EngineError,requireValue} from './errors.js';
// The caller admits every fixed heap and live transfer before construction.
// One job per worker per batch; these workers never start internal pools.
export class EchoWorkers{
 constructor(count){
  this.workers=[];this.pending=new Set();
  try{for(let i=0;i<count;i++)this.workers.push(new Worker(new URL('./echo-worker.js',import.meta.url),{type:'module'}));}
  catch(error){this.clear();throw new EngineError('WORKER_RESOURCE','Echo workers could not start.');}
 }
 call(index,input){
  const worker=this.workers[index];if(!worker)return Promise.reject(new EngineError('CANCELLED','Echo workers stopped.'));
  return new Promise((resolve,reject)=>{
   this.pending.add(reject);
   worker.onmessage=({data})=>{this.pending.delete(reject);try{
    if(data.error)throw new EngineError(data.error,'Echo worker failed.');
    const length=input.kind==='derivatives'?input.image.width*input.rows*12:input.totalBytes/4;
    requireValue(data.bytes instanceof Uint8Array&&data.bytes.length===length,'Invalid Echo worker bytes.');
    if(input.kind==='derivatives')requireValue(data.limits instanceof Float64Array&&data.limits.length===6&&data.limits.every(Number.isFinite),'Invalid Echo worker extrema.');
    resolve(data);
   }catch(error){reject(error);}};
   worker.onerror=()=>{this.pending.delete(reject);reject(new EngineError('WORKER_FAILED','Echo worker failed.'));};
   try{const buffer=input.kind==='derivatives'?input.image.data.buffer:input.bytes.buffer;worker.postMessage(input,[buffer]);}
   catch(error){this.pending.delete(reject);reject(error);}
  });
 }
 clear(){for(const worker of this.workers)worker.terminate();this.workers=[];for(const reject of this.pending)reject(new EngineError('CANCELLED','Echo workers stopped.'));this.pending.clear();}
}
