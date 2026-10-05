import {Budget} from '../../../src/cache.js';
import {createSegmentedBytes,adoptSharedSegmentedBytes} from '../../../src/segmented-bytes.js';
const tick=()=>new Promise(r=>setImmediate(r));
async function collected(ref){for(let i=0;i<12;i++){await tick();global.gc();await tick();if(!ref.deref())return true;}return false;}
globalThis.crossOriginIsolated=true;
const session={backend:'opfs',async create(){return {async write(){},async readInto(target){target.fill(0)},async flush(){},async dispose(){}}}};
const retained=[];
for(const mode of ['regular','adopted']){
 const budget=new Budget(8*1024*1024);let store;
 if(mode==='regular'){store=await createSegmentedBytes(65536,{budget,shared:true,temporarySession:session});await store.write(new Uint8Array(65536));}
 else{let buffer=new SharedArrayBuffer(65536);store=await adoptSharedSegmentedBytes({byteLength:65536,chunkBytes:65536,segments:[[0,buffer]]},{budget,temporarySession:session,reservation:budget.reserve(65536)});buffer=null;}
 let publication=store.exportSharedReadOnly(),ref=new WeakRef(publication.descriptor.segments[0][1]);publication.release();retained.push(publication,store,budget);await store.spill();console.log(JSON.stringify({mode,retiredCollected:await collected(ref),ledger:budget.resourceSnapshot().domains['array-buffer'],budget:budget.total()}));await store.dispose();
}
const budget=new Budget(100000);let identity=new ArrayBuffer(65536),ref=new WeakRef(identity),handle=budget.registerBacking('array-buffer',65536,{identity});identity=null;handle();retained.push(handle,budget);console.log(JSON.stringify({mode:'registry-handle-retained',retiredCollected:await collected(ref),ledger:budget.resourceSnapshot().domains['array-buffer']}));
console.log('retained control objects',retained.length);
