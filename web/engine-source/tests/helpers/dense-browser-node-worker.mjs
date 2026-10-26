// Test-only browser Worker transport in real Node worker threads. Product
// kernels and messages run unchanged. The test declares an isolated SAB
// environment so the browser-owned storage fallback is tested in browsers.
import {parentPort,workerData,Worker as NativeWorker} from 'node:worker_threads';
export class BrowserNodeWorker{
 constructor(module){this.worker=new NativeWorker(new URL('./dense-browser-node-worker.mjs',import.meta.url),{workerData:{module:String(module)}});this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.({message:error.message,error}));}
 postMessage(data,transfer){this.worker.postMessage(data,transfer);}
 terminate(){void this.worker.terminate();}
}
if(parentPort){globalThis.self=globalThis;globalThis.Worker=BrowserNodeWorker;globalThis.crossOriginIsolated=true;globalThis.postMessage=(data,transfer)=>parentPort.postMessage(data,transfer);await import(workerData.module);parentPort.on('message',data=>globalThis.onmessage({data}));}
