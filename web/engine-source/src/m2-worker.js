import {createM2WorkerHost} from './m2-worker-host.js';
const host=createM2WorkerHost({post:(message,transfer)=>self.postMessage(message,transfer)});
self.onmessage=({data})=>host.handle(data);
