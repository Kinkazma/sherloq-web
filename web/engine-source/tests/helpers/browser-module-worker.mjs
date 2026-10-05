// Run the production browser worker handler in a real Node worker for small
// native admission regressions; no replacement arithmetic or worker results.
import {parentPort,workerData} from 'node:worker_threads';
globalThis.self={postMessage:(message,transfer)=>parentPort.postMessage(message,transfer)};
await import(workerData.module);
parentPort.on('message',data=>self.onmessage({data}));
