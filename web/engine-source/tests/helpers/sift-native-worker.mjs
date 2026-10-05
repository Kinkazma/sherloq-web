import {parentPort,workerData} from 'node:worker_threads';
globalThis.self={};globalThis.postMessage=(message,transfer)=>parentPort.postMessage(message,transfer);
await import(workerData.module);
parentPort.on('message',data=>self.onmessage({data}));
